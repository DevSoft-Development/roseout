#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const EDGE_FUNCTION = path.resolve(
  ROOT,
  "supabase/functions/create-search/index.ts",
);

const SNAPSHOT_FILE = path.resolve(
  ROOT,
  "scripts/edge-search-query-rules.snapshot.json",
);

const FREEZE_START = "// EDGE_SEARCH_QUERY_RULES_FROZEN_START";
const FREEZE_END = "// EDGE_SEARCH_QUERY_RULES_FROZEN_END";

main();

function main() {
  if (!fs.existsSync(EDGE_FUNCTION)) {
    fail(`Missing Edge Function: ${relative(EDGE_FUNCTION)}`);
  }

  const source = fs.readFileSync(EDGE_FUNCTION, "utf8");
  const region = extractFrozenRegion(source);
  const hash = sha256(normalizeFrozenRegion(region));

  const snapshot = {
    schemaVersion: 1,
    sourceFile: relative(EDGE_FUNCTION),
    startMarker: FREEZE_START,
    endMarker: FREEZE_END,
    sha256: hash,
    note:
      "This snapshot freezes legacy query-specific rules in create-search. " +
      "Update only for a reviewed emergency exception with canonical regression coverage.",
  };

  fs.writeFileSync(
    SNAPSHOT_FILE,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );

  console.log(`Updated ${relative(SNAPSHOT_FILE)}.`);
  console.log(`SHA-256: ${hash}`);
}

function extractFrozenRegion(source) {
  const startIndex = source.indexOf(FREEZE_START);
  const endIndex = source.indexOf(FREEZE_END);

  if (startIndex < 0) fail(`Missing marker: ${FREEZE_START}`);
  if (endIndex < 0) fail(`Missing marker: ${FREEZE_END}`);

  if (endIndex <= startIndex) {
    fail(`${FREEZE_END} must appear after ${FREEZE_START}.`);
  }

  return source.slice(
    startIndex + FREEZE_START.length,
    endIndex,
  );
}

function normalizeFrozenRegion(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll(path.sep, "/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
