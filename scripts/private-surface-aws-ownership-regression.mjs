#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(next) : [next];
  });
}

function relativeFiles(prefix) {
  return walk(prefix)
    .filter((file) => fs.statSync(path.join(root, file)).isFile())
    .map((file) => path.relative(prefix, file).replaceAll("\\", "/"))
    .sort();
}

function assertMirrored(sourcePrefix, targetPrefix, label) {
  const source = relativeFiles(sourcePrefix);
  const target = new Set(relativeFiles(targetPrefix));
  const missing = source.filter((file) => !target.has(file));
  if (missing.length) {
    throw new Error(`${label} is not fully owned by the isolated AWS app:\n${missing.join("\n")}`);
  }
  return source.length;
}

const counts = {
  adminApi: assertMirrored("app/api/admin", "apps/admin/app/api/admin", "Admin API"),
  businessApi: assertMirrored("app/api/business", "apps/business/app/api/business", "Business API"),
  locationApi: assertMirrored("app/api/locations", "apps/business/app/api/locations", "Business location API"),
  reserveApi: assertMirrored("app/api/reserve", "apps/reserve/app/api/reserve", "Reserve API"),
  businessPages: assertMirrored("app/business", "apps/business/app/business", "Business pages"),
};

for (const forbidden of [
  "app/admin",
  "app/locations/dashboard",
  "app/business/dashboard",
  "app/business/login",
  "app/reserve",
]) {
  if (fs.existsSync(path.join(root, forbidden))) {
    throw new Error(`Private UI must not remain rooted in the consumer app: ${forbidden}`);
  }
}

console.log(JSON.stringify({ ok: true, counts }, null, 2));
