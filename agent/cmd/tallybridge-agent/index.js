"use strict";

const { createAgentConfig } = require("../../internal/config");
const { createLogger } = require("../../internal/diagnostics/logger");
const { createAgentQueue } = require("../../internal/queue");
const { createAgentRuntime } = require("../../internal/runtime/agent-runtime");

async function main() {
  const { config, persist } = createAgentConfig();
  const logger = createLogger({ stateDir: config.stateDir, logLevel: config.logLevel });
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
  process.exit(1);
});
