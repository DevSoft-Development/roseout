#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const isolatedRoots = [
  "apps/reserve/app/reserve",
  "apps/reserve/app/api/reserve",
  "apps/reserve/app/api/v1/reserve",
  "apps/reserve/app/api/reservations",
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const isolatedFiles = isolatedRoots
  .flatMap((dir) => walk(path.join(root, dir)))
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .sort();

if (isolatedFiles.length < 60) {
  throw new Error(
    `Expected the isolated Reserve app to contain at least 60 route files; found ${isolatedFiles.length}.`,
  );
}

const requiredRoutes = [
  "apps/reserve/app/reserve/page.tsx",
  "apps/reserve/app/reserve/dashboard/page.tsx",
  "apps/reserve/app/reserve/location/[locationId]/page.tsx",
  "apps/reserve/app/reserve/confirmation/[token]/page.tsx",
  "apps/reserve/app/api/reserve/availability/route.ts",
  "apps/reserve/app/api/reserve/location/route.ts",
  "apps/reserve/app/api/reservations/lock-slot/route.ts",
  "apps/reserve/app/api/internal/reserve/outbox/route.ts",
];

const missing = requiredRoutes.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`Reserve isolated route inventory is incomplete:\n${missing.join("\n")}`);
}

const legacyUiFiles = walk(path.join(root, "app/reserve"))
  .filter((file) => /\.(ts|tsx)$/.test(file));

if (legacyUiFiles.length) {
  throw new Error(
    `Legacy root Reserve UI ownership must remain removed:\n${legacyUiFiles
      .map((file) => path.relative(root, file))
      .join("\n")}`,
  );
}

const tsconfig = fs.readFileSync(path.join(root, "apps/reserve/tsconfig.json"), "utf8");
if (!tsconfig.includes('"@/*": ["../../*"]')) {
  throw new Error("Reserve app must resolve shared root dependencies during the migration window.");
}

console.log(`Reserve isolated route inventory passed for ${isolatedFiles.length} files.`);
