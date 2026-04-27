"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const TALLY_PROCESS_NAMES = new Set(["tally.exe", "tallyprime.exe", "tallyprimeserver.exe"]);

function parseTasklistCsvLine(line) {
  const values = [];
  const regex = /"([^"]*)",?/g;
  let match = regex.exec(line);
  while (match) {
    values.push(match[1]);
    match = regex.exec(line);
  }
  return values;
}

async function findTallyProcess() {
  if (process.platform !== "win32") {
    return {
      running: false,
      processName: null,
      pid: null,
      checked: false,
      reason: "non_windows",
    };
  }

  try {
    const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 5000,
    });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const [imageName, pid] = parseTasklistCsvLine(line);
      if (imageName && TALLY_PROCESS_NAMES.has(imageName.toLowerCase())) {
        return {
          running: true,
          processName: imageName,
          pid,
          checked: true,
          reason: null,
        };
      }
    }
  } catch (error) {
    return {
      running: false,
      processName: null,
      pid: null,
      checked: false,
      reason: error.message,
    };
  }

  return {
    running: false,
    processName: null,
    pid: null,
    checked: true,
    reason: null,
  };
}

function createDiscovery({ config, tallyClient }) {
  async function inspect() {
    if (config.dryRun) {
      return {
        reachable: true,
        tallyProcessRunning: true,
        tallyProcessName: "dry-run",
        tallyProcessId: null,
        company: "Dry Run Co",
        companies: ["Dry Run Co"],
        tallyVersion: "DryRun Prime 1.0",
      };
    }

    const tallyProcess = config.mockTallyUrl
      ? {
          running: true,
          processName: "mock-tally",
          pid: null,
          checked: true,
          reason: null,
        }
      : await findTallyProcess();

    try {
      const result = await tallyClient.listCompanies();
      return {
        reachable: true,
        tallyProcessRunning: tallyProcess.running || true,
        tallyProcessName: tallyProcess.processName,
        tallyProcessId: tallyProcess.pid,
        tallyProcessChecked: tallyProcess.checked,
        tallyProcessReason: tallyProcess.reason,
        company: result.companies[0] || null,
        companies: result.companies,
        tallyVersion: result.tallyVersion || "Unknown",
      };
    } catch (error) {
      return {
        reachable: false,
        tallyProcessRunning: tallyProcess.running,
        tallyProcessName: tallyProcess.processName,
        tallyProcessId: tallyProcess.pid,
        tallyProcessChecked: tallyProcess.checked,
        tallyProcessReason: tallyProcess.reason,
        company: null,
        companies: [],
        tallyVersion: null,
        error,
      };
    }
  }

  return {
    inspect,
  };
}

module.exports = {
  createDiscovery,
};
