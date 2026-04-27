"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "..", "..", "data", "tallybridge.db");
const LEGACY_STATE_PATH = path.join(__dirname, "..", "..", "..", "..", "data", "demo-state.json");

function nowIso() {
  return new Date().toISOString();
}

function toJson(value, fallback = {}) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function fromJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function hydrateConnection(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.connection_id,
    tenantId: row.tenant_id,
    externalCustomerId: row.external_customer_id || null,
    pairingCode: row.pairing_code,
    pairingExpiresAt: row.pairing_expires_at || null,
    agentId: row.agent_id,
    status: row.status,
    installMode: row.install_mode,
    mode: row.mode,
    source: row.source,
    company: row.company,
    companies: fromJson(row.companies_json, []),
    activeCompany: row.active_company,
    tallyVersion: row.tally_version,
    machineName: row.machine_name,
    installId: row.install_id,
    metadata: fromJson(row.metadata_json, {}),
    lastPayload: fromJson(row.last_payload_json, {}),
    lastHeartbeat: row.last_heartbeat,
    lastEvent: row.last_event,
    commandCount: row.command_count,
    createdAt: row.created_at,
    pairedAt: row.paired_at || null,
    updatedAt: row.updated_at,
  };
}

function hydrateCommand(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.command_id,
    connectionId: row.connection_id,
    type: row.type,
    company: row.company,
    payload: fromJson(row.payload_json, {}),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    origin: row.origin,
    requestedAt: row.requested_at,
    deliveredAt: row.delivered_at,
    completedAt: row.completed_at,
    result: fromJson(row.result_json, null),
    error: fromJson(row.error_json, null),
  };
}

function hydrateHeartbeat(row) {
  if (!row) {
    return null;
  }

  return {
    connectionId: row.connection_id,
    agentId: row.agent_id,
    status: row.status,
    mode: row.mode,
    installMode: row.install_mode,
    company: row.company,
    tallyVersion: row.tally_version,
    queueDepth: row.queue_depth,
    lastCommandMs: row.last_command_ms,
    lastEventAt: row.last_event_at,
    sentAt: row.sent_at,
    payload: fromJson(row.payload_json, {}),
    bridgeStatus: fromJson(row.payload_json, {}).bridge_status || null,
    tallyStatus: fromJson(row.payload_json, {}).tally_status || null,
    tallyProcessStatus: fromJson(row.payload_json, {}).tally_process_status || null,
    tallyProcessName: fromJson(row.payload_json, {}).tally_process_name || null,
    tallyProcessId: fromJson(row.payload_json, {}).tally_process_id || null,
    tdlStatus: fromJson(row.payload_json, {}).tdl_status || null,
  };
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      connection_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      external_customer_id TEXT,
      pairing_code TEXT UNIQUE,
      pairing_expires_at TEXT,
      agent_id TEXT,
      agent_token TEXT,
      status TEXT NOT NULL,
      install_mode TEXT,
      mode TEXT,
      source TEXT,
      company TEXT,
      companies_json TEXT NOT NULL DEFAULT '[]',
      active_company TEXT,
      tally_version TEXT,
      machine_name TEXT,
      install_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      last_payload_json TEXT NOT NULL DEFAULT '{}',
      last_heartbeat TEXT,
      last_event TEXT,
      command_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      paired_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      command_id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      type TEXT NOT NULL,
      company TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      idempotency_key TEXT,
      origin TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      delivered_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      error_json TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      connection_id TEXT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS heartbeats (
      heartbeat_id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id TEXT NOT NULL,
      agent_id TEXT,
      status TEXT NOT NULL,
      mode TEXT,
      install_mode TEXT,
      company TEXT,
      tally_version TEXT,
      queue_depth INTEGER NOT NULL DEFAULT 0,
      last_command_ms INTEGER,
      last_event_at TEXT,
      sent_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_commands_connection_status
      ON commands (connection_id, status, requested_at);

    CREATE INDEX IF NOT EXISTS idx_heartbeats_connection_sent_at
      ON heartbeats (connection_id, sent_at DESC);
  `);
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((candidate) => candidate.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateSchema(db) {
  ensureColumn(db, "connections", "external_customer_id", "TEXT");
  ensureColumn(db, "connections", "pairing_expires_at", "TEXT");
  ensureColumn(db, "connections", "paired_at", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_tenant_external_customer
      ON connections (tenant_id, external_customer_id)
      WHERE external_customer_id IS NOT NULL;
  `);
}

function importLegacyStateIfNeeded(db) {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM connections").get();
  if ((countRow && countRow.count) || !fs.existsSync(LEGACY_STATE_PATH)) {
    return;
  }

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_STATE_PATH, "utf8"));
  } catch {
    return;
  }

  const insertConnection = db.prepare(`
    INSERT INTO connections (
      connection_id, tenant_id, external_customer_id, pairing_code, pairing_expires_at,
      agent_id, agent_token, status, install_mode, mode, source,
      company, companies_json, active_company, tally_version, machine_name, install_id, metadata_json,
      last_payload_json, last_heartbeat, last_event, command_count, created_at, paired_at, updated_at
    ) VALUES (
      @connection_id, @tenant_id, @external_customer_id, @pairing_code, @pairing_expires_at,
      @agent_id, @agent_token, @status, @install_mode, @mode, @source,
      @company, @companies_json, @active_company, @tally_version, @machine_name, @install_id, @metadata_json,
      @last_payload_json, @last_heartbeat, @last_event, @command_count, @created_at, @paired_at, @updated_at
    )
  `);

  const insertCommand = db.prepare(`
    INSERT INTO commands (
      command_id, connection_id, type, company, payload_json, status, idempotency_key, origin,
      requested_at, delivered_at, completed_at, result_json, error_json
    ) VALUES (
      @command_id, @connection_id, @type, @company, @payload_json, @status, @idempotency_key, @origin,
      @requested_at, @delivered_at, @completed_at, @result_json, @error_json
    )
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (event_id, connection_id, type, payload_json, at)
    VALUES (@event_id, @connection_id, @type, @payload_json, @at)
  `);

  for (const connector of Object.values(legacy.connectors || {})) {
    insertConnection.run({
      connection_id: connector.id,
      tenant_id: "legacy-demo",
      external_customer_id: null,
      pairing_code: null,
      pairing_expires_at: null,
      agent_id: null,
      agent_token: connector.token || null,
      status: "active_degraded",
      install_mode: null,
      mode: "xml_only",
      source: connector.source || "legacy-tdl",
      company: connector.company || "",
      companies_json: toJson(connector.company ? [connector.company] : []),
      active_company: connector.company || null,
      tally_version: connector.tallyVersion || "",
      machine_name: connector.machineName || "",
      install_id: connector.installId || connector.id,
      metadata_json: toJson({ importedFrom: "demo-state.json" }),
      last_payload_json: toJson(connector.lastPayload || {}),
      last_heartbeat: connector.lastSeenAt || null,
      last_event: connector.lastEvent || "poll",
      command_count: connector.commandCount || 0,
      created_at: connector.createdAt || nowIso(),
      paired_at: null,
      updated_at: connector.lastSeenAt || connector.createdAt || nowIso(),
    });
  }

  for (const command of legacy.commands || []) {
    insertCommand.run({
      command_id: command.id,
      connection_id: command.connectorId,
      type: command.kind,
      company: null,
      payload_json: toJson(command.payload || {}),
      status: command.status || "queued",
      idempotency_key: null,
      origin: "legacy-demo",
      requested_at: command.createdAt || nowIso(),
      delivered_at: command.deliveredAt || null,
      completed_at: command.completedAt || null,
      result_json: toJson(command.result || null),
      error_json: toJson(null),
    });
  }

  for (const event of legacy.events || []) {
    insertEvent.run({
      event_id: event.id,
      connection_id: event.connectorId || null,
      type: event.type || "bridge_poll",
      payload_json: toJson(event.payload || {}),
      at: event.at || nowIso(),
    });
  }
}

function createStore(options = {}) {
  const dbPath = options.dbPath || process.env.TALLYBRIDGE_DB_PATH || DEFAULT_DB_PATH;
  ensureDirectoryForFile(dbPath);
  const db = new DatabaseSync(dbPath);
  createSchema(db);
  migrateSchema(db);
  importLegacyStateIfNeeded(db);

  const statements = {
    insertConnection: db.prepare(`
      INSERT INTO connections (
        connection_id, tenant_id, external_customer_id, pairing_code, pairing_expires_at,
        agent_id, agent_token, status, install_mode, mode, source,
        company, companies_json, active_company, tally_version, machine_name, install_id, metadata_json,
        last_payload_json, last_heartbeat, last_event, command_count, created_at, paired_at, updated_at
      ) VALUES (
        @connection_id, @tenant_id, @external_customer_id, @pairing_code, @pairing_expires_at,
        @agent_id, @agent_token, @status, @install_mode, @mode, @source,
        @company, @companies_json, @active_company, @tally_version, @machine_name, @install_id, @metadata_json,
        @last_payload_json, @last_heartbeat, @last_event, @command_count, @created_at, @paired_at, @updated_at
      )
    `),
    rotatePairingCode: db.prepare(`
      UPDATE connections
         SET pairing_code = @pairing_code,
             pairing_expires_at = @pairing_expires_at,
             metadata_json = @metadata_json,
             updated_at = @updated_at
       WHERE connection_id = @connection_id
    `),
    assignExternalCustomerId: db.prepare(`
      UPDATE connections
         SET external_customer_id = @external_customer_id,
             metadata_json = @metadata_json,
             updated_at = @updated_at
       WHERE connection_id = @connection_id
    `),
    updateConnectionAfterPair: db.prepare(`
      UPDATE connections
         SET agent_id = @agent_id,
             agent_token = @agent_token,
             pairing_code = NULL,
             pairing_expires_at = NULL,
             status = @status,
             install_mode = @install_mode,
             mode = @mode,
             machine_name = @machine_name,
             source = @source,
             paired_at = @paired_at,
             updated_at = @updated_at
       WHERE connection_id = @connection_id
    `),
    updateConnectionHeartbeat: db.prepare(`
      UPDATE connections
         SET status = @status,
             mode = @mode,
             install_mode = COALESCE(@install_mode, install_mode),
             company = COALESCE(@company, company),
             active_company = COALESCE(@company, active_company),
             companies_json = CASE
               WHEN @company IS NULL OR @company = '' THEN companies_json
               ELSE @companies_json
             END,
             tally_version = COALESCE(@tally_version, tally_version),
             last_heartbeat = @last_heartbeat,
             last_event = COALESCE(@last_event, last_event),
             updated_at = @updated_at
       WHERE connection_id = @connection_id
    `),
    getConnectionById: db.prepare("SELECT * FROM connections WHERE connection_id = ?"),
    getConnectionByPairingCode: db.prepare("SELECT * FROM connections WHERE pairing_code = ?"),
    getConnectionByExternalCustomer: db.prepare(`
      SELECT * FROM connections
       WHERE tenant_id = @tenant_id
         AND external_customer_id = @external_customer_id
       LIMIT 1
    `),
    findReusableProfileConnection: db.prepare(`
      SELECT * FROM connections
       WHERE tenant_id = @tenant_id
         AND external_customer_id IS NULL
         AND UPPER(machine_name) = UPPER(@machine_name)
         AND machine_name != ''
       ORDER BY
         CASE
           WHEN last_heartbeat IS NOT NULL THEN 0
           WHEN agent_id IS NOT NULL THEN 1
           ELSE 2
         END,
         last_heartbeat DESC,
         updated_at DESC
       LIMIT 1
    `),
    getConnectionByAgentToken: db.prepare("SELECT * FROM connections WHERE agent_token = ?"),
    listConnections: db.prepare("SELECT * FROM connections ORDER BY created_at DESC"),
    insertCommand: db.prepare(`
      INSERT INTO commands (
        command_id, connection_id, type, company, payload_json, status, idempotency_key,
        origin, requested_at, delivered_at, completed_at, result_json, error_json
      ) VALUES (
        @command_id, @connection_id, @type, @company, @payload_json, @status, @idempotency_key,
        @origin, @requested_at, @delivered_at, @completed_at, @result_json, @error_json
      )
    `),
    getCommandByIdempotency: db.prepare(`
      SELECT * FROM commands
       WHERE connection_id = @connection_id
         AND idempotency_key = @idempotency_key
       ORDER BY requested_at DESC
       LIMIT 1
    `),
    getCommandById: db.prepare("SELECT * FROM commands WHERE command_id = ?"),
    listCommandsAll: db.prepare("SELECT * FROM commands ORDER BY requested_at DESC"),
    listCommandsByConnection: db.prepare("SELECT * FROM commands WHERE connection_id = ? ORDER BY requested_at DESC"),
    claimNextQueuedCommand: db.prepare(`
      SELECT * FROM commands
       WHERE connection_id = ?
         AND status = 'queued'
       ORDER BY requested_at ASC
       LIMIT 1
    `),
    markCommandDelivered: db.prepare(`
      UPDATE commands
         SET status = 'delivered',
             delivered_at = @delivered_at
       WHERE command_id = @command_id
    `),
    markCommandCompleted: db.prepare(`
      UPDATE commands
         SET status = @status,
             completed_at = @completed_at,
             result_json = @result_json,
             error_json = @error_json
       WHERE command_id = @command_id
    `),
    incrementCommandCount: db.prepare(`
      UPDATE connections
         SET command_count = command_count + 1,
             updated_at = @updated_at
       WHERE connection_id = @connection_id
    `),
    insertHeartbeat: db.prepare(`
      INSERT INTO heartbeats (
        connection_id, agent_id, status, mode, install_mode, company, tally_version,
        queue_depth, last_command_ms, last_event_at, sent_at, payload_json
      ) VALUES (
        @connection_id, @agent_id, @status, @mode, @install_mode, @company, @tally_version,
        @queue_depth, @last_command_ms, @last_event_at, @sent_at, @payload_json
      )
    `),
    latestHeartbeat: db.prepare(`
      SELECT * FROM heartbeats
       WHERE connection_id = ?
       ORDER BY sent_at DESC
       LIMIT 1
    `),
    insertEvent: db.prepare(`
      INSERT INTO events (event_id, connection_id, type, payload_json, at)
      VALUES (@event_id, @connection_id, @type, @payload_json, @at)
    `),
    listEventsByConnection: db.prepare(`
      SELECT * FROM events
       WHERE connection_id = ?
       ORDER BY at DESC
       LIMIT 100
    `),
    recentEvents: db.prepare("SELECT * FROM events ORDER BY at DESC LIMIT 100"),
  };

  function createConnection({ tenantId, externalCustomerId, pairingCode, pairingExpiresAt, metadata }) {
    const timestamp = nowIso();
    const connectionId = `conn_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    statements.insertConnection.run({
      connection_id: connectionId,
      tenant_id: tenantId,
      external_customer_id: externalCustomerId || null,
      pairing_code: pairingCode,
      pairing_expires_at: pairingExpiresAt || null,
      agent_id: null,
      agent_token: null,
      status: "pending",
      install_mode: null,
      mode: "xml_only",
      source: "developer-api",
      company: "",
      companies_json: "[]",
      active_company: null,
      tally_version: "",
      machine_name: "",
      install_id: connectionId,
      metadata_json: toJson(metadata, {}),
      last_payload_json: "{}",
      last_heartbeat: null,
      last_event: null,
      command_count: 0,
      created_at: timestamp,
      paired_at: null,
      updated_at: timestamp,
    });

    return getConnectionById(connectionId);
  }

  function getConnectionById(connectionId) {
    return hydrateConnection(statements.getConnectionById.get(connectionId));
  }

  function getConnectionByPairingCode(pairingCode) {
    return hydrateConnection(statements.getConnectionByPairingCode.get(pairingCode));
  }

  function getConnectionByExternalCustomer(tenantId, externalCustomerId) {
    if (!externalCustomerId) {
      return null;
    }

    return hydrateConnection(statements.getConnectionByExternalCustomer.get({
      tenant_id: tenantId,
      external_customer_id: externalCustomerId,
    }));
  }

  function rotatePairingCode({ connectionId, pairingCode, pairingExpiresAt, metadata }) {
    const existing = getConnectionById(connectionId);
    if (!existing) {
      return null;
    }

    statements.rotatePairingCode.run({
      connection_id: connectionId,
      pairing_code: pairingCode,
      pairing_expires_at: pairingExpiresAt || null,
      metadata_json: toJson({
        ...existing.metadata,
        ...metadata,
      }),
      updated_at: nowIso(),
    });

    return getConnectionById(connectionId);
  }

  function assignExternalCustomerId({ connectionId, externalCustomerId, metadata }) {
    const existing = getConnectionById(connectionId);
    if (!existing) {
      return null;
    }

    statements.assignExternalCustomerId.run({
      connection_id: connectionId,
      external_customer_id: externalCustomerId,
      metadata_json: toJson({
        ...existing.metadata,
        ...metadata,
      }),
      updated_at: nowIso(),
    });

    return getConnectionById(connectionId);
  }

  function findReusableProfileConnection({ tenantId, machineName }) {
    if (!machineName) {
      return null;
    }

    return hydrateConnection(statements.findReusableProfileConnection.get({
      tenant_id: tenantId,
      machine_name: machineName,
    }));
  }

  function getConnectionByAgentToken(agentToken) {
    return hydrateConnection(statements.getConnectionByAgentToken.get(agentToken));
  }

  function listConnections() {
    return statements.listConnections.all().map(hydrateConnection);
  }

  function pairConnection({ pairingCode, agentId, agentVersion, machineName, installMode, mode }) {
    const connection = getConnectionByPairingCode(pairingCode);
    if (!connection) {
      return null;
    }

    const agentToken = randomUUID().replace(/-/g, "");
    const timestamp = nowIso();
    statements.updateConnectionAfterPair.run({
      connection_id: connection.id,
      agent_id: agentId,
      agent_token: agentToken,
      status: "waiting_for_tally",
      install_mode: installMode || null,
      mode: mode || "xml_only",
      machine_name: machineName || "",
      source: agentVersion ? `agent/${agentVersion}` : "agent",
      paired_at: timestamp,
      updated_at: timestamp,
    });

    return {
      connection: getConnectionById(connection.id),
      agentToken,
    };
  }

  function upsertLegacyConnection({
    connectorId,
    token,
    company,
    source,
    tallyVersion,
    machineName,
    installId,
    event,
    payload,
  }) {
    const existing = getConnectionById(connectorId);
    const timestamp = nowIso();
    if (!existing) {
      statements.insertConnection.run({
        connection_id: connectorId,
        tenant_id: "legacy-demo",
        external_customer_id: null,
        pairing_code: null,
        pairing_expires_at: null,
        agent_id: null,
        agent_token: token || null,
        status: "active_degraded",
        install_mode: null,
        mode: "xml_only",
        source: source || "legacy-tdl",
        company: company || "",
        companies_json: toJson(company ? [company] : []),
        active_company: company || null,
        tally_version: tallyVersion || "",
        machine_name: machineName || "",
        install_id: installId || connectorId,
        metadata_json: toJson({ legacyBridge: true }),
        last_payload_json: toJson(payload || {}),
        last_heartbeat: timestamp,
        last_event: event || "poll",
        command_count: 0,
        created_at: timestamp,
        paired_at: null,
        updated_at: timestamp,
      });
    } else {
      statements.updateConnectionHeartbeat.run({
        connection_id: connectorId,
        status: "active_degraded",
        mode: "xml_only",
        install_mode: null,
        company: company || existing.company || "",
        companies_json: toJson(company ? [company] : existing.companies || []),
        tally_version: tallyVersion || existing.tallyVersion || "",
        last_heartbeat: timestamp,
        last_event: event || "poll",
        updated_at: timestamp,
      });
    }

    recordEvent({
      connectionId: connectorId,
      type: "bridge_poll",
      payload: payload || {},
      at: timestamp,
    });

    return getConnectionById(connectorId);
  }

  function recordHeartbeat(agentToken, heartbeat) {
    const connection = getConnectionByAgentToken(agentToken);
    if (!connection) {
      return null;
    }

    const sentAt = heartbeat.sent_at || nowIso();
    statements.insertHeartbeat.run({
      connection_id: connection.id,
      agent_id: connection.agentId,
      status: heartbeat.status,
      mode: heartbeat.mode || "xml_only",
      install_mode: heartbeat.install_mode || connection.installMode,
      company: heartbeat.company || null,
      tally_version: heartbeat.tally_version || null,
      queue_depth: heartbeat.queue_depth || 0,
      last_command_ms: heartbeat.last_command_ms || null,
      last_event_at: heartbeat.last_event_at || null,
      sent_at: sentAt,
      payload_json: toJson(heartbeat, {}),
    });

    statements.updateConnectionHeartbeat.run({
      connection_id: connection.id,
      status: heartbeat.status,
      mode: heartbeat.mode || "xml_only",
      install_mode: heartbeat.install_mode || connection.installMode,
      company: heartbeat.company || null,
      companies_json: toJson(heartbeat.company ? [heartbeat.company] : connection.companies || []),
      tally_version: heartbeat.tally_version || null,
      last_heartbeat: sentAt,
      last_event: heartbeat.last_event_type || null,
      updated_at: nowIso(),
    });

    return getConnectionById(connection.id);
  }

  function enqueueCommand({ connectionId, type, company, payload, idempotencyKey, origin }) {
    const connection = getConnectionById(connectionId);
    if (!connection) {
      throw new Error(`Unknown connection: ${connectionId}`);
    }

    if (idempotencyKey) {
      const existing = statements.getCommandByIdempotency.get({
        connection_id: connectionId,
        idempotency_key: idempotencyKey,
      });
      if (existing) {
        return hydrateCommand(existing);
      }
    }

    const commandId = randomUUID();
    const requestedAt = nowIso();
    statements.insertCommand.run({
      command_id: commandId,
      connection_id: connectionId,
      type,
      company: company || null,
      payload_json: toJson(payload, {}),
      status: "queued",
      idempotency_key: idempotencyKey || null,
      origin: origin || "developer-api",
      requested_at: requestedAt,
      delivered_at: null,
      completed_at: null,
      result_json: null,
      error_json: null,
    });

    return getCommandById(commandId);
  }

  function claimNextQueuedCommand(connectionId) {
    const row = statements.claimNextQueuedCommand.get(connectionId);
    if (!row) {
      return null;
    }

    const deliveredAt = nowIso();
    statements.markCommandDelivered.run({
      command_id: row.command_id,
      delivered_at: deliveredAt,
    });
    statements.incrementCommandCount.run({
      connection_id: connectionId,
      updated_at: deliveredAt,
    });

    return getCommandById(row.command_id);
  }

  function completeCommand({ commandId, status, result, error }) {
    const existing = getCommandById(commandId);
    if (!existing) {
      return null;
    }

    statements.markCommandCompleted.run({
      command_id: commandId,
      status,
      completed_at: nowIso(),
      result_json: toJson(result, null),
      error_json: toJson(error, null),
    });
    return getCommandById(commandId);
  }

  function getCommandById(commandId) {
    return hydrateCommand(statements.getCommandById.get(commandId));
  }

  function listCommands(connectionId = null) {
    const rows = connectionId
      ? statements.listCommandsByConnection.all(connectionId)
      : statements.listCommandsAll.all();
    return rows.map(hydrateCommand);
  }

  function recordEvent({ connectionId, type, payload, at }) {
    statements.insertEvent.run({
      event_id: randomUUID(),
      connection_id: connectionId || null,
      type,
      payload_json: toJson(payload, {}),
      at: at || nowIso(),
    });
  }

  function listRecentEvents(connectionId = null) {
    const rows = connectionId
      ? statements.listEventsByConnection.all(connectionId)
      : statements.recentEvents.all();

    return rows.map((row) => ({
      id: row.event_id,
      connectionId: row.connection_id,
      type: row.type,
      payload: fromJson(row.payload_json, {}),
      at: row.at,
    }));
  }

  function getLatestHeartbeat(connectionId) {
    return hydrateHeartbeat(statements.latestHeartbeat.get(connectionId));
  }

  function getStats() {
    return {
      connections: listConnections().length,
      commandsQueued: listCommands().filter((command) => command.status === "queued").length,
      dbPath,
    };
  }

  function close() {
    db.close();
  }

  return {
    assignExternalCustomerId,
    claimNextQueuedCommand,
    close,
    completeCommand,
    createConnection,
    enqueueCommand,
    getCommandById,
    getConnectionByAgentToken,
    getConnectionByExternalCustomer,
    findReusableProfileConnection,
    getConnectionById,
    getConnectionByPairingCode,
    getLatestHeartbeat,
    getStats,
    listCommands,
    listConnections,
    listRecentEvents,
    pairConnection,
    recordEvent,
    recordHeartbeat,
    rotatePairingCode,
    upsertLegacyConnection,
    dbPath,
  };
}

module.exports = {
  createStore,
};
