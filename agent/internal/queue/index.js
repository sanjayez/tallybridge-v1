"use strict";

const fs = require("fs");
const path = require("path");
let DatabaseSync = null;

try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

function jsonStringify(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function jsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => jsonParse(line, null))
    .filter(Boolean);
}

function appendJsonLine(filePath, record) {
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function createFileAgentQueue({ stateDir }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const dbPath = path.join(stateDir, "agent-state.jsonl");
  const eventsPath = path.join(stateDir, "agent-events.jsonl");
  const executionsPath = path.join(stateDir, "agent-executions.jsonl");

  function recordEvent(type, payload) {
    appendJsonLine(eventsPath, {
      type,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  function recordExecution({ commandId, commandType, status, result, error, startedAt, completedAt }) {
    appendJsonLine(executionsPath, {
      commandId,
      commandType,
      status,
      result: result === undefined ? null : result,
      error: error === undefined ? null : error,
      startedAt,
      completedAt: completedAt || null,
    });
  }

  function getStats() {
    const events = readJsonLines(eventsPath);
    const lastEvent = events[events.length - 1] || null;
    return {
      dbPath,
      driver: "file",
      eventCount: events.length,
      lastEventAt: lastEvent ? lastEvent.createdAt : null,
    };
  }

  function listRecentExecutions() {
    return readJsonLines(executionsPath)
      .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
      .slice(0, 20);
  }

  return {
    dbPath,
    getStats,
    listRecentExecutions,
    recordEvent,
    recordExecution,
  };
}

function createSqliteAgentQueue({ stateDir }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const dbPath = path.join(stateDir, "agent-state.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executions (
      execution_id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT,
      error_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  const statements = {
    insertEvent: db.prepare(`
      INSERT INTO events (type, payload_json, created_at)
      VALUES (@type, @payload_json, @created_at)
    `),
    insertExecution: db.prepare(`
      INSERT INTO executions (
        command_id, command_type, status, result_json, error_json, started_at, completed_at
      ) VALUES (
        @command_id, @command_type, @status, @result_json, @error_json, @started_at, @completed_at
      )
    `),
    countEvents: db.prepare("SELECT COUNT(*) AS count FROM events"),
    lastEventAt: db.prepare("SELECT created_at FROM events ORDER BY created_at DESC LIMIT 1"),
    recentExecutions: db.prepare(`
      SELECT * FROM executions
      ORDER BY started_at DESC
      LIMIT 20
    `),
  };

  function recordEvent(type, payload) {
    statements.insertEvent.run({
      type,
      payload_json: jsonStringify(payload, {}),
      created_at: new Date().toISOString(),
    });
  }

  function recordExecution({ commandId, commandType, status, result, error, startedAt, completedAt }) {
    statements.insertExecution.run({
      command_id: commandId,
      command_type: commandType,
      status,
      result_json: jsonStringify(result, null),
      error_json: jsonStringify(error, null),
      started_at: startedAt,
      completed_at: completedAt || null,
    });
  }

  function getStats() {
    const countRow = statements.countEvents.get();
    const lastEventRow = statements.lastEventAt.get();
    return {
      dbPath,
      driver: "sqlite",
      eventCount: countRow ? countRow.count : 0,
      lastEventAt: lastEventRow ? lastEventRow.created_at : null,
    };
  }

  function listRecentExecutions() {
    return statements.recentExecutions.all().map((row) => ({
      commandId: row.command_id,
      commandType: row.command_type,
      status: row.status,
      result: jsonParse(row.result_json, null),
      error: jsonParse(row.error_json, null),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  }

  return {
    dbPath,
    getStats,
    listRecentExecutions,
    recordEvent,
    recordExecution,
  };
}

function createAgentQueue({ stateDir }) {
  if (process.env.TALLYBRIDGE_AGENT_QUEUE_DRIVER === "file" || !DatabaseSync) {
    return createFileAgentQueue({ stateDir });
  }

  return createSqliteAgentQueue({ stateDir });
}

module.exports = {
  createAgentQueue,
};
