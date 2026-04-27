"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { createHash } = require("crypto");
const { getTokenFromHeader, notFound, parseBody, sendBuffer, sendJson, sendText } = require("../server/http");

const repoRoot = path.join(__dirname, "..", "..", "..", "..");
const bundleRoots = ["agent", "tdl", path.join("installer", "windows")];
const bundleFiles = [path.join("src", "tally-xml.js")];
const bundleExtensions = new Set([".js", ".ps1", ".tdl", ".tpj"]);

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toBundlePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function listBundleFiles() {
  const files = [];
  const seen = new Set();

  function pushFile(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath) || !bundleExtensions.has(path.extname(relativePath).toLowerCase())) {
      return;
    }

    const bundlePath = toBundlePath(relativePath);
    if (seen.has(bundlePath)) {
      return;
    }

    const body = fs.readFileSync(absolutePath);
    seen.add(bundlePath);
    files.push({
      path: bundlePath,
      size: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }

  function walk(relativeDir) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
      return;
    }

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(repoRoot, relativePath);
      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }

      if (!bundleExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      pushFile(relativePath);
    }
  }

  for (const root of bundleRoots) {
    walk(root);
  }

  for (const file of bundleFiles) {
    pushFile(file);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function getRequestBaseUrl(req, fallbackUrl) {
  if (process.env.TALLYBRIDGE_PUBLIC_BASE_URL) {
    return process.env.TALLYBRIDGE_PUBLIC_BASE_URL.replace(/\/+$/, "");
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || fallbackUrl.protocol.replace(":", "");
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1";
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function renderInstallBootstrap({ pairingCode, serverUrl, dryRun }) {
  const dryRunFlag = dryRun ? " -DryRun" : "";

  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$serverUrl = ${quotePowerShell(serverUrl)}`,
    `$pairingCode = ${quotePowerShell(pairingCode)}`,
    "$node = Get-Command node -ErrorAction SilentlyContinue",
    "if (-not $node) {",
    "  throw 'Node.js 20 or newer is required for this hosted demo bridge agent. The production agent will be a signed single binary.'",
    "}",
    "$bundleRoot = Join-Path $env:LOCALAPPDATA 'TallyBridge\\bundle'",
    "$manifestUrl = \"$serverUrl/download/bridge-manifest.json\"",
    "New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null",
    "$manifest = Invoke-RestMethod -UseBasicParsing -Uri $manifestUrl",
    "foreach ($file in $manifest.files) {",
    "  $dest = Join-Path $bundleRoot ($file.path -replace '/', '\\')",
    "  $destDir = Split-Path -Parent $dest",
    "  New-Item -ItemType Directory -Force -Path $destDir | Out-Null",
    "  Invoke-WebRequest -UseBasicParsing -Uri ($serverUrl + $file.downloadPath) -OutFile $dest",
    "}",
    "$installer = Join-Path $bundleRoot 'installer\\windows\\install-bridge.ps1'",
    "if (-not (Test-Path -LiteralPath $installer)) {",
    "  throw \"Downloaded TallyBridge bundle did not contain $installer\"",
    "}",
    `& powershell -NoProfile -ExecutionPolicy Bypass -File $installer -ServerUrl $serverUrl -PairingCode $pairingCode${dryRunFlag}`,
    "",
  ];

  return lines.join("\n");
}

function getLocalProfile() {
  const machineName = os.hostname();
  let username = "unknown-user";
  try {
    username = os.userInfo().username || username;
  } catch {
    // Some locked-down service contexts do not expose userInfo.
  }

  return {
    machineName,
    username,
    externalCustomerId: `local-profile:${machineName}:${username}`.toLowerCase(),
    label: `${machineName}\\${username}`,
  };
}

function renderHome(stats, publicBaseUrl) {
  const lines = [
    "TallyBridge Control Plane",
    "========================",
    "",
    `Connections seen: ${stats.connections}`,
    `Queued commands: ${stats.commandsQueued}`,
    `SQLite DB: ${stats.dbPath}`,
    `Public base URL: ${publicBaseUrl}`,
    "",
    process.env.TALLYBRIDGE_WEB_URL ? `Dashboard: ${process.env.TALLYBRIDGE_WEB_URL}` : "Dashboard: configure TALLYBRIDGE_WEB_URL on the API service or deploy the Web service separately.",
    "",
    "Key endpoints:",
    "POST /v1/connections",
    "GET  /v1/connections",
    "GET  /v1/connections/:id",
    "GET  /v1/connections/:id/health",
    "GET  /install/:pairingCode",
    "GET  /download/bridge-manifest.json",
    "GET  /download/bridge-file?path=...",
    "POST /v1/connections/:id/commands",
    "POST /v1/agent/pair",
    "POST /v1/agent/poll",
    "POST /v1/agent/results",
    "",
    "Legacy demo endpoints are still available under /tally and /api.",
  ];
  return lines.join("\n");
}

function normalizeHeartbeat(body) {
  return {
    schema_version: body.schema_version || "v1",
    connection_id: body.connection_id || "",
    agent_id: body.agent_id || "",
    status: body.status || "waiting_for_tally",
    mode: body.mode || "xml_only",
    install_mode: body.install_mode || null,
    bridge_status: body.bridge_status || null,
    tally_status: body.tally_status || null,
    tally_process_status: body.tally_process_status || null,
    tally_process_name: body.tally_process_name || null,
    tally_process_id: body.tally_process_id || null,
    tdl_status: body.tdl_status || null,
    company: body.company || null,
    tally_version: body.tally_version || null,
    queue_depth: body.queue_depth || 0,
    last_command_ms: body.last_command_ms || null,
    last_event_at: body.last_event_at || null,
    sent_at: body.sent_at || new Date().toISOString(),
    last_event_type: body.last_event_type || null,
  };
}

function createRouter({ store, services, publicBaseUrl }) {
  const { commands, connections, legacy } = services;

  async function handleLegacyRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/connectors") {
      sendJson(res, 200, { connectors: connections.listConnections() });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/commands") {
      sendJson(res, 200, { commands: commands.listCommands() });
      return true;
    }

    const showMessageMatch = url.pathname.match(/^\/api\/connectors\/([^/]+)\/commands\/show-message$/);
    if (req.method === "POST" && showMessageMatch) {
      const body = await parseBody(req);
      const command = legacy.queueShowMessage(
        showMessageMatch[1],
        body.message || "Hello from the control plane"
      );
      sendJson(res, 201, { command });
      return true;
    }

    const createLedgerMatch = url.pathname.match(/^\/api\/connectors\/([^/]+)\/commands\/create-ledger$/);
    if (req.method === "POST" && createLedgerMatch) {
      const body = await parseBody(req);
      const command = legacy.queueCreateLedger(createLedgerMatch[1], {
        name: body.name || `Demo Ledger ${Date.now()}`,
        parent: body.parent || "Sundry Debtors",
        isBillWiseOn: body.isBillWiseOn !== false,
      });
      sendJson(res, 201, { command });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/tally/bridge") {
      const body = await parseBody(req);
      const response = legacy.handleBridgePoll(body, getTokenFromHeader(req));
      sendJson(res, 200, response);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/tally/bridge/result") {
      const body = await parseBody(req);
      const command = legacy.handleBridgeResult(getTokenFromHeader(req), body);
      if (!command) {
        sendJson(res, 401, { error: "Unauthorized connector token" });
        return true;
      }
      sendJson(res, 200, { ok: true, command });
      return true;
    }

    return false;
  }

  async function handleV1Routes(req, res, url) {
    if (req.method === "POST" && url.pathname === "/v1/connections") {
      const body = await parseBody(req);
      const created = connections.createConnection({
        tenantId: body.tenantId || "demo-tenant",
        externalCustomerId: body.externalCustomerId || body.external_customer_id || null,
        profileMachineName: body.profileMachineName || body.profile_machine_name || null,
        metadata: body.metadata || {},
        publicBaseUrlOverride: getRequestBaseUrl(req, url),
      });
      sendJson(res, created.created ? 201 : 200, {
        data: created.connection,
        install: created.install,
        meta: {
          created: created.created,
        },
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/v1/local-profile") {
      sendJson(res, 200, { data: getLocalProfile() });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/v1/connections") {
      sendJson(res, 200, { data: connections.listConnections() });
      return true;
    }

    const connectionMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)$/);
    if (req.method === "GET" && connectionMatch) {
      const connection = connections.getConnection(connectionMatch[1]);
      if (!connection) {
        notFound(res, "Connection not found");
        return true;
      }
      sendJson(res, 200, { data: connection });
      return true;
    }

    const healthMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/health$/);
    if (req.method === "GET" && healthMatch) {
      const health = connections.getConnectionHealth(healthMatch[1]);
      if (!health) {
        notFound(res, "Connection not found");
        return true;
      }
      sendJson(res, 200, { data: health });
      return true;
    }

    const companiesMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/companies$/);
    if (req.method === "GET" && companiesMatch) {
      const command = commands.queueCommand({
        connectionId: companiesMatch[1],
        type: "tally.list_companies",
        company: null,
        payload: {},
        idempotencyKey: null,
        origin: "developer-api-sync",
      });
      const completed = await commands.waitForCompletion(command.id);
      if (!completed || completed.status !== "completed") {
        sendJson(res, 504, { error: "Timed out waiting for companies result", command: completed || command });
        return true;
      }
      sendJson(res, 200, {
        data: completed.result.data.companies,
        meta: {
          connectionId: companiesMatch[1],
          tallyVersion: completed.result.data.tallyVersion,
        },
      });
      return true;
    }

    const ledgersMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/ledgers$/);
    if (req.method === "GET" && ledgersMatch) {
      const command = commands.queueCommand({
        connectionId: ledgersMatch[1],
        type: "tally.list_ledgers",
        company: null,
        payload: {},
        idempotencyKey: null,
        origin: "developer-api-sync",
      });
      const completed = await commands.waitForCompletion(command.id);
      if (!completed || completed.status !== "completed") {
        sendJson(res, 504, { error: "Timed out waiting for ledgers result", command: completed || command });
        return true;
      }
      sendJson(res, 200, {
        data: completed.result.data,
        meta: {
          connectionId: ledgersMatch[1],
          count: completed.result.meta.count,
        },
      });
      return true;
    }

    if (req.method === "POST" && ledgersMatch) {
      const body = await parseBody(req);
      const command = commands.queueCommand({
        connectionId: ledgersMatch[1],
        type: "tally.create_ledger",
        company: null,
        payload: body,
        idempotencyKey: body.idempotencyKey || null,
        origin: "developer-api-sync",
      });
      const completed = await commands.waitForCompletion(command.id);
      if (!completed || completed.status !== "completed") {
        sendJson(res, 504, { error: "Timed out waiting for ledger creation", command: completed || command });
        return true;
      }
      sendJson(res, 201, {
        data: completed.result.data,
        meta: {
          connectionId: ledgersMatch[1],
        },
      });
      return true;
    }

    const listConnectionCommandsMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/commands$/);
    if (req.method === "GET" && listConnectionCommandsMatch) {
      sendJson(res, 200, { data: commands.listCommands(listConnectionCommandsMatch[1]) });
      return true;
    }

    if (req.method === "POST" && listConnectionCommandsMatch) {
      const body = await parseBody(req);
      const command = commands.queueCommand({
        connectionId: listConnectionCommandsMatch[1],
        type: body.type,
        company: body.company || null,
        payload: body.payload || {},
        idempotencyKey: body.idempotencyKey || null,
        origin: "developer-api",
      });
      sendJson(res, 201, { data: command });
      return true;
    }

    const commandMatch = url.pathname.match(/^\/v1\/commands\/([^/]+)$/);
    if (req.method === "GET" && commandMatch) {
      const command = commands.getCommand(commandMatch[1]);
      if (!command) {
        notFound(res, "Command not found");
        return true;
      }
      sendJson(res, 200, { data: command });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/v1/agent/pair") {
      const body = await parseBody(req);
      const pairing = connections.pairAgent(body);
      if (!pairing) {
        sendJson(res, 404, { error: "Invalid pairing code" });
        return true;
      }
      sendJson(res, 200, {
        data: {
          connection: pairing.connection,
          agent_token: pairing.agentToken,
          loopback_url: "http://127.0.0.1:21567",
        },
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/v1/agent/poll") {
      const body = await parseBody(req);
      const token = getTokenFromHeader(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing agent Bearer token" });
        return true;
      }

      const claim = commands.claimCommandForAgent(token, normalizeHeartbeat(body));
      if (!claim) {
        sendJson(res, 401, { error: "Unauthorized agent token" });
        return true;
      }

      sendJson(res, 200, {
        data: {
          connection: claim.connection,
          command: claim.command,
        },
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/v1/agent/results") {
      const body = await parseBody(req);
      const token = getTokenFromHeader(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing agent Bearer token" });
        return true;
      }

      const connection = store.getConnectionByAgentToken(token);
      if (!connection) {
        sendJson(res, 401, { error: "Unauthorized agent token" });
        return true;
      }

      const command = commands.completeAgentCommand(
        body.command_id,
        body.status || "completed",
        body.data || null,
        body.error || null
      );

      if (!command) {
        sendJson(res, 404, { error: "Unknown command" });
        return true;
      }

      sendJson(res, 200, { data: command });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/v1/agent/events") {
      const token = getTokenFromHeader(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing agent Bearer token" });
        return true;
      }

      const body = await parseBody(req);
      const events = Array.isArray(body.events) ? body.events : [body];
      const recorded = [];
      for (const event of events) {
        const connection = commands.recordAgentEvent(token, event);
        if (!connection) {
          sendJson(res, 401, { error: "Unauthorized agent token" });
          return true;
        }
        recorded.push({ connectionId: connection.id, type: event.type || "agent.event" });
      }

      sendJson(res, 200, { data: recorded });
      return true;
    }

    return false;
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      sendText(res, 200, renderHome(store.getStats(), publicBaseUrl));
      return;
    }

    if (req.method === "GET" && url.pathname === "/download/bridge-manifest.json") {
      const files = listBundleFiles().map((file) => ({
        ...file,
        downloadPath: `/download/bridge-file?path=${encodeURIComponent(file.path)}`,
      }));
      sendJson(res, 200, {
        schemaVersion: "v1",
        generatedAt: new Date().toISOString(),
        files,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/download/bridge-file") {
      const requestedPath = url.searchParams.get("path") || "";
      const manifest = listBundleFiles();
      const file = manifest.find((candidate) => candidate.path === requestedPath);
      if (!file) {
        notFound(res, "Bridge bundle file not found");
        return;
      }

      const absolutePath = path.join(repoRoot, requestedPath);
      const resolved = path.resolve(absolutePath);
      if (!resolved.startsWith(repoRoot + path.sep)) {
        notFound(res, "Bridge bundle file not found");
        return;
      }

      sendBuffer(res, 200, fs.readFileSync(resolved), "application/octet-stream");
      return;
    }

    const installMatch = url.pathname.match(/^\/install\/([^/]+)$/);
    if (req.method === "GET" && installMatch) {
      const serverUrl = getRequestBaseUrl(req, url);
      sendText(
        res,
        200,
        renderInstallBootstrap({
          pairingCode: decodeURIComponent(installMatch[1]),
          serverUrl,
          dryRun: url.searchParams.get("dryRun") === "1",
        })
      );
      return;
    }

    if (await handleLegacyRoutes(req, res, url)) {
      return;
    }

    if (await handleV1Routes(req, res, url)) {
      return;
    }

    notFound(res);
  }

  return {
    handle,
  };
}

module.exports = {
  createRouter,
};
