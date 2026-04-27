"use strict";

const { buildLedgerCreateXml } = require("../../../src/tally-xml");

function buildExportEnvelope(collectionName) {
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>${collectionName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractTagValues(xml, tagName) {
  const regex = new RegExp(`<${tagName}(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const matches = [];
  let match = regex.exec(xml);
  while (match) {
    matches.push(decodeXml(match[1]));
    match = regex.exec(xml);
  }
  return matches;
}

function extractAttributeValues(xml, tagName, attributeName) {
  const regex = new RegExp(`<${tagName}(?=[\\s>])[^>]*${attributeName}="([^"]+)"`, "gi");
  const matches = [];
  let match = regex.exec(xml);
  while (match) {
    matches.push(decodeXml(match[1]));
    match = regex.exec(xml);
  }
  return matches;
}

async function postXml(url, xml, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
      body: xml,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tally HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function createTallyClient({ config }) {
  function getEndpointUrl() {
    return config.mockTallyUrl || config.tallyUrl;
  }

  async function listCompanies() {
    if (config.dryRun) {
      return {
        companies: ["Dry Run Co"],
        tallyVersion: "DryRun Prime 1.0",
        rawXml: "<DRY_RUN/>",
      };
    }

    const rawXml = await postXml(getEndpointUrl(), buildExportEnvelope("List of Companies"));
    const companies = uniqueStrings([
      ...extractAttributeValues(rawXml, "COMPANY", "NAME"),
      ...extractTagValues(rawXml, "NAME"),
    ]);
    const tallyVersion = extractTagValues(rawXml, "TALLYVERSION")[0] || "Unknown";
    return {
      companies,
      tallyVersion,
      rawXml,
    };
  }

  async function listLedgers() {
    if (config.dryRun) {
      return {
        ledgers: [
          { name: "Cash" },
          { name: "Sales" },
        ],
        rawXml: "<DRY_RUN/>",
      };
    }

    const rawXml = await postXml(getEndpointUrl(), buildExportEnvelope("List of Ledgers"));
    const ledgers = uniqueStrings([
      ...extractAttributeValues(rawXml, "LEDGER", "NAME"),
      ...extractTagValues(rawXml, "NAME"),
    ]).map((name) => ({ name }));
    return {
      ledgers,
      rawXml,
    };
  }

  async function createLedger(payload) {
    if (config.dryRun) {
      return {
        ok: true,
        created: true,
        ledgerName: payload.name,
        rawXml: "<DRY_RUN/>",
      };
    }

    const rawXml = await postXml(
      getEndpointUrl(),
      buildLedgerCreateXml({
        name: payload.name,
        parent: payload.parent || "Sundry Debtors",
        isBillWiseOn: payload.isBillWiseOn !== false,
      })
    );

    const lineError = extractTagValues(rawXml, "LINEERROR")[0] || null;
    return {
      ok: !lineError,
      created: !lineError,
      ledgerName: payload.name,
      rawXml,
      lineError,
    };
  }

  async function executeCommand(command) {
    switch (command.type) {
      case "tally.list_companies": {
        const result = await listCompanies();
        return {
          data: {
            companies: result.companies,
            tallyVersion: result.tallyVersion,
          },
          meta: {
            rawXmlLength: result.rawXml.length,
          },
        };
      }
      case "tally.list_ledgers": {
        const result = await listLedgers();
        return {
          data: result.ledgers,
          meta: {
            count: result.ledgers.length,
            rawXmlLength: result.rawXml.length,
          },
        };
      }
      case "tally.create_ledger": {
        const result = await createLedger(command.payload || {});
        if (!result.ok) {
          const error = new Error(result.lineError || "Tally rejected ledger import");
          error.code = "IMPORT_REJECTED";
          throw error;
        }
        return {
          data: {
            created: true,
            ledgerName: result.ledgerName,
          },
          meta: {
            rawXmlLength: result.rawXml.length,
          },
        };
      }
      default: {
        const error = new Error(`Unsupported command type: ${command.type}`);
        error.code = "UNSUPPORTED_OPERATION";
        throw error;
      }
    }
  }

  return {
    executeCommand,
    listCompanies,
    listLedgers,
  };
}

module.exports = {
  createTallyClient,
};
