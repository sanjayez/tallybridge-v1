"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAgentQueue } = require("../agent/internal/queue");

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "tallybridge-agent-queue-"));
process.env.TALLYBRIDGE_AGENT_QUEUE_DRIVER = "file";

const queue = createAgentQueue({ stateDir });
queue.recordEvent("compat.check", { ok: true });
queue.recordExecution({
  commandId: "compat-command",
  commandType: "tally.compat",
  status: "completed",
  result: { ok: true },
  error: null,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
});

const stats = queue.getStats();
const executions = queue.listRecentExecutions();

if (stats.driver !== "file" || stats.eventCount !== 1 || executions[0]?.commandId !== "compat-command") {
  throw new Error("Agent JSONL queue compatibility check failed");
}

console.log("Agent queue compatibility check passed.");
