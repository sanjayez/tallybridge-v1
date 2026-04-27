"use strict";

const apiUrl = (process.argv[2] || process.env.TALLYBRIDGE_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

if (!apiUrl) {
  console.error("Usage: node scripts/hosted-smoke-test.js https://your-api-domain");
  process.exit(1);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

async function main() {
  const externalCustomerId = `hosted-smoke-${Date.now()}`;
  const connection = await requestJson(`${apiUrl}/v1/connections`, {
    method: "POST",
    body: {
      tenantId: "hosted-smoke",
      externalCustomerId,
      metadata: { createdFrom: "hosted-smoke-test" },
    },
  });

  const pairingCode = connection.data.pairingCode;
  if (!pairingCode) {
    throw new Error("Connection did not return a pairing code");
  }

  const installCommand = connection.install?.installCommand || "";
  const installUrl = connection.install?.installUrl || "";
  if (!installCommand.includes(apiUrl) || !installUrl.startsWith(`${apiUrl}/install/`)) {
    throw new Error(`Install command is not using the public API URL. Got: ${installCommand}`);
  }

  if (/(^|[^0-9])(0\.0\.0\.0|127\.0\.0\.1|localhost)([^0-9]|$)/i.test(installCommand)) {
    throw new Error(`Install command contains a non-public host. Got: ${installCommand}`);
  }

  const installScript = await requestText(`${apiUrl}/install/${pairingCode}?dryRun=1`);
  if (!installScript.includes("/download/bridge-manifest.json") || !installScript.includes(pairingCode)) {
    throw new Error("Install bootstrap did not include hosted bundle download flow");
  }

  const manifest = await requestJson(`${apiUrl}/download/bridge-manifest.json`);
  const installerFile = manifest.files.find((file) => file.path === "installer/windows/install-bridge.ps1");
  const agentFile = manifest.files.find((file) => file.path === "agent/cmd/tallybridge-agent/index.js");
  const tdlFile = manifest.files.find((file) => file.path === "tdl/BR_Bridge.tdl");
  if (!installerFile || !agentFile || !tdlFile) {
    throw new Error("Hosted bridge manifest is missing required files");
  }

  const installerBody = await requestText(`${apiUrl}${installerFile.downloadPath}`);
  if (!installerBody.includes("TallyBridge install complete")) {
    throw new Error("Installer file endpoint returned unexpected content");
  }

  console.log(JSON.stringify({
    ok: true,
    apiUrl,
    connectionId: connection.data.id,
    pairingCode,
    installCommand: connection.install.installCommand,
    manifestFiles: manifest.files.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
