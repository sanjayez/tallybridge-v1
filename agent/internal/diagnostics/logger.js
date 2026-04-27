"use strict";

const fs = require("fs");
const path = require("path");

function createLogger({ stateDir, logLevel = "info" }) {
  const levels = ["debug", "info", "warn", "error"];
  const activeIndex = levels.indexOf(logLevel);
  const minimumIndex = activeIndex === -1 ? 1 : activeIndex;
  const logDir = path.join(stateDir, "logs");
  const logFile = path.join(logDir, "agent.log");

  fs.mkdirSync(logDir, { recursive: true });

  function write(level, message, data = null) {
    const levelIndex = levels.indexOf(level);
    if (levelIndex < minimumIndex) {
      return;
    }

    const record = {
      ts: new Date().toISOString(),
      level,
      message,
      data,
    };
    const line = JSON.stringify(record);
    fs.appendFileSync(logFile, `${line}\n`);

    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleMethod(`[agent] ${record.ts} ${level.toUpperCase()} ${message}`, data || "");
  }

  return {
    debug(message, data) {
      write("debug", message, data);
    },
    error(message, data) {
      write("error", message, data);
    },
    info(message, data) {
      write("info", message, data);
    },
    logFile,
    warn(message, data) {
      write("warn", message, data);
    },
  };
}

module.exports = {
  createLogger,
};
