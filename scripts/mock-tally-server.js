"use strict";

const http = require("http");

const HOST = process.env.MOCK_TALLY_HOST || "127.0.0.1";
const PORT = Number(process.env.MOCK_TALLY_PORT || 9000);

const state = {
  companies: ["Sanforge Solutions"],
  ledgers: ["Cash", "Sales", "Demo Customer"],
  tallyVersion: "Mock TallyPrime 5.0",
};

function sendXml(res, xml) {
  res.writeHead(200, {
    "Content-Type": "text/xml; charset=utf-8",
    "Content-Length": Buffer.byteLength(xml),
  });
  res.end(xml);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function companyEnvelope() {
  const companies = state.companies
    .map((company) => `<COMPANY NAME="${company}"><NAME>${company}</NAME></COMPANY>`)
    .join("");

  return `
<ENVELOPE>
  <BODY>
    <DATA>
      <TALLYVERSION>${state.tallyVersion}</TALLYVERSION>
      ${companies}
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

function ledgerEnvelope() {
  const ledgers = state.ledgers
    .map((ledger) => `<LEDGER NAME="${ledger}"><NAME>${ledger}</NAME></LEDGER>`)
    .join("");

  return `
<ENVELOPE>
  <BODY>
    <DATA>
      ${ledgers}
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

function importEnvelope(errorMessage = "") {
  return `
<ENVELOPE>
  <BODY>
    <DATA>
      <LINEERROR>${errorMessage}</LINEERROR>
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

function extractLedgerName(xml) {
  const match = xml.match(/<LEDGER\b[^>]*NAME="([^"]+)"/i);
  return match ? match[1] : null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  const xml = await readBody(req);
  if (xml.includes("List of Companies")) {
    sendXml(res, companyEnvelope());
    return;
  }

  if (xml.includes("List of Ledgers")) {
    sendXml(res, ledgerEnvelope());
    return;
  }

  if (xml.includes("Import Data")) {
    const ledgerName = extractLedgerName(xml);
    if (ledgerName && !state.ledgers.includes(ledgerName)) {
      state.ledgers.push(ledgerName);
      sendXml(res, importEnvelope(""));
      return;
    }

    sendXml(res, importEnvelope(ledgerName ? "Ledger already exists" : "Ledger name missing"));
    return;
  }

  sendXml(res, `
<ENVELOPE>
  <BODY>
    <DATA>
      <UNKNOWN>1</UNKNOWN>
    </DATA>
  </BODY>
</ENVELOPE>`.trim());
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-tally] listening on http://${HOST}:${PORT}`);
});
