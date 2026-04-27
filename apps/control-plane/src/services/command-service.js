"use strict";

function createCommandService({ store }) {
  function queueCommand({ connectionId, type, company, payload, idempotencyKey, origin }) {
    return store.enqueueCommand({
      connectionId,
      type,
      company,
      payload,
      idempotencyKey,
      origin,
    });
  }

  function listCommands(connectionId = null) {
    return store.listCommands(connectionId);
  }

  function getCommand(commandId) {
    return store.getCommandById(commandId);
  }

  function claimCommandForAgent(agentToken, heartbeat) {
    const connection = store.recordHeartbeat(agentToken, heartbeat);
    if (!connection) {
      return null;
    }

    return {
      connection,
      command: store.claimNextQueuedCommand(connection.id),
    };
  }

  function completeAgentCommand(commandId, status, result, error) {
    return store.completeCommand({
      commandId,
      status,
      result,
      error,
    });
  }

  function recordAgentEvent(agentToken, eventPayload) {
    const connection = store.getConnectionByAgentToken(agentToken);
    if (!connection) {
      return null;
    }

    store.recordEvent({
      connectionId: connection.id,
      type: eventPayload.type || "agent.event",
      payload: eventPayload,
      at: eventPayload.ts || eventPayload.sent_at || null,
    });

    return connection;
  }

  async function waitForCompletion(commandId, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const command = store.getCommandById(commandId);
      if (!command) {
        return null;
      }

      if (command.status === "completed" || command.status === "failed") {
        return command;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return store.getCommandById(commandId);
  }

  return {
    claimCommandForAgent,
    completeAgentCommand,
    getCommand,
    listCommands,
    queueCommand,
    recordAgentEvent,
    waitForCompletion,
  };
}

module.exports = {
  createCommandService,
};
