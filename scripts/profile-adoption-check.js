"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStore } = require("../apps/control-plane/src/store/database");
const { createConnectionService } = require("../apps/control-plane/src/services/connection-service");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tallybridge-profile-"));
const dbPath = path.join(tmpDir, "profile.db");

try {
  const store = createStore({ dbPath });
  const services = createConnectionService({
    store,
    publicBaseUrl: "http://127.0.0.1:8000",
  });

  const original = store.createConnection({
    tenantId: "demo-tenant",
    externalCustomerId: null,
    pairingCode: "PROF-0001",
    pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
    metadata: { createdFrom: "old-demo" },
  });

  store.pairConnection({
    pairingCode: original.pairingCode,
    agentId: "agent_profile_check",
    agentVersion: "0.1.0",
    machineName: "SANJAY",
    installMode: "user",
    mode: "xml_only",
  });

  const adopted = services.createConnection({
    tenantId: "demo-tenant",
    externalCustomerId: "local-profile:sanjay:sanjay-experiments",
    profileMachineName: "Sanjay",
    metadata: { createdFrom: "web-ui" },
  });

  if (adopted.created) {
    throw new Error("Expected profile create/repair to adopt existing profile connection");
  }

  if (adopted.connection.id !== original.id) {
    throw new Error(`Expected ${original.id}, got ${adopted.connection.id}`);
  }

  if (adopted.connection.externalCustomerId !== "local-profile:sanjay:sanjay-experiments") {
    throw new Error("Adopted connection did not receive profile external customer id");
  }

  store.close();
  console.log("Profile adoption check passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
