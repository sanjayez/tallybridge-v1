"use strict";

const { createAgentConfig } = require("../../internal/config");
const { createLogger } = require("../../internal/diagnostics/logger");
const { createAgentQueue } = require("../../internal/queue");
const { createAgentRuntime } = require("../../internal/runtime/agent-runtime");

async function main() {
  let logger = null;
  const { config, persist } = createAgentConfig();
  logger = createLogger({ stateDir: config.stateDir, logLevel: config.logLevel });
  const queue = createAgentQueue({ stateDir: config.stateDir });
  const runtime = createAgentRuntime({ config, persist, logger, queue });

  logger.info("starting agent", {
    agentId: config.agentId,
    controlPlaneUrl: config.controlPlaneUrl,
    dryRun: config.dryRun,
    mockTallyUrl: config.mockTallyUrl,
    stateDir: config.stateDir,
  });

  await runtime.start();
}

main().catch((error) => {
  console.error(error);
  try {
    const { config } = createAgentConfig();
    const logger = createLogger({ stateDir: config.stateDir, logLevel: "info" });
    logger.error("agent exited during startup", {
      error: error.message,
      stack: error.stack,
    });
  } catch {
    // Keep the original stderr error visible if logging cannot initialize.
  }
  process.exit(1);
});
