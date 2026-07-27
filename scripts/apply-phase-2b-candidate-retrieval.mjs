#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const INDEX_FILE = path.join(
  ROOT,
  "lib/search/enterprise/index.ts",
);

const CANDIDATE_RETRIEVAL_FILE = path.join(
  ROOT,
  "lib/search/enterprise/candidateRetrieval.ts",
);

main();

function main() {
  assertFileExists(INDEX_FILE);

  writeCandidateRetrievalFile();
  updateEnterpriseSearchFile();

  console.log("");
  console.log("Phase 2B candidate retrieval integration applied.");
  console.log("");
  console.log("Run:");
  console.log("  npm run typecheck");
  console.log("  npm run test:candidate-retrieval");
  console.log("  npm run test:enterprise-search");
  console.log("  npm run test:search-production");
  console.log("  npm run test:search-quality");
  console.log("  npm run build");
}

function writeCandidateRetrievalFile() {
  ensureDirectory(CANDIDATE_RETRIEVAL_FILE);

  fs.writeFileSync(
    CANDIDATE_RETRIEVAL_FILE,
    candidateRetrievalSource(),
    "utf8",
  );

  console.log(
    `Updated ${relative(CANDIDATE_RETRIEVAL_FILE)}`,
  );
}

function updateEnterpriseSearchFile() {
  let source = fs.readFileSync(INDEX_FILE, "utf8");

  source = addImports(source);
  source = addPhase2BTypes(source);
  source = addInitialCandidateRetrieval(source);
  source = replaceRestaurantInitialRetrieval(source);
  source = replaceActivityInitialRetrieval(source);
  source = preventRpcTimingDoubleCounting(source);

  fs.writeFileSync(INDEX_FILE, source, "utf8");

  console.log(`Updated ${relative(INDEX_FILE)}`);
}

function addImports(source) {
  if (
    !source.includes(
      'from "@/lib/search/contracts/candidateSearch"',
    )
  ) {
    const anchor =
      'import { supabaseAdmin } from "../../supabase-admin";';

    assertContains(
      source,
      anchor,
      "Supabase admin import",
    );

    source = source.replace(
      anchor,
      `${anchor}
import { createCandidateSearchRequest } from "@/lib/search/contracts/candidateSearch";`,
    );
  }

  if (
    !source.includes('from "./candidateRetrieval"')
  ) {
    const anchor =
      'import type { PersonalizationMode, UserPreferenceProfile } from "./personalization";';

    assertContains(
      source,
      anchor,
      "personalization import",
    );

    source = source.replace(
      anchor,
      `${anchor}
import {
  applyCandidateRetrievalTelemetry,
  retrieveSearchCandidates,
  type CandidateRetrievalDebug,
} from "./candidateRetrieval";`,
    );
  }

  return source;
}

function addPhase2BTypes(source) {
  if (source.includes("type InitialCandidateRetrievalResult")) {
    return source;
  }

  const anchor = `type EnterpriseSearchOptions = {`;

  assertContains(
    source,
    anchor,
    "EnterpriseSearchOptions declaration",
  );

  const helperTypes = `type InitialCandidateRetrievalResult = {
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  restaurantQueryMs: number;
  activityQueryMs: number;
  totalMs: number;
  adapterUsed: boolean;
  fallbackUsed: boolean;
};

`;

  return source.replace(
    anchor,
    `${helperTypes}${anchor}`,
  );
}

function addInitialCandidateRetrieval(source) {
  if (
    source.includes(
      "const initialCandidates = await retrieveInitialSearchCandidates",
    )
  ) {
    return source;
  }

  const anchor = `    let restaurantRankingIntent = effectiveIntent;
    let restaurantRaw: EnterpriseLocation[] = [];
    let activityRaw: EnterpriseLocation[] = [];
    let activityRpcCountBeforeRecovery = 0;`;

  assertContains(
    source,
    anchor,
    "initial enterprise lane state",
  );

  const replacement = `    let restaurantRankingIntent = effectiveIntent;
    let restaurantRaw: EnterpriseLocation[] = [];
    let activityRaw: EnterpriseLocation[] = [];
    let activityRpcCountBeforeRecovery = 0;

    const initialCandidates = await retrieveInitialSearchCandidates({
      query,
      effectiveIntent,
      supabase,
      debug: debug as CandidateRetrievalDebug,
      options,
    });

    restaurantRaw = initialCandidates.restaurants;
    activityRaw = initialCandidates.activities;

    perf.restaurant_rpc_ms =
      initialCandidates.restaurantQueryMs;
    perf.activity_rpc_ms =
      initialCandidates.activityQueryMs;
    perf.rpc_ms =
      initialCandidates.totalMs;`;

  source = source.replace(anchor, replacement);

  const functionAnchor = `export async function runEnterpriseSearch(
`;

  assertContains(
    source,
    functionAnchor,
    "runEnterpriseSearch declaration",
  );

  const helperFunction = `${initialCandidateHelperSource()}

`;

  return source.replace(
    functionAnchor,
    `${helperFunction}${functionAnchor}`,
  );
}

function replaceRestaurantInitialRetrieval(source) {
  const oldBlock = `      const rpcStarted = performance.now();
      restaurantRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "restaurant",
        debug,
      );
      let filtered = filterRestaurantResults(restaurantRaw, effectiveIntent);`;

  const newBlock = `      let filtered = filterRestaurantResults(
        restaurantRaw,
        effectiveIntent,
      );`;

  if (source.includes(newBlock)) {
    return source;
  }

  assertContains(
    source,
    oldBlock,
    "initial restaurant RPC block",
  );

  return source.replace(oldBlock, newBlock);
}

function replaceActivityInitialRetrieval(source) {
  const possibleBlocks = [
    `      const rpcStarted = performance.now();
      activityRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "activity",
        debug,
      );
      activityRpcCountBeforeRecovery = activityRaw.length;
      let filtered = filterActivityResults(activityRaw, effectiveIntent);`,

    `      const rpcStarted = performance.now();
      activityRaw = await searchEnterpriseLane(
        supabase,
        effectiveIntent,
        "activity",
        debug,
      );
      let filtered = filterActivityResults(activityRaw, effectiveIntent);`,
  ];

  const newBlock = `      activityRpcCountBeforeRecovery =
        activityRaw.length;

      let filtered = filterActivityResults(
        activityRaw,
        effectiveIntent,
      );`;

  if (source.includes(newBlock)) {
    return source;
  }

  const oldBlock = possibleBlocks.find((block) =>
    source.includes(block),
  );

  if (!oldBlock) {
    fail(
      "Could not locate the initial activity RPC block. " +
        "The enterprise search file may have changed.",
    );
  }

  return source.replace(oldBlock, newBlock);
}

function preventRpcTimingDoubleCounting(source) {
  const patterns = [
    /perf\.restaurant_rpc_ms\s*=\s*performance\.now\(\)\s*-\s*rpcStarted;/g,
    /perf\.restaurant_rpc_ms\s*\+=\s*performance\.now\(\)\s*-\s*rpcStarted;/g,
    /perf\.activity_rpc_ms\s*=\s*performance\.now\(\)\s*-\s*rpcStarted;/g,
    /perf\.activity_rpc_ms\s*\+=\s*performance\.now\(\)\s*-\s*rpcStarted;/g,
  ];

  for (const pattern of patterns) {
    source = source.replace(
      pattern,
      "// Initial RPC timing is recorded by the candidate retrieval adapter.",
    );
  }

  return source;
}

function initialCandidateHelperSource() {
  return `async function retrieveInitialSearchCandidates(args: {
  query: string;
  effectiveIntent: SearchIntent;
  supabase: any;
  debug: CandidateRetrievalDebug;
  options?: EnterpriseSearchOptions;
}): Promise<InitialCandidateRetrievalResult> {
  const {
    query,
    effectiveIntent,
    supabase,
    debug,
    options,
  } = args;

  const requestId = resolveCandidateRequestId(
    options?.body,
  );

  const userLocation = resolveCandidateUserLocation({
    explicit:
      options?.userLocation ??
      options?.body?.userLocation ??
      options?.body?.user_location ??
      null,
    body: options?.body,
    intent: effectiveIntent,
  });

  try {
    const response = await retrieveSearchCandidates({
      supabase,
      request: createCandidateSearchRequest({
        requestId,
        query,
        intent: effectiveIntent,
        selectedMarketId:
          options?.selectedMarketId ??
          options?.body?.selectedMarketId ??
          options?.body?.selected_market_id ??
          null,
        userLocation,
        restaurantLimit: 50,
        activityLimit: 50,
      }),
      debug,
    });

    applyCandidateRetrievalTelemetry(
      debug,
      response,
    );

    return {
      restaurants: response.restaurants,
      activities: response.activities,
      restaurantQueryMs:
        response.timing.restaurantQueryMs ?? 0,
      activityQueryMs:
        response.timing.activityQueryMs ?? 0,
      totalMs: response.timing.totalMs,
      adapterUsed: true,
      fallbackUsed: false,
    };
  } catch (error) {
    const fallbackStarted = performance.now();

    debug.candidateFallbackUsed = true;
    debug.candidateProvider =
      "app_direct_fallback";
    debug.candidateAdapterError =
      error instanceof Error
        ? error.message
        : String(error);

    const restaurantStarted = performance.now();

    const restaurantPromise =
      effectiveIntent.needsRestaurant
        ? searchEnterpriseLane(
            supabase,
            effectiveIntent,
            "restaurant",
            debug,
          )
        : Promise.resolve([]);

    const activityStarted = performance.now();

    const activityPromise =
      effectiveIntent.needsActivity
        ? searchEnterpriseLane(
            supabase,
            effectiveIntent,
            "activity",
            debug,
          )
        : Promise.resolve([]);

    const [
      restaurants,
      activities,
    ] = await Promise.all([
      restaurantPromise,
      activityPromise,
    ]);

    const completed = performance.now();

    const restaurantQueryMs =
      effectiveIntent.needsRestaurant
        ? Math.max(
            0,
            completed - restaurantStarted,
          )
        : 0;

    const activityQueryMs =
      effectiveIntent.needsActivity
        ? Math.max(
            0,
            completed - activityStarted,
          )
        : 0;

    const totalMs = Math.max(
      0,
      completed - fallbackStarted,
    );

    debug.candidateContractVersion =
      "candidate-search-v1";
    debug.candidateRetrievalMs =
      Number(totalMs.toFixed(2));
    debug.candidateRestaurantRetrievalMs =
      Number(restaurantQueryMs.toFixed(2));
    debug.candidateActivityRetrievalMs =
      Number(activityQueryMs.toFixed(2));
    debug.candidateRestaurantCount =
      restaurants.length;
    debug.candidateActivityCount =
      activities.length;

    return {
      restaurants,
      activities,
      restaurantQueryMs:
        Number(restaurantQueryMs.toFixed(2)),
      activityQueryMs:
        Number(activityQueryMs.toFixed(2)),
      totalMs:
        Number(totalMs.toFixed(2)),
      adapterUsed: false,
      fallbackUsed: true,
    };
  }
}

function resolveCandidateRequestId(
  body: any,
): string {
  const provided = [
    body?.requestId,
    body?.request_id,
    body?.searchRequestId,
    body?.search_request_id,
  ].find(
    (value) =>
      typeof value === "string" &&
      value.trim(),
  );

  if (
    typeof provided === "string" &&
    provided.trim()
  ) {
    return provided.trim();
  }

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return \`candidate-\${Date.now()}-\${Math.random()
    .toString(36)
    .slice(2, 12)}\`;
}

function resolveCandidateUserLocation(args: {
  explicit: unknown;
  body: any;
  intent: SearchIntent;
}): {
  latitude: number;
  longitude: number;
} | null {
  const explicit = args.explicit as any;

  const latitudeCandidates = [
    explicit?.latitude,
    explicit?.lat,
    args.body?.userLatitude,
    args.body?.user_latitude,
    args.intent.geo.latitude,
  ];

  const longitudeCandidates = [
    explicit?.longitude,
    explicit?.lng,
    explicit?.lon,
    args.body?.userLongitude,
    args.body?.user_longitude,
    args.intent.geo.longitude,
  ];

  const latitude =
    firstFiniteNumber(latitudeCandidates);

  const longitude =
    firstFiniteNumber(longitudeCandidates);

  if (
    latitude == null ||
    longitude == null
  ) {
    return null;
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function firstFiniteNumber(
  values: unknown[],
): number | null {
  for (const value of values) {
    const numberValue = Number(value);

    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return null;
}`;
}

function candidateRetrievalSource() {
  return `import type { SupabaseClient } from "@supabase/supabase-js";

import {
  candidateSearchDomains,
  toEnterpriseSearchIntent,
  validateCandidateSearchRequest,
  validateCandidateSearchResponse,
  type CandidateSearchDomain,
  type CandidateSearchRequest,
  type CandidateSearchResponse,
} from "@/lib/search/contracts/candidateSearch";

import { SEARCH_CANDIDATE_CONTRACT_VERSION } from "@/lib/search/contracts/searchContractVersion";

import type {
  EnterpriseLocation,
  SearchDomain,
  SearchIntent,
} from "./types";

import {
  createRpcDebug,
  searchEnterpriseLane,
} from "./rpc";

type RpcDebug = ReturnType<
  typeof createRpcDebug
>;

export type CandidateRetrievalDebug =
  RpcDebug & {
    candidateProvider?:
      | "app"
      | "app_direct_fallback";
    candidateContractVersion?: string;
    candidateRetrievalMs?: number;
    candidateRestaurantRetrievalMs?:
      | number
      | null;
    candidateActivityRetrievalMs?:
      | number
      | null;
    candidateFallbackUsed?: boolean;
    candidateResultsTruncated?: boolean;
    candidateRestaurantCount?: number;
    candidateActivityCount?: number;
    candidateAdapterError?: string;
    [key: string]: unknown;
  };

export type CandidateLaneLoader = (
  supabase: SupabaseClient,
  intent: SearchIntent,
  domain: SearchDomain,
  debug?: RpcDebug,
) => Promise<EnterpriseLocation[]>;

export type RetrieveSearchCandidatesInput = {
  supabase: SupabaseClient;
  request: CandidateSearchRequest;
  debug?: CandidateRetrievalDebug;
};

export type CandidateRetrievalDependencies = {
  searchLane?: CandidateLaneLoader;
  now?: () => number;
};

export async function retrieveSearchCandidates(
  input: RetrieveSearchCandidatesInput,
  dependencies: CandidateRetrievalDependencies = {},
): Promise<CandidateSearchResponse> {
  validateCandidateSearchRequest(
    input.request,
  );

  const now =
    dependencies.now ??
    performanceNow;

  const searchLane: CandidateLaneLoader =
    dependencies.searchLane ??
    searchEnterpriseLane;

  const startedAt = now();

  const intent =
    toEnterpriseSearchIntent(
      input.request,
    );

  const domains =
    candidateSearchDomains(
      input.request,
    );

  const debug: RpcDebug =
    input.debug ??
    createRpcDebug(intent);

  const laneResults = await Promise.all(
    domains.map((domain) =>
      retrieveCandidateLane({
        supabase: input.supabase,
        intent,
        domain,
        limit: limitForDomain(
          input.request,
          domain,
        ),
        debug,
        searchLane,
        now,
      }),
    ),
  );

  const restaurantLane =
    laneResults.find(
      (lane) =>
        lane.domain === "restaurant",
    );

  const activityLane =
    laneResults.find(
      (lane) =>
        lane.domain === "activity",
    );

  const response: CandidateSearchResponse = {
    contractVersion:
      SEARCH_CANDIDATE_CONTRACT_VERSION,
    requestId:
      input.request.requestId,
    restaurants:
      restaurantLane?.locations ?? [],
    activities:
      activityLane?.locations ?? [],
    timing: {
      totalMs: elapsedMs(
        startedAt,
        now(),
      ),
      restaurantQueryMs:
        restaurantLane?.queryMs ?? null,
      activityQueryMs:
        activityLane?.queryMs ?? null,
    },
    metadata: {
      provider: "app",
      truncated:
        Boolean(
          restaurantLane?.truncated,
        ) ||
        Boolean(
          activityLane?.truncated,
        ),
      restaurantTruncated:
        Boolean(
          restaurantLane?.truncated,
        ),
      activityTruncated:
        Boolean(
          activityLane?.truncated,
        ),
      candidateFallbackUsed: false,
    },
  };

  validateCandidateSearchResponse(
    response,
    input.request.requestId,
  );

  return response;
}

export function applyCandidateRetrievalTelemetry(
  debug: CandidateRetrievalDebug,
  response: CandidateSearchResponse,
): CandidateRetrievalDebug {
  debug.candidateProvider =
    response.metadata.provider;

  debug.candidateContractVersion =
    response.contractVersion;

  debug.candidateRetrievalMs =
    response.timing.totalMs;

  debug.candidateRestaurantRetrievalMs =
    response.timing.restaurantQueryMs;

  debug.candidateActivityRetrievalMs =
    response.timing.activityQueryMs;

  debug.candidateFallbackUsed =
    response.metadata
      .candidateFallbackUsed;

  debug.candidateResultsTruncated =
    response.metadata.truncated;

  debug.candidateRestaurantCount =
    response.restaurants.length;

  debug.candidateActivityCount =
    response.activities.length;

  return debug;
}

type RetrieveCandidateLaneInput = {
  supabase: SupabaseClient;
  intent: SearchIntent;
  domain: CandidateSearchDomain;
  limit: number;
  debug: RpcDebug;
  searchLane: CandidateLaneLoader;
  now: () => number;
};

type CandidateLaneResult = {
  domain: CandidateSearchDomain;
  locations: EnterpriseLocation[];
  queryMs: number;
  truncated: boolean;
};

async function retrieveCandidateLane(
  input: RetrieveCandidateLaneInput,
): Promise<CandidateLaneResult> {
  const startedAt = input.now();

  const rows = await input.searchLane(
    input.supabase,
    input.intent,
    input.domain,
    input.debug,
  );

  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const truncated =
    safeRows.length >
    input.limit;

  return {
    domain: input.domain,
    locations:
      safeRows.slice(
        0,
        input.limit,
      ),
    queryMs: elapsedMs(
      startedAt,
      input.now(),
    ),
    truncated,
  };
}

function limitForDomain(
  request: CandidateSearchRequest,
  domain: CandidateSearchDomain,
): number {
  return domain === "restaurant"
    ? request.restaurantLimit
    : request.activityLimit;
}

function performanceNow(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
}

function elapsedMs(
  startedAt: number,
  completedAt: number,
): number {
  return Math.max(
    0,
    Number(
      (
        completedAt -
        startedAt
      ).toFixed(2),
    ),
  );
}
`;
}

function assertContains(
  source,
  target,
  description,
) {
  if (!source.includes(target)) {
    fail(
      `Could not locate ${description} in ${relative(
        INDEX_FILE,
      )}.`,
    );
  }
}

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(
      `Required file is missing: ${relative(
        filePath,
      )}`,
    );
  }
}

function ensureDirectory(filePath) {
  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true,
    },
  );
}

function relative(filePath) {
  return path
    .relative(ROOT, filePath)
    .replaceAll(path.sep, "/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}