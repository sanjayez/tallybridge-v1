"use strict";

const { randomUUID } = require("crypto");

function randomPairingCode() {
  const raw = randomUUID().replace(/-/g, "").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function pairingExpiryIso() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

function deriveHealthStatus(connection, heartbeat) {
  if (!connection) {
    return "missing";
  }

  if (!connection.lastHeartbeat) {
    return connection.status === "pending" ? "pending" : "unreachable";
  }

  const ageMs = Date.now() - Date.parse(connection.lastHeartbeat);
  if (Number.isFinite(ageMs) && ageMs > 45000) {
    return "unreachable";
  }

  if (heartbeat?.status === "inactive") {
    return "inactive";
  }

  if (heartbeat?.tallyStatus === "offline") {
    return "inactive";
  }

  return heartbeat?.status || connection.status;
}

function deriveHealthColor(status) {
  if (status === "active" || status === "active_degraded") {
    return "green";
  }

  if (status === "inactive") {
    return "orange";
  }

  if (status === "pending") {
    return "gray";
  }

  return "red";
}

function normalizeInstallBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("TALLYBRIDGE_PUBLIC_BASE_URL must be a valid URL before generating install commands");
  }

  if (parsed.hostname === "0.0.0.0" || parsed.hostname === "::") {
    throw new Error("Install command cannot use 0.0.0.0. Set TALLYBRIDGE_PUBLIC_BASE_URL to the public API URL.");
  }

  if (process.env.NODE_ENV === "production" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Hosted install command needs TALLYBRIDGE_PUBLIC_BASE_URL set to the public API URL.");
  }

  return normalized;
}

function createConnectionService({ store, publicBaseUrl }) {
  function buildInstallPayload(connection, reused, publicBaseUrlOverride = null) {
    const installBaseUrl = normalizeInstallBaseUrl(publicBaseUrlOverride || publicBaseUrl);
    const installUrl = `${installBaseUrl}/install/${connection.pairingCode}`;
    return {
      pairingCode: connection.pairingCode,
      installUrl,
      installCommand: `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${installUrl}' | iex"`,
      reusedConnection: reused,
    };
  }

  function createConnection({
    tenantId = "demo-tenant",
    externalCustomerId = null,
    metadata = {},
    profileMachineName = null,
    publicBaseUrlOverride = null,
  }) {
    const pairingCode = randomPairingCode();
    const pairingExpiresAt = pairingExpiryIso();
    const existing = store.getConnectionByExternalCustomer(tenantId, externalCustomerId);

    if (existing) {
      const connection = store.rotatePairingCode({
        connectionId: existing.id,
        pairingCode,
        pairingExpiresAt,
        metadata: {
          ...metadata,
          lastPairingReason: "repair_or_reconnect",
        },
      });

      return {
        connection,
        created: false,
        install: buildInstallPayload(connection, true, publicBaseUrlOverride),
      };
    }

    const reusable = store.findReusableProfileConnection({
      tenantId,
      machineName: profileMachineName,
    });

    if (externalCustomerId && reusable) {
      store.assignExternalCustomerId({
        connectionId: reusable.id,
        externalCustomerId,
        metadata: {
          ...metadata,
          adoptedProfileConnection: true,
        },
      });

      const connection = store.rotatePairingCode({
        connectionId: reusable.id,
        pairingCode,
        pairingExpiresAt,
        metadata: {
          ...metadata,
          lastPairingReason: "profile_repair_or_reconnect",
        },
      });

      return {
        connection,
        created: false,
        install: buildInstallPayload(connection, true, publicBaseUrlOverride),
      };
    }

    const connection = store.createConnection({
      tenantId,
      externalCustomerId,
      pairingCode,
      pairingExpiresAt,
      metadata,
    });

    return {
      connection,
      created: true,
      install: buildInstallPayload(connection, false, publicBaseUrlOverride),
    };
  }

  function listConnections() {
    return store.listConnections().map((connection) => {
      const heartbeat = store.getLatestHeartbeat(connection.id);
      const status = deriveHealthStatus(connection, heartbeat);
      return {
        ...connection,
        healthStatus: status,
        healthColor: deriveHealthColor(status),
        bridgeStatus: status === "unreachable" ? "offline" : "online",
        tallyStatus: heartbeat?.tallyStatus || (status === "inactive" ? "offline" : "unknown"),
        tdlStatus: heartbeat?.tdlStatus || "unknown",
      };
    });
  }

  function getConnection(connectionId) {
    return store.getConnectionById(connectionId);
  }

  function getConnectionHealth(connectionId) {
    const connection = store.getConnectionById(connectionId);
    if (!connection) {
      return null;
    }

    const heartbeat = store.getLatestHeartbeat(connectionId);
    const status = deriveHealthStatus(connection, heartbeat);
    return {
      connectionId,
      status,
      color: deriveHealthColor(status),
      bridgeStatus: status === "unreachable" ? "offline" : "online",
      tallyStatus: heartbeat?.tallyStatus || (status === "inactive" ? "offline" : "unknown"),
      tallyProcessStatus: heartbeat?.tallyProcessStatus || "unknown",
      tallyProcessName: heartbeat?.tallyProcessName || null,
      tallyProcessId: heartbeat?.tallyProcessId || null,
      tdlStatus: heartbeat?.tdlStatus || "unknown",
      mode: connection.mode,
      activeCompany: connection.activeCompany,
      tallyVersion: connection.tallyVersion,
      lastHeartbeat: connection.lastHeartbeat,
      heartbeat,
      recentEvents: store.listRecentEvents(connectionId),
      queuedCommands: store.listCommands(connectionId).filter((command) => command.status === "queued").length,
    };
  }

  function pairAgent(payload) {
    const connection = store.getConnectionByPairingCode(payload.pairing_code);
    if (!connection) {
      return null;
    }

    if (connection.pairingExpiresAt && Date.parse(connection.pairingExpiresAt) < Date.now()) {
      return null;
    }

    const pairing = store.pairConnection({
      pairingCode: payload.pairing_code,
      agentId: payload.agent_id || `agent_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      agentVersion: payload.agent_version || "0.1.0",
      machineName: payload.machine_name || "",
      installMode: payload.install_mode || "user",
      mode: payload.mode || "xml_only",
    });

    if (!pairing) {
      return null;
    }

    return {
      connection: pairing.connection,
      agentToken: pairing.agentToken,
    };
  }

  function recordAgentHeartbeat(agentToken, heartbeat) {
    return store.recordHeartbeat(agentToken, heartbeat);
  }

  return {
    createConnection,
    getConnection,
    getConnectionHealth,
    listConnections,
    pairAgent,
    recordAgentHeartbeat,
  };
}

module.exports = {
  createConnectionService,
  normalizeInstallBaseUrl,
};
