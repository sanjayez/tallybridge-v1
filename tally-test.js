const axios = require("axios");

const TALLY_URL = "http://localhost:9000";

async function postXML(xml) {
  const res = await axios.post(TALLY_URL, xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
    timeout: 10000,
  });

  return res.data;
}

async function readLedgers() {
  const xml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

  const result = await postXML(xml);
  console.log("\n=== READ LEDGERS RESPONSE ===\n");
  console.log(result);
}

async function createLedger() {
  const ledgerName = `Test Ledger ${Date.now()}`;

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${ledgerName}" ACTION="Create">
            <NAME.LIST TYPE="String">
              <NAME>${ledgerName}</NAME>
            </NAME.LIST>
            <PARENT>Sundry Debtors</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`.trim();

  const result = await postXML(xml);
  console.log("\n=== CREATE LEDGER RESPONSE ===\n");
  console.log(result);
}

async function main() {
  try {
    await readLedgers();
    await createLedger();
  } catch (err) {
    console.error("\nERROR:\n");
    if (err.response) {
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

main();