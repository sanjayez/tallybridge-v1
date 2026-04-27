"use strict";

const http = require("http");

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function createLoopbackServer({ host, port, logger, queue, onEvent, onHeartbeat }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      const body = await parseBody(req);
      if (req.url === "/event") {
        queue.recordEvent(body.type || "loopback.event", body);
        await onEvent(body);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.url === "/heartbeat") {
        queue.recordEvent("loopback.heartbeat", body);
        await onHeartbeat(body);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      logger.error("loopback request failed", { error: error.message });
      sendJson(res, 500, { error: error.message });
    }
  });

  return {
    async start() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          logger.info("loopback listener started", { host, port });
          resolve();
        });
      });
    },
    async stop() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

module.exports = {
  createLoopbackServer,
};
