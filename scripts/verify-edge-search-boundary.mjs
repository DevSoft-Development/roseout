#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const DEPRECATED_MODULE = path.resolve(
  ROOT,
  "lib/search/createSearch.ts",
);

const EDGE_FUNCTION = path.resolve(
  ROOT,
  "supabase/functions/create-search/index.ts",
);

const SNAPSHOT_FILE = path.resolve(
  ROOT,
  "scripts/edge-search-query-rules.snapshot.json",
);

const SEARCH_ROOTS = [
  "app",
  "components",
  "lib",
  "scripts",
  "supabase",
  "e2e",
].map((directory) => path.resolve(ROOT, directory));

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".tmp-test",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

const REQUIRED_EDGE_BANNER =
  "CREATE-SEARCH EDGE FUNCTION — FROZEN LEGACY BOUNDARY";

const FREEZE_START = "// EDGE_SEARCH_QUERY_RULES_FROZEN_START";
const FREEZE_END = "// EDGE_SEARCH_QUERY_RULES_FROZEN_END";

const errors = [];

main();

function main() {
  verifyRequiredFiles();
  verifyDeprecatedModuleHasNoCallers();
  verifyPublicFlagIsNotUsed();
  verifyEdgeBoundaryBanner();
  verifyFrozenRegionSnapshot();

  if (errors.length > 0) {
    console.error("\nEdge search boundary verification failed:\n");

    for (const error of errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  console.log("Edge search boundary verification passed.");
  console.log("- No production callers import lib/search/createSearch.ts.");
  console.log("- Client-visible Edge search flag is not used.");
  console.log("- Edge boundary banner is present.");
  console.log("- Frozen query-rule region matches its approved snapshot.");
}

function verifyRequiredFiles() {
  for (const filePath of [
    DEPRECATED_MODULE,
    EDGE_FUNCTION,
    SNAPSHOT_FILE,
  ]) {
    if (!fs.existsSync(filePath)) {
      errors.push(`Required file is missing: ${relative(filePath)}`);
    }
  }
}

function verifyDeprecatedModuleHasNoCallers() {
  if (!fs.existsSync(DEPRECATED_MODULE)) return;

  const forbiddenPatterns = [
    /\brunCreateSearchWithEdgeFallback\b/,
    /\bisEdgeCreateSearchEnabled\b/,
    /(?:from|require\s*\()\s*["'][^"']*search\/createSearch["']/,
  ];

  for (const filePath of collectSourceFiles()) {
    if (filePath === DEPRECATED_MODULE) continue;
    if (filePath === path.resolve(process.argv[1] ?? "")) continue;

    const source = fs.readFileSync(filePath, "utf8");

    for (const pattern of forbiddenPatterns) {
      if (!pattern.test(source)) continue;

      errors.push(
        `Deprecated Edge search module is referenced by ${relative(
          filePath,
        )}.`,
      );

      break;
    }
  }
}

function verifyPublicFlagIsNotUsed() {
  const publicFlag = "NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH";

  for (const filePath of collectSourceFiles()) {
    if (filePath === DEPRECATED_MODULE) continue;

    const source = fs.readFileSync(filePath, "utf8");

    if (source.includes(publicFlag)) {
      errors.push(
        `Client-visible ${publicFlag} is used in ${relative(
          filePath,
        )}. Search execution flags must be private server configuration.`,
      );
    }
  }
}

function verifyEdgeBoundaryBanner() {
  if (!fs.existsSync(EDGE_FUNCTION)) return;

  const source = fs.readFileSync(EDGE_FUNCTION, "utf8");

  if (!source.includes(REQUIRED_EDGE_BANNER)) {
    errors.push(
      `${relative(
        EDGE_FUNCTION,
      )} is missing the required frozen-boundary banner.`,
    );
  }

  if (!source.includes(FREEZE_START)) {
    errors.push(`${relative(EDGE_FUNCTION)} is missing ${FREEZE_START}.`);
  }

  if (!source.includes(FREEZE_END)) {
    errors.push(`${relative(EDGE_FUNCTION)} is missing ${FREEZE_END}.`);
  }
}

function verifyFrozenRegionSnapshot() {
  if (!fs.existsSync(EDGE_FUNCTION) || !fs.existsSync(SNAPSHOT_FILE)) {
    return;
  }

  const source = fs.readFileSync(EDGE_FUNCTION, "utf8");
  const frozenRegion = extractFrozenRegion(source);

  if (frozenRegion == null) return;

  let snapshot;

  try {
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  } catch (error) {
    errors.push(
      `Unable to parse ${relative(SNAPSHOT_FILE)}: ${errorMessage(error)}`,
    );
    return;
  }

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.sha256 !== "string"
  ) {
    errors.push(
      `${relative(SNAPSHOT_FILE)} must contain a sha256 string.`,
    );
    return;
  }

  const actualHash = sha256(normalizeFrozenRegion(frozenRegion));

  if (actualHash !== snapshot.sha256) {
    errors.push(
      [
        `Frozen Edge query rules changed in ${relative(EDGE_FUNCTION)}.`,
        `Expected SHA-256: ${snapshot.sha256}`,
        `Actual SHA-256:   ${actualHash}`,
        "Do not add query-specific behavior to the Edge Function.",
        "For an approved emergency exception, run:",
        "node scripts/update-edge-search-freeze.mjs",
      ].join("\n  "),
    );
  }
}

function extractFrozenRegion(source) {
  const startIndex = source.indexOf(FREEZE_START);
  const endIndex = source.indexOf(FREEZE_END);

  if (startIndex < 0 || endIndex < 0) return null;

  if (endIndex <= startIndex) {
    errors.push(
      `${FREEZE_END} must appear after ${FREEZE_START}.`,
    );
    return null;
  }

  return source.slice(
    startIndex + FREEZE_START.length,
    endIndex,
  );
}

function collectSourceFiles() {
  const files = [];

  for (const root of SEARCH_ROOTS) {
    if (!fs.existsSync(root)) continue;
    walk(root, files);
  }

  return files;
}

function walk(currentPath, output) {
  const stat = fs.statSync(currentPath);

  if (stat.isDirectory()) {
    if (IGNORED_DIRECTORIES.has(path.basename(currentPath))) return;

    for (const entry of fs.readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), output);
    }

    return;
  }

  if (!SOURCE_EXTENSIONS.has(path.extname(currentPath))) return;

  output.push(path.resolve(currentPath));
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
