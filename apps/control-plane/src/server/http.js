"use strict";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendBuffer(res, statusCode, body, contentType = "application/octet-stream") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": body.length,
  });
  res.end(body);
}

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

function getTokenFromHeader(req) {
  const auth = req.headers.authorization || "";
  const prefix = "Bearer ";
  return auth.startsWith(prefix) ? auth.slice(prefix.length).trim() : "";
}

function notFound(res, message = "Route not found") {
  sendJson(res, 404, { error: message });
}

module.exports = {
  getTokenFromHeader,
  notFound,
  parseBody,
  sendBuffer,
  sendJson,
  sendText,
};
