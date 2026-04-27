"use strict";

const http = require("http");
const { createRouter } = require("../routes");
const { createCommandService } = require("../services/command-service");
const { createConnectionService } = require("../services/connection-service");
const { createLegacyBridgeService } = require("../services/legacy-bridge-service");
const { createStore } = require("../store/database");
const { sendJson } = require("./http");

function createControlPlane(options = {}) {
  const host = options.host || process.env.BRIDGE_HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const port = Number(options.port || process.env.BRIDGE_PORT || process.env.PORT || 8000);
  const railwayBaseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
  const publicBaseUrl = (options.publicBaseUrl || process.env.TALLYBRIDGE_PUBLIC_BASE_URL || railwayBaseUrl || `http://${host}:${port}`).replace(/\/+$/, "");
  const store = createStore({ dbPath: options.dbPath });

  const services = {
    commands: createCommandService({ store }),
    connections: createConnectionService({ store, publicBaseUrl }),
    legacy: createLegacyBridgeService({ store }),
  };

  const router = createRouter({ store, services });
  const server = http.createServer(async (req, res) => {
    try {
      await router.handle(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });

  return {
    host,
    port,
    publicBaseUrl,
    server,
    services,
    store,
    start() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          console.log(`[control-plane] listening on ${publicBaseUrl}`);
          console.log(`[control-plane] sqlite db: ${store.dbPath}`);
          resolve();
        });
      });
    },
  };
}

async function startControlPlaneFromEnv() {
  const app = createControlPlane();
  await app.start();
  return app;
}

module.exports = {
  createControlPlane,
  startControlPlaneFromEnv,
};
