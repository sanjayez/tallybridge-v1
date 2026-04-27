"use strict";

const { spawn } = require("child_process");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT || process.env.WEB_PORT || "3000";
const host = process.env.WEB_HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const child = spawn(process.execPath, [nextBin, "start", "apps/web", "-H", host, "-p", port], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
