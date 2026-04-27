"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

function toCamelCase(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = toCamelCase(arg.slice(2));
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return options;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function normalizeNumber(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function createAgentConfig(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  const defaultStateDir = process.env.TALLYBRIDGE_AGENT_STATE_DIR ||
    path.join(process.cwd(), "data", "agent-runtime");
  const initialStateDir = cli.stateDir || defaultStateDir;
  const persistedConfigPath = path.join(initialStateDir, "agent-config.json");
  const fileConfig = readJson(cli.config);
  const persistedConfig = readJson(persistedConfigPath);
  const merged = {
    ...persistedConfig,
    ...fileConfig,
    ...cli,
  };

  const stateDir = merged.stateDir || defaultStateDir;
  const configPath = merged.config || null;
  const runtimeConfigPath = path.join(stateDir, "agent-config.json");
  const controlPlaneUrl = String(
    merged.controlPlaneUrl || process.env.TALLYBRIDGE_CONTROL_PLANE_URL || "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
  const loopbackPort = normalizeNumber(merged.loopbackPort, 21567);
  const pollIntervalMs = normalizeNumber(merged.pollIntervalMs, 2000);
  const tallyUrl = merged.tallyUrl || process.env.TALLYBRIDGE_TALLY_URL || "http://127.0.0.1:9000";
  const agentId =
    merged.agentId ||
    `agent_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  fs.mkdirSync(stateDir, { recursive: true });

  const config = {
    agentId,
    agentToken: merged.agentToken || null,
    agentVersion: merged.agentVersion || "0.1.0",
    configPath,
    connectionId: merged.connectionId || null,
    controlPlaneUrl,
    dryRun: normalizeBoolean(merged.dryRun, false),
    logLevel: merged.logLevel || "info",
    loopbackHost: "127.0.0.1",
    loopbackPort,
    mockTallyUrl: merged.mockTallyUrl || null,
    mode: merged.mode || "xml_only",
    once: normalizeBoolean(merged.once, false),
    pairingCode: merged.pairingCode || null,
    pollIntervalMs,
    runtimeConfigPath,
    stateDir,
    tallyUrl,
    waitForTally: normalizeBoolean(merged.waitForTally, false),
  };

  function persist(patch) {
    const next = {
      ...readJson(runtimeConfigPath),
      ...patch,
    };
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(next, null, 2));
  }

  return {
    config,
    persist,
  };
}

module.exports = {
  createAgentConfig,
};
