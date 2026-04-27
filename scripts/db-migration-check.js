"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createStore } = require("../apps/control-plane/src/store/database");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tallybridge-migration-"));
const dbPath = path.join(tmpDir, "legacy.db");

try {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE connections (
      connection_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      pairing_code TEXT UNIQUE,
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
      updated_at TEXT NOT NULL
    );
  `);
  db.close();

  const store = createStore({ dbPath });
  const connection = store.createConnection({
    tenantId: "migration-tenant",
    externalCustomerId: "migration-customer",
    pairingCode: "MIGR-0001",
    pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
    metadata: { migrationCheck: true },
  });

  if (!connection.externalCustomerId || !connection.pairingExpiresAt) {
    throw new Error("Migrated connection did not expose new schema fields");
  }

  store.close();
  console.log("DB migration check passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
