/**
 * Mock bridge API for BR_Bridge.tdl
 * Run: node scripts/bridge-test-server.js
 * Default: show_message. For import_xml test, set URL in TDL to ...?mode=import
 */

const http = require("http");

const HOST = "127.0.0.1";
const PORT = 8000;
const PATH = "/tally/bridge";
const EXPECTED_AUTH = "Bearer dev-token";

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url.split("?")[0] !== PATH) {
    res.writeHead(404);
    res.end();
    return;
  }

  const auth = req.headers.authorization || "";
  if (auth !== EXPECTED_AUTH) {
    console.warn("[bridge] bad Authorization:", auth || "(missing)");
    sendJson(res, 401, { error: "expected Authorization: Bearer dev-token" });
    return;
  }

  let raw = "";
  req.on("data", (c) => {
    raw += c;
  });
  req.on("end", () => {
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { _raw: raw };
    }
    console.log("[bridge] POST", new Date().toISOString());
    console.log("[bridge] body:", JSON.stringify(body, null, 2));

    const mode = new URL(req.url, "http://127.0.0.1").searchParams.get("mode");
    let out;
    if (mode === "import") {
      out = {
        cmd: "import_xml",
        xml:
          "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST>" +
          "<TYPE>Data</TYPE><ID>All Masters</ID></HEADER><BODY><DATA></DATA></BODY></ENVELOPE>",
      };
    } else {
      out = { cmd: "show_message", message: "Bridge connected (mock server)" };
    }
    sendJson(res, 200, out);
    console.log("[bridge] response:", out);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Bridge mock listening on http://${HOST}:${PORT}${PATH}`);
  console.log("In Tally: open a company, Gateway of Tally -> Bridge Test (Alt+B)");
});
