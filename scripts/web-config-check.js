"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const nextConfigPath = path.join(repoRoot, "apps", "web", "next.config.mjs");
const dashboardPath = path.join(repoRoot, "apps", "web", "app", "ui", "dashboard.js");
const routesPath = path.join(repoRoot, "apps", "control-plane", "src", "routes", "index.js");
const packagePath = path.join(repoRoot, "package.json");

const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
const dashboard = fs.readFileSync(dashboardPath, "utf8");
const routes = fs.readFileSync(routesPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

const requiredConfigSnippets = [
  "allowedDevOrigins",
  "\"127.0.0.1\"",
  "\"localhost\"",
  "/control/:path*",
];

const requiredDashboardSnippets = [
  "buildInstallCommand",
  "/install/${pairingCode}",
  "latestInstall",
  "Click Create or repair to generate a fresh one-line setup command.",
];

const missing = [];
for (const snippet of requiredConfigSnippets) {
  if (!nextConfig.includes(snippet)) {
    missing.push(`apps/web/next.config.mjs missing ${snippet}`);
  }
}

for (const snippet of requiredDashboardSnippets) {
  if (!dashboard.includes(snippet)) {
    missing.push(`apps/web/app/ui/dashboard.js missing ${snippet}`);
  }
}

const webScript = packageJson.scripts?.web || "";
if (!webScript.includes("-H 127.0.0.1")) {
  missing.push("package.json web script must bind Next.js to 127.0.0.1 to avoid firewall prompts");
}

if (!packageJson.scripts?.["start:api"] || !packageJson.scripts?.["start:web"] || !packageJson.scripts?.["build:web"]) {
  missing.push("package.json must define start:api, build:web, and start:web for Railway deployment");
}

for (const snippet of ["/download/bridge-manifest.json", "/download/bridge-file", "Invoke-RestMethod"]) {
  if (!routes.includes(snippet)) {
    missing.push(`apps/control-plane/src/routes/index.js missing hosted bootstrap snippet ${snippet}`);
  }
}

if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log("Web config check passed.");
