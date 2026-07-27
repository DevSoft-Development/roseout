import type { SupabaseClient } from "@supabase/supabase-js";

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
import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";
import { createRpcDebug, searchEnterpriseLane } from "./rpc";

type RpcDebug = ReturnType<typeof createRpcDebug>;

type ShadowComparison = {
  contractMatched: boolean;
  restaurantOverlap: number;
  activityOverlap: number;
  restaurantTop10Overlap: number;
  activityTop10Overlap: number;
  duplicateRestaurantIds: number;
  duplicateActivityIds: number;
};

export type CandidateRetrievalDebug = RpcDebug & {
  candidateProvider?: "app" | "app_direct_fallback";
  candidateContractVersion?: string;
  candidateRetrievalMs?: number;
  candidateRestaurantRetrievalMs?: number | null;
  candidateActivityRetrievalMs?: number | null;
  candidateFallbackUsed?: boolean;
  candidateResultsTruncated?: boolean;
  candidateRestaurantCount?: number;
  candidateActivityCount?: number;
  candidateAdapterError?: string;
  candidateShadowMode?: "off" | "shadow";
  candidateShadowEdgeAttempted?: boolean;
  candidateShadowEdgeSucceeded?: boolean;
  candidateShadowContractMatched?: boolean;
  candidateShadowRestaurantCount?: number;
  candidateShadowActivityCount?: number;
  candidateShadowRestaurantOverlap?: number;
  candidateShadowActivityOverlap?: number;
  candidateShadowRestaurantTop10Overlap?: number;
  candidateShadowActivityTop10Overlap?: number;
  candidateShadowDuplicateRestaurantIds?: number;
  candidateShadowDuplicateActivityIds?: number;
  candidateShadowEdgeMs?: number | null;
  candidateShadowError?: string | null;
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
  fetchImpl?: typeof fetch;
};

export async function retrieveSearchCandidates(
  input: RetrieveSearchCandidatesInput,
  dependencies: CandidateRetrievalDependencies = {},
): Promise<CandidateSearchResponse> {
  validateCandidateSearchRequest(input.request);

  const now = dependencies.now ?? performanceNow;
  const mode = candidateEdgeMode();
  const debug = input.debug ?? createRpcDebug(toEnterpriseSearchIntent(input.request));
  debug.candidateShadowMode = mode;
  debug.candidateShadowEdgeAttempted = mode === "shadow";

  const appPromise = retrieveAppCandidates(input, dependencies, debug, now);
  const edgePromise = mode === "shadow"
    ? retrieveEdgeCandidates(input.request, dependencies.fetchImpl ?? fetch, now)
    : Promise.resolve(null);

  const [appResponse, edgeResult] = await Promise.all([appPromise, edgePromise]);

  if (edgeResult) {
    applyShadowTelemetry(debug, input.request, appResponse, edgeResult);
  }

  return appResponse;
}

async function retrieveAppCandidates(
  input: RetrieveSearchCandidatesInput,
  dependencies: CandidateRetrievalDependencies,
  debug: CandidateRetrievalDebug,
  now: () => number,
): Promise<CandidateSearchResponse> {
  const searchLane: CandidateLaneLoader = dependencies.searchLane ?? searchEnterpriseLane;
  const startedAt = now();
  const intent = toEnterpriseSearchIntent(input.request);
  const domains = candidateSearchDomains(input.request);

  const laneResults = await Promise.all(
    domains.map((domain) =>
      retrieveCandidateLane({
        supabase: input.supabase,
        intent,
        domain,
        limit: limitForDomain(input.request, domain),
        debug,
        searchLane,
        now,
      }),
    ),
  );

  const restaurantLane = laneResults.find((lane) => lane.domain === "restaurant");
  const activityLane = laneResults.find((lane) => lane.domain === "activity");

  const response: CandidateSearchResponse = {
    contractVersion: SEARCH_CANDIDATE_CONTRACT_VERSION,
    requestId: input.request.requestId,
    restaurants: restaurantLane?.locations ?? [],
    activities: activityLane?.locations ?? [],
    timing: {
      totalMs: elapsedMs(startedAt, now()),
      restaurantQueryMs: restaurantLane?.queryMs ?? null,
      activityQueryMs: activityLane?.queryMs ?? null,
    },
    metadata: {
      provider: "app",
      truncated: Boolean(restaurantLane?.truncated) || Boolean(activityLane?.truncated),
      restaurantTruncated: Boolean(restaurantLane?.truncated),
      activityTruncated: Boolean(activityLane?.truncated),
      candidateFallbackUsed: false,
    },
  };

  validateCandidateSearchResponse(response, input.request.requestId);
  return response;
}

async function retrieveEdgeCandidates(
  request: CandidateSearchRequest,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<{ response: CandidateSearchResponse | null; ms: number; error: string | null }> {
  const startedAt = now();
  const baseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SEARCH_EDGE_INTERNAL_SECRET;

  if (!baseUrl || !secret) {
    return {
      response: null,
      ms: elapsedMs(startedAt, now()),
      error: "Edge candidate shadow mode is missing SUPABASE_URL or SEARCH_EDGE_INTERNAL_SECRET.",
    };
  }

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/functions/v1/search-candidates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-search-internal-secret": secret,
        "x-search-contract-version": request.contractVersion,
        "x-search-request-id": request.requestId,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Edge candidate request failed with ${response.status}.`);
    }

    const normalized = payload as CandidateSearchResponse;
    validateCandidateSearchResponse(normalized, request.requestId);

    return {
      response: normalized,
      ms: elapsedMs(startedAt, now()),
      error: null,
    };
  } catch (error) {
    return {
      response: null,
      ms: elapsedMs(startedAt, now()),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function applyShadowTelemetry(
  debug: CandidateRetrievalDebug,
  request: CandidateSearchRequest,
  appResponse: CandidateSearchResponse,
  edgeResult: { response: CandidateSearchResponse | null; ms: number; error: string | null },
) {
  debug.candidateShadowEdgeMs = edgeResult.ms;
  debug.candidateShadowError = edgeResult.error;
  debug.candidateShadowEdgeSucceeded = Boolean(edgeResult.response);

  if (!edgeResult.response) {
    console.warn("candidate-shadow", {
      requestId: request.requestId,
      succeeded: false,
      edgeMs: edgeResult.ms,
      error: edgeResult.error,
    });
    return;
  }

  const comparison = compareResponses(appResponse, edgeResult.response);
  debug.candidateShadowContractMatched = comparison.contractMatched;
  debug.candidateShadowRestaurantCount = edgeResult.response.restaurants.length;
  debug.candidateShadowActivityCount = edgeResult.response.activities.length;
  debug.candidateShadowRestaurantOverlap = comparison.restaurantOverlap;
  debug.candidateShadowActivityOverlap = comparison.activityOverlap;
  debug.candidateShadowRestaurantTop10Overlap = comparison.restaurantTop10Overlap;
  debug.candidateShadowActivityTop10Overlap = comparison.activityTop10Overlap;
  debug.candidateShadowDuplicateRestaurantIds = comparison.duplicateRestaurantIds;
  debug.candidateShadowDuplicateActivityIds = comparison.duplicateActivityIds;

  console.info("candidate-shadow", {
    requestId: request.requestId,
    succeeded: true,
    contractMatched: comparison.contractMatched,
    appRestaurantCount: appResponse.restaurants.length,
    edgeRestaurantCount: edgeResult.response.restaurants.length,
    appActivityCount: appResponse.activities.length,
    edgeActivityCount: edgeResult.response.activities.length,
    restaurantOverlap: comparison.restaurantOverlap,
    activityOverlap: comparison.activityOverlap,
    restaurantTop10Overlap: comparison.restaurantTop10Overlap,
    activityTop10Overlap: comparison.activityTop10Overlap,
    duplicateRestaurantIds: comparison.duplicateRestaurantIds,
    duplicateActivityIds: comparison.duplicateActivityIds,
    appMs: appResponse.timing.totalMs,
    edgeMs: edgeResult.ms,
  });
}

function compareResponses(app: CandidateSearchResponse, edge: CandidateSearchResponse): ShadowComparison {
  return {
    contractMatched: app.contractVersion === edge.contractVersion,
    restaurantOverlap: overlapRatio(app.restaurants, edge.restaurants),
    activityOverlap: overlapRatio(app.activities, edge.activities),
    restaurantTop10Overlap: overlapRatio(app.restaurants.slice(0, 10), edge.restaurants.slice(0, 10)),
    activityTop10Overlap: overlapRatio(app.activities.slice(0, 10), edge.activities.slice(0, 10)),
    duplicateRestaurantIds: duplicateIdCount(edge.restaurants),
    duplicateActivityIds: duplicateIdCount(edge.activities),
  };
}

function overlapRatio(left: EnterpriseLocation[], right: EnterpriseLocation[]): number {
  const leftIds = new Set(left.map(locationId).filter(Boolean));
  const rightIds = new Set(right.map(locationId).filter(Boolean));
  if (!leftIds.size && !rightIds.size) return 1;
  if (!leftIds.size || !rightIds.size) return 0;
  let overlap = 0;
  for (const id of leftIds) if (rightIds.has(id)) overlap += 1;
  return Number((overlap / Math.max(leftIds.size, rightIds.size)).toFixed(4));
}

function duplicateIdCount(rows: EnterpriseLocation[]): number {
  const ids = rows.map(locationId).filter(Boolean);
  return ids.length - new Set(ids).size;
}

function locationId(row: EnterpriseLocation): string {
  return row?.id == null ? "" : String(row.id);
}

export function applyCandidateRetrievalTelemetry(
  debug: CandidateRetrievalDebug,
  response: CandidateSearchResponse,
): CandidateRetrievalDebug {
  debug.candidateProvider = response.metadata.provider;
  debug.candidateContractVersion = response.contractVersion;
  debug.candidateRetrievalMs = response.timing.totalMs;
  debug.candidateRestaurantRetrievalMs = response.timing.restaurantQueryMs;
  debug.candidateActivityRetrievalMs = response.timing.activityQueryMs;
  debug.candidateFallbackUsed = response.metadata.candidateFallbackUsed;
  debug.candidateResultsTruncated = response.metadata.truncated;
  debug.candidateRestaurantCount = response.restaurants.length;
  debug.candidateActivityCount = response.activities.length;
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

async function retrieveCandidateLane(input: RetrieveCandidateLaneInput): Promise<CandidateLaneResult> {
  const startedAt = input.now();
  const rows = await input.searchLane(input.supabase, input.intent, input.domain, input.debug);
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    domain: input.domain,
    locations: safeRows.slice(0, input.limit),
    queryMs: elapsedMs(startedAt, input.now()),
    truncated: safeRows.length > input.limit,
  };
}

function limitForDomain(request: CandidateSearchRequest, domain: CandidateSearchDomain): number {
  return domain === "restaurant" ? request.restaurantLimit : request.activityLimit;
}

function candidateEdgeMode(): "off" | "shadow" {
  return String(process.env.SEARCH_EDGE_CANDIDATE_MODE ?? "off").toLowerCase() === "shadow"
    ? "shadow"
    : "off";
}

function performanceNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number, completedAt: number): number {
  return Math.max(0, Number((completedAt - startedAt).toFixed(2)));
}
