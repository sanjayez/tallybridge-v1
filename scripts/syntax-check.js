"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const excludedDirectories = new Set(["node_modules", "runlogs", "data"]);
const allowedExtensions = new Set([".js"]);

function collectJsFiles(directory) {
  if (directory.includes(`${path.sep}apps${path.sep}web`)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...collectJsFiles(fullPath));
      }
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const jsFiles = collectJsFiles(repoRoot);
const failures = [];

for (const filePath of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures.push({
      filePath,
      stderr: result.stderr.trim(),
    });
  }
}

if (failures.length > 0) {
  console.error("Syntax check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.filePath}`);
    console.error(failure.stderr);
  }
  process.exit(1);
}

console.log(`Syntax check passed for ${jsFiles.length} JavaScript files.`);
