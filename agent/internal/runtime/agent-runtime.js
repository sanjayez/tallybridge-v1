"use strict";

const { createControlPlaneClient } = require("../cloud/control-plane-client");
const { createDiscovery } = require("../discovery");
const { createLoopbackServer } = require("../loopback/server");
const { createTallyClient } = require("../tallyhttp");

function createAgentRuntime({ config, persist, logger, queue }) {
  const cloudClient = createControlPlaneClient({ controlPlaneUrl: config.controlPlaneUrl });
  const tallyClient = createTallyClient({ config });
  const discovery = createDiscovery({ config, tallyClient });
  const runtimeState = {
    activeCompany: null,
    agentToken: config.agentToken,
    connectionId: config.connectionId,
    lastCommandMs: null,
    lastEventAt: null,
    lastEventType: null,
    loopbackSeen: false,
    mode: config.mode || "xml_only",
    status: "pending",
    timer: null,
  };

  async function ensurePaired() {
    if (runtimeState.agentToken && runtimeState.connectionId) {
      return;
    }

    if (!config.pairingCode) {
      throw new Error("Agent is not paired and no --pairing-code was provided");
    }

    const response = await cloudClient.pairAgent({
      pairing_code: config.pairingCode,
      agent_id: config.agentId,
      agent_version: config.agentVersion,
      install_mode: "user",
      machine_name: process.env.COMPUTERNAME || "unknown",
      mode: runtimeState.mode,
    });

    runtimeState.agentToken = response.data.agent_token;
    runtimeState.connectionId = response.data.connection.id;

    persist({
      agentId: config.agentId,
      agentToken: runtimeState.agentToken,
      connectionId: runtimeState.connectionId,
      controlPlaneUrl: config.controlPlaneUrl,
      mode: runtimeState.mode,
    });

    logger.info("agent paired", {
      connectionId: runtimeState.connectionId,
      agentId: config.agentId,
    });
  }

  async function onEvent(eventPayload) {
    runtimeState.lastEventAt = eventPayload.ts || new Date().toISOString();
    runtimeState.lastEventType = eventPayload.type || "loopback.event";
    runtimeState.loopbackSeen = true;
    runtimeState.mode = "event_bridge";

    if (runtimeState.agentToken) {
      await cloudClient.submitEvents(runtimeState.agentToken, [eventPayload]);
    }
  }

  async function onHeartbeat(heartbeatPayload) {
    runtimeState.lastEventAt = heartbeatPayload.ts || heartbeatPayload.sent_at || new Date().toISOString();
    runtimeState.lastEventType = "loopback.heartbeat";
    runtimeState.loopbackSeen = true;
    runtimeState.mode = "event_bridge";

    if (runtimeState.agentToken) {
      await cloudClient.submitEvents(runtimeState.agentToken, [
        {
          type: "heartbeat.local",
          ts: runtimeState.lastEventAt,
          payload: heartbeatPayload,
        },
      ]);
    }
  }

  function classifyStatus(probe) {
    if (!probe.reachable) {
      return "inactive";
    }

    if (runtimeState.loopbackSeen || runtimeState.mode === "event_bridge") {
      return "active";
    }

    return "active_degraded";
  }

  async function buildHeartbeat() {
    const probe = await discovery.inspect();
    runtimeState.activeCompany = probe.company;
    runtimeState.status = classifyStatus(probe);

    const queueStats = queue.getStats();
    return {
      schema_version: "v1",
      connection_id: runtimeState.connectionId,
      agent_id: config.agentId,
      status: runtimeState.status,
      mode: runtimeState.loopbackSeen ? "event_bridge" : runtimeState.mode,
      install_mode: "user",
      bridge_status: "online",
      tally_status: probe.reachable ? "online" : probe.tallyProcessRunning ? "xml_unreachable" : "offline",
      tally_process_status: probe.tallyProcessRunning ? "running" : "stopped",
      tally_process_name: probe.tallyProcessName || null,
      tally_process_id: probe.tallyProcessId || null,
      tdl_status: runtimeState.loopbackSeen ? "online" : "not_loaded",
      company: probe.company,
      tally_version: probe.tallyVersion,
      queue_depth: queueStats.eventCount,
      last_command_ms: runtimeState.lastCommandMs,
      last_event_at: runtimeState.lastEventAt || queueStats.lastEventAt,
      last_event_type: runtimeState.lastEventType,
      sent_at: new Date().toISOString(),
    };
  }

  async function executeCommand(command) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    try {
      logger.info("executing command", {
        commandId: command.id,
        type: command.type,
      });
      const result = await tallyClient.executeCommand(command);
      const completedAt = new Date().toISOString();
      runtimeState.lastCommandMs = Date.now() - startedMs;
      queue.recordExecution({
        commandId: command.id,
        commandType: command.type,
        status: "completed",
        result,
        error: null,
        startedAt,
        completedAt,
      });
      await cloudClient.submitResult(runtimeState.agentToken, {
        schema_version: "v1",
        command_id: command.id,
        connection_id: runtimeState.connectionId,
        status: "completed",
        completed_at: completedAt,
        duration_ms: runtimeState.lastCommandMs,
        data: result,
        error: null,
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      runtimeState.lastCommandMs = Date.now() - startedMs;
      const normalizedError = {
        code: error.code || "TALLY_UNREACHABLE",
        message: error.message,
        retryable: false,
      };
      queue.recordExecution({
        commandId: command.id,
        commandType: command.type,
        status: "failed",
        result: null,
        error: normalizedError,
        startedAt,
        completedAt,
      });
      await cloudClient.submitResult(runtimeState.agentToken, {
        schema_version: "v1",
        command_id: command.id,
        connection_id: runtimeState.connectionId,
        status: "failed",
        completed_at: completedAt,
        duration_ms: runtimeState.lastCommandMs,
        data: null,
        error: normalizedError,
      });
    }
  }

  async function tick() {
    const heartbeat = await buildHeartbeat();
    const response = await cloudClient.poll(runtimeState.agentToken, heartbeat);
    const command = response.data.command;
    if (command) {
      await executeCommand(command);
    }
  }

  async function start() {
    await ensurePaired();

    const loopback = createLoopbackServer({
      host: config.loopbackHost,
      port: config.loopbackPort,
      logger,
      queue,
      onEvent,
      onHeartbeat,
    });
    await loopback.start();

    if (config.once) {
      await tick();
      await loopback.stop();
      return;
    }

    runtimeState.timer = setInterval(() => {
      tick().catch((error) => {
        logger.error("agent poll tick failed", { error: error.message });
      });
    }, config.pollIntervalMs);

    process.on("SIGINT", async () => {
      clearInterval(runtimeState.timer);
      await loopback.stop();
      process.exit(0);
    });

    await tick();
  }

  return {
    start,
  };
}

module.exports = {
  createAgentRuntime,
};
