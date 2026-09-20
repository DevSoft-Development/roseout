#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rootApp = path.join(root, "app");
const consumerApp = path.join(root, "apps/consumer/app");

const excludedPrefixes = [
  "admin/",
  "business/",
  "reserve/",
  "locations/dashboard/",
  "api/admin/",
  "api/business/",
  "api/reserve/",
  "api/v1/reserve/",
  "api/internal/reserve/",
  "api/locations/",
  "auth/admin/",
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function isExcluded(relative) {
  const normalized = relative.split(path.sep).join("/");
  return excludedPrefixes.some((prefix) => normalized.startsWith(prefix));
}

const rootFiles = walk(rootApp).filter((file) => /\.(ts|tsx|js|jsx|css)$/.test(file));
const publicFiles = rootFiles.filter((file) => !isExcluded(path.relative(rootApp, file)));
const mismatches = [];

for (const source of publicFiles) {
  const relative = path.relative(rootApp, source);
  const isolated = path.join(consumerApp, relative);
  if (!fs.existsSync(isolated)) {
    mismatches.push(`${relative}: missing isolated consumer copy`);
    continue;
  }
  if (fs.readFileSync(source, "utf8") !== fs.readFileSync(isolated, "utf8")) {
    mismatches.push(`${relative}: consumer copy drift`);
  }
}

for (const file of walk(consumerApp)) {
  const relative = path.relative(consumerApp, file);
  if (isExcluded(relative)) {
    mismatches.push(`${relative}: private surface leaked into consumer app`);
  }
}

if (publicFiles.length < 400) {
  throw new Error(`Expected at least 400 public consumer files; found ${publicFiles.length}.`);
}
if (mismatches.length) {
  throw new Error(`Consumer surface migration failed:\n${mismatches.join("\n")}`);
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "apps/consumer/tsconfig.json"), "utf8"));
if (tsconfig?.compilerOptions?.paths?.["@/*"]?.[0] !== "../../*") {
  throw new Error("Consumer app must resolve shared root dependencies during the migration window.");
}

for (const required of [
  "apps/consumer/app/page.tsx",
  "apps/consumer/app/about/page.tsx",
  "apps/consumer/app/explore/page.tsx",
  "apps/consumer/app/create/page.tsx",
  "apps/consumer/app/api/generate/route.ts",
  "apps/consumer/app/api/auth/sign-in/route.ts",
]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`Missing required consumer route: ${required}`);
  }
}

console.log(`Consumer-only surface parity passed for ${publicFiles.length} public files; private Admin/Business/Reserve routes excluded.`);
