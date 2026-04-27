"use strict";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildEnvelope(innerXml) {
  return [
    "<ENVELOPE>",
    "  <HEADER>",
    "    <TALLYREQUEST>Import Data</TALLYREQUEST>",
    "  </HEADER>",
    "  <BODY>",
    "    <IMPORTDATA>",
    "      <REQUESTDESC>",
    "        <REPORTNAME>All Masters</REPORTNAME>",
    "      </REQUESTDESC>",
    "      <REQUESTDATA>",
    innerXml,
    "      </REQUESTDATA>",
    "    </IMPORTDATA>",
    "  </BODY>",
    "</ENVELOPE>",
  ].join("\n");
}

function buildLedgerCreateXml({ name, parent = "Sundry Debtors", isBillWiseOn = true }) {
  if (!name) {
    throw new Error("Ledger name is required");
  }

  return buildEnvelope(
    [
      '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      `          <LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
      '            <NAME.LIST TYPE="String">',
      `              <NAME>${escapeXml(name)}</NAME>`,
      "            </NAME.LIST>",
      `            <PARENT>${escapeXml(parent)}</PARENT>`,
      `            <ISBILLWISEON>${isBillWiseOn ? "Yes" : "No"}</ISBILLWISEON>`,
      "          </LEDGER>",
      "        </TALLYMESSAGE>",
    ].join("\n")
  );
}

module.exports = {
  buildLedgerCreateXml,
  escapeXml,
};
