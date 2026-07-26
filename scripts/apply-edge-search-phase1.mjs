#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const FILES = {
  deprecatedModule: path.join(ROOT, "lib/search/createSearch.ts"),
  edgeFunction: path.join(
    ROOT,
    "supabase/functions/create-search/index.ts",
  ),
  verificationScript: path.join(
    ROOT,
    "scripts/verify-edge-search-boundary.mjs",
  ),
  snapshotUpdateScript: path.join(
    ROOT,
    "scripts/update-edge-search-freeze.mjs",
  ),
  snapshot: path.join(
    ROOT,
    "scripts/edge-search-query-rules.snapshot.json",
  ),
  packageJson: path.join(ROOT, "package.json"),
  productionCi: path.join(
    ROOT,
    ".github/workflows/production-ci.yml",
  ),
};

const EDGE_BANNER_MARKER =
  "CREATE-SEARCH EDGE FUNCTION — FROZEN LEGACY BOUNDARY";

const FREEZE_START = "// EDGE_SEARCH_QUERY_RULES_FROZEN_START";
const FREEZE_END = "// EDGE_SEARCH_QUERY_RULES_FROZEN_END";

main();

function main() {
  assertRepositoryFiles();

  writeDeprecatedModule();
  updateEdgeFunction();
  writeVerificationScript();
  writeSnapshotUpdateScript();
  updatePackageJson();
  updateProductionCi();
  updateFreezeSnapshot();

  console.log("");
  console.log("Phase 1 Edge search boundary updates applied.");
  console.log("");
  console.log("Run:");
  console.log("  npm run verify:edge-search-boundary");
  console.log("  npm run typecheck");
  console.log("  npm run test:search-route-regression");
  console.log("  npm run test:search-production");
}

function assertRepositoryFiles() {
  const required = [
    FILES.edgeFunction,
    FILES.packageJson,
    FILES.productionCi,
  ];

  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      fail(`Required repository file is missing: ${relative(filePath)}`);
    }
  }
}

function writeDeprecatedModule() {
  ensureDirectory(FILES.deprecatedModule);

  fs.writeFileSync(
    FILES.deprecatedModule,
    `/**
 * @deprecated
 *
 * PHASE 1 — EDGE SEARCH BOUNDARY
 *
 * This module was created while parts of public search were being evaluated
 * for execution in a Supabase Edge Function.
 *
 * The create-search Edge Function is NOT a second public search engine and
 * must not become an alternative source of final search responses.
 *
 * Canonical public search flow:
 *
 *   POST /api/generate
 *     -> lib/search/public-api/controller.ts
 *     -> lib/search/runSearch.ts
 *     -> lib/search/enterprise/*
 *
 * Future Edge integration must happen through a bounded internal stage such
 * as candidate retrieval, anchor resolution, or intent-cache access.
 *
 * The canonical application pipeline must continue to own final intent,
 * ranking, pairing, walking validation, guardrails, personalization, card
 * shaping, telemetry classification, and public response behavior.
 *
 * Do not add new callers to this module.
 *
 * This compatibility wrapper remains temporarily so stale branches fail
 * safely instead of silently restoring the Edge Function as a second search
 * engine.
 */

type DeprecatedCreateSearchOptions = {
  accessToken?: string | null;
  fallbackDisabled?: boolean;
  legacySearch: () => Promise<Record<string, unknown>>;
};

const DEPRECATION_MESSAGE =
  "lib/search/createSearch.ts is deprecated. Public search must use " +
  "/api/generate -> public search controller -> runOutingSearch(). " +
  "The create-search Edge Function must not return an independent final search response.";

let warningEmitted = false;

function emitDeprecationWarning(): void {
  if (warningEmitted) return;

  warningEmitted = true;

  console.warn("[deprecated-create-search]", {
    message: DEPRECATION_MESSAGE,
    canonicalRoute: "/api/generate",
    canonicalOrchestrator: "lib/search/runSearch.ts",
  });
}

/**
 * @deprecated
 *
 * The old NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH switch is intentionally ignored.
 * Search execution must not be controlled by a client-visible environment
 * variable.
 *
 * This function always returns false so stale callers fail closed and use
 * the canonical application search path.
 */
export function isEdgeCreateSearchEnabled(): boolean {
  emitDeprecationWarning();
  return false;
}

/**
 * @deprecated
 *
 * Do not use this function for new code.
 *
 * It always executes legacySearch, which must point to the canonical
 * application-side enterprise search pipeline. It no longer invokes the
 * create-search Edge Function as an alternative final search engine.
 */
export async function runCreateSearchWithEdgeFallback(
  _body: Record<string, unknown>,
  options: DeprecatedCreateSearchOptions,
): Promise<Record<string, unknown>> {
  emitDeprecationWarning();

  if (typeof options.legacySearch !== "function") {
    throw new TypeError(
      "runCreateSearchWithEdgeFallback requires a canonical legacySearch function.",
    );
  }

  const result = await options.legacySearch();

  return {
    ...result,
    source:
      typeof result.source === "string"
        ? result.source
        : "canonical_enterprise_search",
    debug: {
      ...(isRecord(result.debug) ? result.debug : {}),
      deprecatedCreateSearchWrapperUsed: true,
      edgeCreateSearchInvoked: false,
      canonicalSearchPreserved: true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
`,
    "utf8",
  );

  console.log(`Updated ${relative(FILES.deprecatedModule)}`);
}

function updateEdgeFunction() {
  let source = fs.readFileSync(FILES.edgeFunction, "utf8");

  if (!source.includes(EDGE_BANNER_MARKER)) {
    source = `${edgeBoundaryBanner()}\n${source}`;
  }

  if (!source.includes(FREEZE_START)) {
    const startTarget = "const STEAK_TERMS = [";

    if (!source.includes(startTarget)) {
      fail(
        `Could not find the expected frozen-rule start target in ${relative(
          FILES.edgeFunction,
        )}: ${startTarget}`,
      );
    }

    source = source.replace(
      startTarget,
      `${FREEZE_START}
// Existing query-specific compatibility behavior is frozen.
// Do not add or modify terms in this region without an approved exception.
${startTarget}`,
    );
  }

  if (!source.includes(FREEZE_END)) {
    const handlerTargets = [
      "Deno.serve(async",
      "Deno.serve(",
      "serve(async",
      "serve(",
    ];

    const target = handlerTargets.find((candidate) =>
      source.includes(candidate),
    );

    if (!target) {
      fail(
        `Could not locate the Edge Function request handler in ${relative(
          FILES.edgeFunction,
        )}.`,
      );
    }

    source = source.replace(
      target,
      `${FREEZE_END}
// New search understanding belongs in the canonical enterprise pipeline.

${target}`,
    );
  }

  fs.writeFileSync(FILES.edgeFunction, source, "utf8");

  console.log(`Updated ${relative(FILES.edgeFunction)}`);
}

function edgeBoundaryBanner() {
  return `/**
 * ============================================================================
 * CREATE-SEARCH EDGE FUNCTION — FROZEN LEGACY BOUNDARY
 * ============================================================================
 *
 * THIS FUNCTION IS NOT A SECOND PUBLIC SEARCH ENGINE.
 *
 * The canonical TheOutHaven public search pipeline is:
 *
 *   POST /api/generate
 *     -> lib/search/public-api/controller.ts
 *     -> lib/search/runSearch.ts
 *     -> lib/search/enterprise/*
 *
 * This Edge Function was created to move selected search work closer to
 * Supabase. It must not independently become the authority for:
 *
 *   - final intent classification
 *   - final restaurant/activity domain selection
 *   - final ranking
 *   - pairing
 *   - walking-distance enforcement
 *   - personalization
 *   - public result guardrails
 *   - public card shaping
 *   - public response status or error behavior
 *
 * PHASE 1 FREEZE:
 *
 * Existing query-specific terms and compatibility behavior are temporarily
 * preserved to avoid breaking deployed behavior, but they are frozen.
 *
 * DO NOT ADD:
 *
 *   - new cuisine-specific arrays
 *   - new activity-specific arrays
 *   - new sports team or league terms
 *   - new raw-query regular expressions
 *   - new one-off query corrections
 *   - new ranking rules
 *   - new final-domain cleanup rules
 *   - new public response behavior
 *
 * New search understanding belongs in the canonical enterprise search
 * pipeline. A later migration phase should reduce this function to a bounded
 * Edge stage such as candidate retrieval.
 *
 * Any temporary emergency change to the frozen rule region must:
 *
 *   1. include a regression test in the canonical enterprise pipeline;
 *   2. explain why the canonical pipeline cannot handle it;
 *   3. include a removal plan;
 *   4. update the frozen-region snapshot intentionally.
 *
 * ============================================================================
 */`;
}

function writeVerificationScript() {
  ensureDirectory(FILES.verificationScript);

  fs.writeFileSync(
    FILES.verificationScript,
    `#!/usr/bin/env node

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
    console.error("\\nEdge search boundary verification failed:\\n");

    for (const error of errors) {
      console.error(\`- \${error}\`);
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
      errors.push(\`Required file is missing: \${relative(filePath)}\`);
    }
  }
}

function verifyDeprecatedModuleHasNoCallers() {
  if (!fs.existsSync(DEPRECATED_MODULE)) return;

  const forbiddenPatterns = [
    /\\brunCreateSearchWithEdgeFallback\\b/,
    /\\bisEdgeCreateSearchEnabled\\b/,
    /(?:from|require\\s*\\()\\s*["'][^"']*search\\/createSearch["']/,
  ];

  for (const filePath of collectSourceFiles()) {
    if (filePath === DEPRECATED_MODULE) continue;
    if (filePath === path.resolve(process.argv[1] ?? "")) continue;

    const source = fs.readFileSync(filePath, "utf8");

    for (const pattern of forbiddenPatterns) {
      if (!pattern.test(source)) continue;

      errors.push(
        \`Deprecated Edge search module is referenced by \${relative(
          filePath,
        )}.\`,
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
        \`Client-visible \${publicFlag} is used in \${relative(
          filePath,
        )}. Search execution flags must be private server configuration.\`,
      );
    }
  }
}

function verifyEdgeBoundaryBanner() {
  if (!fs.existsSync(EDGE_FUNCTION)) return;

  const source = fs.readFileSync(EDGE_FUNCTION, "utf8");

  if (!source.includes(REQUIRED_EDGE_BANNER)) {
    errors.push(
      \`\${relative(
        EDGE_FUNCTION,
      )} is missing the required frozen-boundary banner.\`,
    );
  }

  if (!source.includes(FREEZE_START)) {
    errors.push(\`\${relative(EDGE_FUNCTION)} is missing \${FREEZE_START}.\`);
  }

  if (!source.includes(FREEZE_END)) {
    errors.push(\`\${relative(EDGE_FUNCTION)} is missing \${FREEZE_END}.\`);
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
      \`Unable to parse \${relative(SNAPSHOT_FILE)}: \${errorMessage(error)}\`,
    );
    return;
  }

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.sha256 !== "string"
  ) {
    errors.push(
      \`\${relative(SNAPSHOT_FILE)} must contain a sha256 string.\`,
    );
    return;
  }

  const actualHash = sha256(normalizeFrozenRegion(frozenRegion));

  if (actualHash !== snapshot.sha256) {
    errors.push(
      [
        \`Frozen Edge query rules changed in \${relative(EDGE_FUNCTION)}.\`,
        \`Expected SHA-256: \${snapshot.sha256}\`,
        \`Actual SHA-256:   \${actualHash}\`,
        "Do not add query-specific behavior to the Edge Function.",
        "For an approved emergency exception, run:",
        "node scripts/update-edge-search-freeze.mjs",
      ].join("\\n  "),
    );
  }
}

function extractFrozenRegion(source) {
  const startIndex = source.indexOf(FREEZE_START);
  const endIndex = source.indexOf(FREEZE_END);

  if (startIndex < 0 || endIndex < 0) return null;

  if (endIndex <= startIndex) {
    errors.push(
      \`\${FREEZE_END} must appear after \${FREEZE_START}.\`,
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
  return value.replace(/\\r\\n/g, "\\n").trim();
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
`,
    "utf8",
  );

  console.log(`Created ${relative(FILES.verificationScript)}`);
}

function writeSnapshotUpdateScript() {
  ensureDirectory(FILES.snapshotUpdateScript);

  fs.writeFileSync(
    FILES.snapshotUpdateScript,
    `#!/usr/bin/env node

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
    fail(\`Missing Edge Function: \${relative(EDGE_FUNCTION)}\`);
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
    \`\${JSON.stringify(snapshot, null, 2)}\\n\`,
    "utf8",
  );

  console.log(\`Updated \${relative(SNAPSHOT_FILE)}.\`);
  console.log(\`SHA-256: \${hash}\`);
}

function extractFrozenRegion(source) {
  const startIndex = source.indexOf(FREEZE_START);
  const endIndex = source.indexOf(FREEZE_END);

  if (startIndex < 0) fail(\`Missing marker: \${FREEZE_START}\`);
  if (endIndex < 0) fail(\`Missing marker: \${FREEZE_END}\`);

  if (endIndex <= startIndex) {
    fail(\`\${FREEZE_END} must appear after \${FREEZE_START}.\`);
  }

  return source.slice(
    startIndex + FREEZE_START.length,
    endIndex,
  );
}

function normalizeFrozenRegion(value) {
  return value.replace(/\\r\\n/g, "\\n").trim();
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
`,
    "utf8",
  );

  console.log(`Created ${relative(FILES.snapshotUpdateScript)}`);
}

function updatePackageJson() {
  const packageJson = JSON.parse(
    fs.readFileSync(FILES.packageJson, "utf8"),
  );

  packageJson.scripts ??= {};

  packageJson.scripts["verify:edge-search-boundary"] =
    "node scripts/verify-edge-search-boundary.mjs";

  const strictSteps = [
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "npm run verify:edge-search-boundary",
    "npm run test:search-production",
    "npm run test:search-quality",
    "npm run test:search-route-regression",
  ];

  packageJson.scripts["production-check:strict"] =
    strictSteps.join(" && ");

  fs.writeFileSync(
    FILES.packageJson,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );

  console.log(`Updated ${relative(FILES.packageJson)}`);
}

function updateProductionCi() {
  let source = fs.readFileSync(FILES.productionCi, "utf8");

  if (source.includes("Verify Edge search boundary")) {
    console.log(
      `${relative(FILES.productionCi)} already contains the verification step`,
    );
    return;
  }

  const installStep = `      - name: Install locked dependencies
        run: npm ci`;

  if (!source.includes(installStep)) {
    fail(
      `Could not find the dependency-install step in ${relative(
        FILES.productionCi,
      )}.`,
    );
  }

  const verificationStep = `${installStep}

      - name: Verify Edge search boundary
        run: npm run verify:edge-search-boundary`;

  source = source.replace(installStep, verificationStep);

  fs.writeFileSync(FILES.productionCi, source, "utf8");

  console.log(`Updated ${relative(FILES.productionCi)}`);
}

function updateFreezeSnapshot() {
  const source = fs.readFileSync(FILES.edgeFunction, "utf8");

  const startIndex = source.indexOf(FREEZE_START);
  const endIndex = source.indexOf(FREEZE_END);

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail("Unable to create the frozen Edge rule snapshot.");
  }

  const frozenRegion = source
    .slice(startIndex + FREEZE_START.length, endIndex)
    .replace(/\r\n/g, "\n")
    .trim();

  const snapshot = {
    schemaVersion: 1,
    sourceFile: relative(FILES.edgeFunction),
    startMarker: FREEZE_START,
    endMarker: FREEZE_END,
    sha256: crypto
      .createHash("sha256")
      .update(frozenRegion)
      .digest("hex"),
    note:
      "This snapshot freezes legacy query-specific rules in create-search. " +
      "Update only for a reviewed emergency exception with canonical regression coverage.",
  };

  ensureDirectory(FILES.snapshot);

  fs.writeFileSync(
    FILES.snapshot,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );

  console.log(`Created ${relative(FILES.snapshot)}`);
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}