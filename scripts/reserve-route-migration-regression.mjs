#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ownedRoots = [
  "app/reserve",
  "app/api/reserve",
  "app/api/v1/reserve",
  "app/api/reservations",
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = ownedRoots
  .flatMap((dir) => walk(path.join(root, dir)))
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .sort();

if (sourceFiles.length < 60) {
  throw new Error(`Expected the Reserve migration surface to contain at least 60 route files; found ${sourceFiles.length}.`);
}

const mismatches = [];
for (const source of sourceFiles) {
  const relative = path.relative(root, source);
  const isolated = path.join(root, "apps/reserve", relative);
  if (!fs.existsSync(isolated)) {
    mismatches.push(`${relative}: missing isolated copy`);
    continue;
  }
  const sourceText = fs.readFileSync(source, "utf8");
  const isolatedText = fs.readFileSync(isolated, "utf8");
  if (sourceText !== isolatedText) mismatches.push(`${relative}: content drift`);
}

if (mismatches.length) {
  throw new Error(`Reserve route migration parity failed:\n${mismatches.join("\n")}`);
}

const tsconfig = fs.readFileSync(path.join(root, "apps/reserve/tsconfig.json"), "utf8");
if (!tsconfig.includes('"@/*": ["../../*"]')) {
  throw new Error("Reserve app must resolve shared root dependencies during the migration window.");
}

console.log(`Reserve route migration parity passed for ${sourceFiles.length} files.`);
