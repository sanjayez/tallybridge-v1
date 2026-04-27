"use strict";

const { buildLedgerCreateXml } = require("../../../../src/tally-xml");

function fallbackConnectorIdFromToken(token) {
  if (!token) {
    return "";
  }

  return `token-${token.slice(0, 12)}`;
}

function mapLegacyCommand(command) {
  if (!command) {
    return { cmd: "noop", message: "No pending command" };
  }

  if (command.type === "show_message") {
    return {
      cmd: "show_message",
      commandId: command.id,
      message: command.payload.message,
    };
  }

  if (command.type === "import_xml") {
    return {
      cmd: "import_xml",
      commandId: command.id,
      message: command.payload.message || "",
      xml: command.payload.xml,
    };
  }

  return {
    cmd: "show_message",
    commandId: command.id,
    message: `Unsupported legacy command type: ${command.type}`,
  };
}

function createLegacyBridgeService({ store }) {
  function handleBridgePoll(body, token) {
    const connectorId =
      body.connectorId ||
      body.connector_id ||
      (body.ENVELOPE && body.ENVELOPE.connectorId) ||
      fallbackConnectorIdFromToken(token);

    if (!connectorId) {
      throw new Error("Missing connector identity in bridge payload and Authorization header");
    }

    const connection = store.upsertLegacyConnection({
      connectorId,
      token,
      company: body.company || body.companyName || "",
      source: body.source || "tally-bridge-mvp",
      tallyVersion: body.tallyVersion || body.tally_version || "",
      machineName: body.machineName || body.machine_name || "",
      installId: body.installId || body.install_id || connectorId,
      event: body.event || "poll",
      payload: body,
    });

    if (!token && !connection) {
      throw new Error("Missing Bearer token for connector");
    }

    return mapLegacyCommand(store.claimNextQueuedCommand(connection.id));
  }

  function handleBridgeResult(token, body) {
    const connection = store.getConnectionByAgentToken(token);
    if (!connection) {
      return null;
    }

    if (!body.commandId) {
      throw new Error("Missing commandId");
    }

    return store.completeCommand({
      commandId: body.commandId,
      status: body.status || "completed",
      result: {
        connectorId: connection.id,
        message: body.message || "",
        importError: body.importError || "",
        raw: body,
      },
      error: body.importError
        ? {
            code: "IMPORT_REJECTED",
            message: body.importError,
            retryable: false,
          }
        : null,
    });
  }

  function queueShowMessage(connectionId, message) {
    return store.enqueueCommand({
      connectionId,
      type: "show_message",
      payload: { message },
      idempotencyKey: null,
      origin: "legacy-demo",
    });
  }

  function queueCreateLedger(connectionId, { name, parent, isBillWiseOn }) {
    return store.enqueueCommand({
      connectionId,
      type: "import_xml",
      payload: {
        message: `Create ledger ${name}`,
        xml: buildLedgerCreateXml({
          name,
          parent,
          isBillWiseOn,
        }),
        operation: "create_ledger",
      },
      idempotencyKey: null,
      origin: "legacy-demo",
    });
  }

  return {
    handleBridgePoll,
    handleBridgeResult,
    queueCreateLedger,
    queueShowMessage,
  };
}

module.exports = {
  createLegacyBridgeService,
};
