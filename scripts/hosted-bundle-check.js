"use strict";

const fs = require("fs");
const path = require("path");
const moduleBuiltin = require("module");

const repoRoot = path.join(__dirname, "..");
const bundleRoots = ["agent", "tdl", path.join("installer", "windows")];
const bundleFiles = [path.join("src", "tally-xml.js")];
const bundleExtensions = new Set([".js", ".ps1", ".tdl", ".tpj"]);
const builtins = new Set(moduleBuiltin.builtinModules.concat(moduleBuiltin.builtinModules.map((name) => `node:${name}`)));

function toBundlePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectBundleFiles() {
  const files = new Set();

  function add(relativePath) {
    if (!bundleExtensions.has(path.extname(relativePath).toLowerCase())) {
      return;
    }

    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      files.add(toBundlePath(relativePath));
    }
  }

  function walk(relativeDir) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
      return;
    }

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }

      add(relativePath);
    }
  }

  for (const root of bundleRoots) {
    walk(root);
  }

  for (const file of bundleFiles) {
    add(file);
  }

  return files;
}

function resolveRelativeRequire(fromBundlePath, specifier) {
  const fromDir = path.dirname(fromBundlePath);
  const candidateBase = path.posix.normalize(path.posix.join(fromDir.split(path.sep).join("/"), specifier));
  const candidates = [
    candidateBase,
    `${candidateBase}.js`,
    `${candidateBase}.json`,
    path.posix.join(candidateBase, "index.js"),
  ];
  return candidates.map((candidate) => candidate.replace(/^\.\//, ""));
}

const bundle = collectBundleFiles();
const missing = [];
const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/g;

for (const bundlePath of bundle) {
  if (!bundlePath.endsWith(".js")) {
    continue;
  }

  const absolutePath = path.join(repoRoot, bundlePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  let match = requirePattern.exec(source);
  while (match) {
    const specifier = match[1];
    if (specifier.startsWith(".")) {
      const candidates = resolveRelativeRequire(bundlePath, specifier);
      if (!candidates.some((candidate) => bundle.has(candidate))) {
        missing.push(`${bundlePath} requires ${specifier}, but none of ${candidates.join(", ")} are bundled`);
      }
    } else if (!builtins.has(specifier)) {
      missing.push(`${bundlePath} requires package ${specifier}; hosted bundle must stay dependency-free`);
    }
    match = requirePattern.exec(source);
  }
}

if (missing.length) {
  console.error("Hosted bundle check failed:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Hosted bundle check passed for ${bundle.size} files.`);
