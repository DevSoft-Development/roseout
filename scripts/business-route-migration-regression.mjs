#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mappings = [
  ["app/api/locations", "apps/business/app/api/locations"],
  ["app/api/business", "apps/business/app/api/business"],
  ["app/api/auth", "apps/business/app/api/auth"],
  ["app/auth/callback", "apps/business/app/auth/callback"],
  ["app/auth/confirm", "apps/business/app/auth/confirm"],
  ["app/auth/create-password", "apps/business/app/auth/create-password"],
  ["app/auth/verified", "apps/business/app/auth/verified"],
  ["app/auth/verify-email", "apps/business/app/auth/verify-email"],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const mismatches = [];
let count = 0;

for (const [sourceRoot, isolatedRoot] of mappings) {
  for (const source of walk(path.join(root, sourceRoot))) {
    if (!/\.(ts|tsx)$/.test(source)) continue;
    count += 1;
    const relative = path.relative(path.join(root, sourceRoot), source);
    const isolated = path.join(root, isolatedRoot, relative);
    if (!fs.existsSync(isolated)) {
      mismatches.push(`${path.relative(root, source)}: missing isolated copy`);
      continue;
    }
    if (fs.readFileSync(source, "utf8") !== fs.readFileSync(isolated, "utf8")) {
      mismatches.push(`${path.relative(root, source)}: content drift`);
    }
  }
}

if (count < 65) {
  throw new Error(`Expected at least 65 Business API/auth migration files; found ${count}.`);
}
if (mismatches.length) {
  throw new Error(`Business route migration parity failed:\n${mismatches.join("\n")}`);
}

const tsconfig = fs.readFileSync(path.join(root, "apps/business/tsconfig.json"), "utf8");
if (!tsconfig.includes('"@/*": [\n        "../../*"\n      ]') && !tsconfig.includes('"@/*": ["../../*"]')) {
  throw new Error("Business app must resolve shared root dependencies during the migration window.");
}

for (const required of [
  "apps/business/app/locations/dashboard/page.tsx",
  "apps/business/app/business/dashboard/page.tsx",
  "apps/business/app/business/login/page.tsx",
  "apps/business/app/api/business/organizations/route.ts",
  "apps/business/app/api/locations/edit-context/route.ts",
  "apps/business/app/api/auth/sign-in/route.ts",
]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`Missing required isolated Business route: ${required}`);
  }
}

for (const removedRoot of [
  "app/locations/dashboard",
  "app/business/dashboard",
  "app/business/login",
]) {
  if (fs.existsSync(path.join(root, removedRoot))) {
    throw new Error(`Root private Business UI must be removed after cutover: ${removedRoot}`);
  }
}

console.log(`Business isolated ownership and API/auth parity passed for ${count} migration files.`);
