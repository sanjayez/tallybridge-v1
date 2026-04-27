"use strict";

const http = require("http");

const BASE_URL = process.env.BRIDGE_BASE_URL || "http://127.0.0.1:8000";

function usage() {
  console.log(`Usage:
  npm run demo -- create-connection [externalCustomerId]
  npm run demo -- connectors
  npm run demo -- health <connectionId>
  npm run demo -- companies <connectionId>
  npm run demo -- ledgers <connectionId>
  npm run demo -- command <commandId>
  npm run demo -- queue <connectionId> <type> [jsonPayload]
  npm run demo -- commands
  npm run demo -- show-message <connectorId> "<message>"
  npm run demo -- create-ledger <connectorId> "<ledger name>" [parent]
`);
}

function request(method, pathname, body) {
  const url = new URL(pathname, BASE_URL);
  const payload = body ? JSON.stringify(body) : "";

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const parsed = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `Request failed with status ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    req.end(payload);
  });
}

function coerceValue(value) {
  const trimmed = String(value).trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseLooseObject(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // PowerShell often strips JSON quotes in quick CLI usage, so accept a small
    // object-literal style format like {name:Acme,parent:Sundry Debtors}.
  }

  const withoutBraces = trimmed.replace(/^\{/, "").replace(/\}$/, "");
  const payload = {};
  for (const pair of withoutBraces.split(",")) {
    const separatorIndex = pair.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim().replace(/^["']|["']$/g, "");
    const value = pair.slice(separatorIndex + 1);
    if (key) {
      payload[key] = coerceValue(value);
    }
  }

  if (Object.keys(payload).length === 0) {
    throw new Error(`Could not parse payload: ${input}`);
  }

  return payload;
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || command === "--help" || command === "help") {
    usage();
    process.exit(0);
  }

  if (command === "connectors") {
    console.log(JSON.stringify(await request("GET", "/api/connectors"), null, 2));
    return;
  }

  if (command === "create-connection") {
    const [externalCustomerId = "demo-customer"] = args;
    console.log(
      JSON.stringify(
        await request("POST", "/v1/connections", {
          tenantId: "demo-tenant",
          externalCustomerId,
          metadata: { createdFrom: "demo-cli" },
        }),
        null,
        2
      )
    );
    return;
  }

  if (command === "health") {
    const [connectionId] = args;
    if (!connectionId) {
      throw new Error("health requires <connectionId>");
    }
    console.log(JSON.stringify(await request("GET", `/v1/connections/${connectionId}/health`), null, 2));
    return;
  }

  if (command === "companies") {
    const [connectionId] = args;
    if (!connectionId) {
      throw new Error("companies requires <connectionId>");
    }
    console.log(JSON.stringify(await request("GET", `/v1/connections/${connectionId}/companies`), null, 2));
    return;
  }

  if (command === "ledgers") {
    const [connectionId] = args;
    if (!connectionId) {
      throw new Error("ledgers requires <connectionId>");
    }
    console.log(JSON.stringify(await request("GET", `/v1/connections/${connectionId}/ledgers`), null, 2));
    return;
  }

  if (command === "commands") {
    console.log(JSON.stringify(await request("GET", "/api/commands"), null, 2));
    return;
  }

  if (command === "command") {
    const [commandId] = args;
    if (!commandId) {
      throw new Error("command requires <commandId>");
    }
    console.log(JSON.stringify(await request("GET", `/v1/commands/${commandId}`), null, 2));
    return;
  }

  if (command === "queue") {
    const [connectionId, type, ...payloadParts] = args;
    if (!connectionId || !type) {
      throw new Error("queue requires <connectionId> <type> [jsonPayload]");
    }
    const payload = payloadParts.length > 0 ? parseLooseObject(payloadParts.join(" ")) : {};
    console.log(
      JSON.stringify(
        await request("POST", `/v1/connections/${connectionId}/commands`, {
          type,
          payload,
        }),
        null,
        2
      )
    );
    return;
  }

  if (command === "show-message") {
    const [connectorId, message] = args;
    if (!connectorId || !message) {
      throw new Error("show-message requires <connectorId> and <message>");
    }
    console.log(
      JSON.stringify(
        await request("POST", `/api/connectors/${connectorId}/commands/show-message`, { message }),
        null,
        2
      )
    );
    return;
  }

  if (command === "create-ledger") {
    const [connectorId, name, parent] = args;
    if (!connectorId || !name) {
      throw new Error("create-ledger requires <connectorId> and <ledger name>");
    }
    console.log(
      JSON.stringify(
        await request("POST", `/api/connectors/${connectorId}/commands/create-ledger`, {
          name,
          parent,
        }),
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
