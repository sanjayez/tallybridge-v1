"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const checkpointRoot = path.join(repoRoot, "runlogs", "checkpoints");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const checkpointDir = path.join(checkpointRoot, timestamp);
const controlPlanePort = 8123;
const mockTallyPort = 9123;
const loopbackPort = 22567;
const controlPlaneUrl = `http://127.0.0.1:${controlPlanePort}`;
const mockTallyUrl = `http://127.0.0.1:${mockTallyPort}`;
const latestReportPath = path.join(checkpointRoot, "latest.json");
const historyPath = path.join(checkpointRoot, "history.jsonl");

fs.mkdirSync(checkpointDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, { method = "GET", body = null, token = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error || `HTTP ${response.status}`);
  }
  return parsed;
}

async function requestText(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  return text;
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stderr.write(text);
  });

  return {
    child,
    logs,
    stop() {
      if (!child.killed) {
        child.kill();
      }
    },
  };
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep waiting
    }
    await sleep(300);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForCommandCompletion(commandId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const command = await requestJson(`${controlPlaneUrl}/v1/commands/${commandId}`);
    if (command.data.status === "completed" || command.data.status === "failed") {
      return command.data;
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for command ${commandId}`);
}

async function runInstallerDryRun(pairingCode) {
  return new Promise((resolve, reject) => {
    const installer = spawn(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(repoRoot, "installer", "windows", "install-bridge.ps1"),
        "-ServerUrl",
        controlPlaneUrl,
        "-PairingCode",
        pairingCode,
        "-DryRun",
      ],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let output = "";
    installer.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    installer.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    installer.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(output || `Installer dry-run failed with code ${code}`));
    });
  });
}

async function postLoopbackEvent(port) {
  const response = await fetch(`http://127.0.0.1:${port}/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      schema_version: "v1",
      type: "voucher.saved",
      company: "Sanforge Solutions",
      object_type: "voucher",
      master_id: "VCH-001",
      alter_id: "1",
      ts: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Loopback event failed with ${response.status}`);
  }
}

async function main() {
  const report = {
    checkpointAt: new Date().toISOString(),
    checkpointDir,
    steps: [],
  };
  const processes = [];

  function recordStep(name, status, details = {}) {
    report.steps.push({
      name,
      status,
      at: new Date().toISOString(),
      details,
    });
  }

  try {
    recordStep("prepare", "completed", { checkpointDir });

    const controlPlane = spawnProcess(process.execPath, ["src/control-plane.js"], {
      env: {
        BRIDGE_PORT: String(controlPlanePort),
        TALLYBRIDGE_DB_PATH: path.join(checkpointDir, "control-plane.db"),
        TALLYBRIDGE_PUBLIC_BASE_URL: controlPlaneUrl,
      },
    });
    processes.push(controlPlane);
    await waitForHttp(controlPlaneUrl);
    recordStep("start_control_plane", "completed", { controlPlaneUrl });

    const externalCustomerId = `checkpoint-customer-${timestamp}`;
    const connectionResponse = await requestJson(`${controlPlaneUrl}/v1/connections`, {
      method: "POST",
      body: {
        tenantId: "checkpoint-tenant",
        externalCustomerId,
        metadata: {
          checkpoint: timestamp,
        },
      },
    });
    const repairResponse = await requestJson(`${controlPlaneUrl}/v1/connections`, {
      method: "POST",
      body: {
        tenantId: "checkpoint-tenant",
        externalCustomerId,
        metadata: {
          checkpoint: timestamp,
          repairCheck: true,
        },
      },
    });

    if (connectionResponse.data.id !== repairResponse.data.id) {
      throw new Error("Idempotent connection creation returned different connection ids");
    }

    const connection = repairResponse.data;
    recordStep("create_connection_idempotent", "completed", {
      connectionId: connection.id,
      firstPairingCode: connectionResponse.data.pairingCode,
      repairPairingCode: repairResponse.data.pairingCode,
      createdFirst: connectionResponse.meta.created,
      createdSecond: repairResponse.meta.created,
    });

    const bootstrapScript = await requestText(`${controlPlaneUrl}/install/${connection.pairingCode}?dryRun=1`);
    if (!bootstrapScript.includes("install-bridge.ps1") || !bootstrapScript.includes(connection.pairingCode)) {
      throw new Error("Bootstrap endpoint did not render the expected install script");
    }
    recordStep("bootstrap_endpoint", "completed", {
      installUrl: repairResponse.install.installUrl,
      installCommand: repairResponse.install.installCommand,
    });

    const installerOutput = await runInstallerDryRun(connection.pairingCode);
    recordStep("installer_dry_run", "completed", {
      output: installerOutput.trim(),
    });

    const mockTally = spawnProcess(process.execPath, [path.join("scripts", "mock-tally-server.js")], {
      env: {
        MOCK_TALLY_PORT: String(mockTallyPort),
      },
    });
    processes.push(mockTally);
    await waitForHttp(`${mockTallyUrl}/health`);
    recordStep("start_mock_tally", "completed", { mockTallyUrl });

    const agentStateDir = path.join(checkpointDir, "agent-state");
    const agent = spawnProcess(
      process.execPath,
      [
        path.join("agent", "cmd", "tallybridge-agent", "index.js"),
        "--control-plane-url",
        controlPlaneUrl,
        "--pairing-code",
        connection.pairingCode,
        "--mock-tally-url",
        mockTallyUrl,
        "--loopback-port",
        String(loopbackPort),
        "--state-dir",
        agentStateDir,
      ],
      {}
    );
    processes.push(agent);

    await sleep(2500);
    const initialHealth = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/health`);
    recordStep("pair_and_heartbeat", "completed", initialHealth.data);

    await postLoopbackEvent(loopbackPort);
    await sleep(1000);
    recordStep("loopback_event", "completed", { port: loopbackPort });

    const companiesCommand = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/commands`, {
      method: "POST",
      body: {
        type: "tally.list_companies",
        payload: {},
        idempotencyKey: `companies-${timestamp}`,
      },
    });
    const companiesResult = await waitForCommandCompletion(companiesCommand.data.id);
    recordStep("command_list_companies", "completed", companiesResult);

    const ledgersCommand = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/commands`, {
      method: "POST",
      body: {
        type: "tally.list_ledgers",
        payload: {},
        idempotencyKey: `ledgers-${timestamp}`,
      },
    });
    const ledgersResult = await waitForCommandCompletion(ledgersCommand.data.id);
    recordStep("command_list_ledgers", "completed", ledgersResult);

    const createLedgerCommand = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/commands`, {
      method: "POST",
      body: {
        type: "tally.create_ledger",
        payload: {
          name: `Checkpoint Ledger ${timestamp.slice(-6)}`,
          parent: "Sundry Debtors",
          isBillWiseOn: true,
        },
        idempotencyKey: `create-ledger-${timestamp}`,
      },
    });
    const createLedgerResult = await waitForCommandCompletion(createLedgerCommand.data.id);
    recordStep("command_create_ledger", "completed", createLedgerResult);

    const finalHealth = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/health`);
    const syncCompanies = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/companies`);
    recordStep("sync_companies_endpoint", "completed", syncCompanies);

    const syncLedgerCreate = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/ledgers`, {
      method: "POST",
      body: {
        name: `Sync Ledger ${timestamp.slice(-6)}`,
        parent: "Sundry Debtors",
        isBillWiseOn: true,
      },
    });
    recordStep("sync_create_ledger_endpoint", "completed", syncLedgerCreate);

    const commands = await requestJson(`${controlPlaneUrl}/v1/connections/${connection.id}/commands`);
    report.summary = {
      connection: connection.id,
      status: finalHealth.data.status,
      totalCommands: commands.data.length,
      completedCommands: commands.data.filter((command) => command.status === "completed").length,
    };
    recordStep("final_health", "completed", finalHealth.data);
  } catch (error) {
    report.error = {
      message: error.message,
      stack: error.stack,
    };
    recordStep("failure", "failed", report.error);
    throw error;
  } finally {
    for (const processRef of processes.reverse()) {
      processRef.stop();
    }

    const reportPath = path.join(checkpointDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.mkdirSync(checkpointRoot, { recursive: true });
    fs.writeFileSync(latestReportPath, JSON.stringify(report, null, 2));
    fs.appendFileSync(historyPath, `${JSON.stringify({
      checkpointAt: report.checkpointAt,
      checkpointDir,
      summary: report.summary || null,
      error: report.error || null,
    })}\n`);
    console.log(`Checkpoint report written to ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
