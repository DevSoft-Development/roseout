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
import { hardenProductionSearchIntent } from "./queryHardening";
import {
  qualifyHookahCandidate,
  qualifyKaraokeCandidate,
  qualifySportsWatchCandidate,
} from "./activityQualification";

type RpcDebug = ReturnType<typeof createRpcDebug>;

type RecoveryAttempt = {
  lane: CandidateSearchDomain;
  reason: string;
  durationMs: number;
  resultCount: number;
  error: string | null;
  hardenedIntentUsed: boolean;
};

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
  candidateShadowDeferred?: boolean;
  crossDomainActivitySearchApplied?: boolean;
  crossDomainActivityCandidateCount?: number;
  crossDomainActivityRpcCount?: number;
  strictCuisinePrimaryFilterApplied?: boolean;
  strictCuisinePrimaryRejectedCount?: number;
  gardenCityRestaurantRecoveryAttempted?: boolean;
  gardenCityRestaurantRecoveryCount?: number;
  hookahCenteredRestaurantRecoveryAttempted?: boolean;
  hookahCenteredRestaurantRecoveryCount?: number;
  hookahRecoveryCenterId?: string | null;
  searchHardeningReasons?: string[];
  recoveryAttempts?: RecoveryAttempt[];
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
  const debug: CandidateRetrievalDebug =
    input.debug ?? createRpcDebug(toEnterpriseSearchIntent(input.request));
  debug.candidateShadowMode = mode;
  debug.candidateShadowEdgeAttempted = mode === "shadow";
  debug.candidateShadowDeferred = mode === "shadow";
  debug.recoveryAttempts = [];

  const appResponse = await retrieveAppCandidates(input, dependencies, debug, now);

  if (mode === "shadow") {
    void retrieveEdgeCandidates(input.request, dependencies.fetchImpl ?? fetch, now)
      .then((edgeResult) => applyShadowTelemetry(debug, input.request, appResponse, edgeResult))
      .catch((error) => {
        debug.candidateShadowError = error instanceof Error ? error.message : String(error);
        debug.candidateShadowEdgeSucceeded = false;
      });
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
  const baseIntent = toEnterpriseSearchIntent(input.request);
  const hardened = hardenProductionSearchIntent(baseIntent);
  const intent = hardened.intent;
  debug.searchHardeningReasons = hardened.profile.reasons;

  const domains = candidateSearchDomains(input.request);
  const laneResults = await Promise.all(
    domains.map((domain) =>
      retrieveCandidateLane({
        supabase: input.supabase,
        intent,
        baseIntent,
        domain,
        limit: limitForDomain(input.request, domain),
        debug,
        searchLane,
        now,
        hardeningReasons: hardened.profile.reasons,
      }),
    ),
  );

  const restaurantLane = laneResults.find((lane) => lane.domain === "restaurant");
  const activityLane = laneResults.find((lane) => lane.domain === "activity");
  const fallbackUsed = laneResults.some((lane) => lane.recovered);
  const rawRestaurants = restaurantLane?.locations ?? [];

  const crossDomainActivitySearch = shouldSearchRestaurantTypedActivities(intent);
  debug.crossDomainActivitySearchApplied = crossDomainActivitySearch;
  const crossDomainRows = crossDomainActivitySearch
    ? await searchRestaurantTypedActivities({
        supabase: input.supabase,
        intent,
        searchLane,
        debug,
      })
    : [];
  const promotedActivities = promoteRestaurantTypedActivities(
    crossDomainRows,
    intent.rawQuery,
  );
  debug.crossDomainActivityCandidateCount = promotedActivities.length;

  const activities = dedupeLocations([
    ...(activityLane?.locations ?? []),
    ...promotedActivities,
  ]);

  const centeredRestaurants = await recoverCenteredRestaurants({
    supabase: input.supabase,
    intent,
    currentRestaurants: rawRestaurants,
    activities,
    debug,
    searchLane,
  });
  const mergedRestaurants = dedupeLocations([
    ...centeredRestaurants,
    ...rawRestaurants,
  ]);
  const strictRestaurants = applyStrictCuisinePrimaryFilter(
    mergedRestaurants,
    intent,
    debug,
  );

  const response: CandidateSearchResponse = {
    contractVersion: SEARCH_CANDIDATE_CONTRACT_VERSION,
    requestId: input.request.requestId,
    restaurants: intent.needsRestaurant ? strictRestaurants : [],
    activities,
    timing: {
      totalMs: elapsedMs(startedAt, now()),
      restaurantQueryMs: restaurantLane?.queryMs ?? null,
      activityQueryMs: activityLane?.queryMs ?? null,
    },
    metadata: {
      provider: "app",
      truncated:
        Boolean(restaurantLane?.truncated) || Boolean(activityLane?.truncated),
      restaurantTruncated: Boolean(restaurantLane?.truncated),
      activityTruncated: Boolean(activityLane?.truncated),
      candidateFallbackUsed:
        fallbackUsed || centeredRestaurants.length > 0 || promotedActivities.length > 0,
    },
  };

  validateCandidateSearchResponse(response, input.request.requestId);
  return response;
}

async function searchRestaurantTypedActivities(args: {
  supabase: SupabaseClient;
  intent: SearchIntent;
  searchLane: CandidateLaneLoader;
  debug: CandidateRetrievalDebug;
}) {
  const roleIntent = buildRestaurantTypedActivityIntent(args.intent);
  args.debug.crossDomainActivityRpcCount =
    Number(args.debug.crossDomainActivityRpcCount ?? 0) + 1;
  try {
    const rows = await args.searchLane(
      args.supabase,
      roleIntent,
      "restaurant",
      args.debug,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    args.debug.recoveryAttempts?.push({
      lane: "activity",
      reason: "restaurant_typed_activity_retrieval",
      durationMs: 0,
      resultCount: 0,
      error: error instanceof Error ? error.message : String(error),
      hardenedIntentUsed: false,
    });
    return [];
  }
}

function buildRestaurantTypedActivityIntent(intent: SearchIntent): SearchIntent {
  const query = String(intent.rawQuery || "");
  const sports = /\b(sports?|watch|knicks|basketball|game)\b/i.test(query);
  const karaoke = /\bkaraoke\b/i.test(query);
  const hookah = /\b(hookah|shisha)\b/i.test(query);
  const terms = sports
    ? ["sports bar", "sports lounge", "live sports", "watch party", "game day", "big screens", "bar with tvs"]
    : karaoke
      ? ["karaoke bar", "karaoke lounge", "private karaoke", "karaoke rooms"]
      : hookah
        ? ["hookah lounge", "hookah bar", "shisha lounge", "shisha bar"]
        : [];

  return {
    ...intent,
    rawQuery: terms.join(" "),
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    strictness: "medium",
    restaurantIntent: {
      mealTerms: [],
      foodTerms: [],
      cuisineTerms: [],
      categoryTerms: terms,
      vibeTerms: [],
      featureTerms: terms,
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "nearby",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
  } as SearchIntent;
}

async function recoverCenteredRestaurants(args: {
  supabase: SupabaseClient;
  intent: SearchIntent;
  currentRestaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  debug: CandidateRetrievalDebug;
  searchLane: CandidateLaneLoader;
}) {
  if (!args.intent.needsRestaurant) return [];

  const gardenCity = /\bgarden city\b/i.test(args.intent.rawQuery || "");
  const hookah = /\b(hookah|shisha)\b/i.test(args.intent.rawQuery || "");
  const hookahCenter = hookah
    ? args.activities.find((row) => qualifyHookahCandidate(row).matches)
    : undefined;

  if (!gardenCity && !hookahCenter) return [];
  if (gardenCity && args.currentRestaurants.length > 0 && !hookahCenter) return [];

  const centerLatitude = hookahCenter
    ? Number(hookahCenter.latitude)
    : Number(args.intent.geo?.latitude ?? 40.7268);
  const centerLongitude = hookahCenter
    ? Number(hookahCenter.longitude)
    : Number(args.intent.geo?.longitude ?? -73.6343);
  if (!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) {
    return [];
  }

  const recoveryIntent: SearchIntent = {
    ...args.intent,
    rawQuery: hookahCenter
      ? "restaurant dinner food nearby"
      : "restaurant dinner family friendly",
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    strictness: "low",
    restaurantIntent: {
      mealTerms: ["dinner"],
      foodTerms: ["restaurant", "food"],
      cuisineTerms: [],
      categoryTerms: ["restaurant", "dining"],
      vibeTerms: gardenCity ? ["family friendly"] : [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    geo: {
      ...args.intent.geo,
      raw: gardenCity ? "Garden City" : args.intent.geo?.raw,
      city: gardenCity ? "Garden City" : args.intent.geo?.city,
      county: gardenCity ? "Nassau" : args.intent.geo?.county,
      state: "NY",
      latitude: centerLatitude,
      longitude: centerLongitude,
      radiusMiles: gardenCity ? 7 : 3,
      geoStrictness: "medium",
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "nearby",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
  } as SearchIntent;

  if (gardenCity) args.debug.gardenCityRestaurantRecoveryAttempted = true;
  if (hookahCenter) {
    args.debug.hookahCenteredRestaurantRecoveryAttempted = true;
    args.debug.hookahRecoveryCenterId =
      hookahCenter.id == null ? null : String(hookahCenter.id);
  }

  try {
    const rows = await args.searchLane(
      args.supabase,
      recoveryIntent,
      "restaurant",
      args.debug,
    );
    const safeRows = Array.isArray(rows) ? rows : [];
    if (gardenCity) args.debug.gardenCityRestaurantRecoveryCount = safeRows.length;
    if (hookahCenter) {
      args.debug.hookahCenteredRestaurantRecoveryCount = safeRows.length;
    }
    return safeRows;
  } catch (error) {
    args.debug.recoveryAttempts?.push({
      lane: "restaurant",
      reason: gardenCity
        ? "garden_city_restaurant_recovery"
        : "hookah_centered_restaurant_recovery",
      durationMs: 0,
      resultCount: 0,
      error: error instanceof Error ? error.message : String(error),
      hardenedIntentUsed: false,
    });
    return [];
  }
}

function shouldSearchRestaurantTypedActivities(intent: SearchIntent) {
  if (!intent.needsActivity) return false;
  return /\b(karaoke|hookah|shisha|sports? bar|sports? lounge|watch(?:ing)? (?:the )?game|knicks|basketball|live sports|watch party)\b/i.test(
    intent.rawQuery || "",
  );
}

function promoteRestaurantTypedActivities(
  rows: EnterpriseLocation[],
  query: string,
) {
  const sports = /\b(sports?|watch|knicks|basketball|game)\b/i.test(query);
  const karaoke = /\bkaraoke\b/i.test(query);
  const hookah = /\b(hookah|shisha)\b/i.test(query);

  return rows.flatMap((row) => {
    const qualification = sports
      ? qualifySportsWatchCandidate(row)
      : karaoke
        ? qualifyKaraokeCandidate(row)
        : hookah
          ? qualifyHookahCandidate(row)
          : null;
    if (!qualification?.matches) return [];
    return [
      {
        ...row,
        result_role: "activity",
        public_activity_role: qualification.role,
        source_location_type: row.location_type ?? null,
        cross_domain_promoted: true,
        recovery_evidence: {
          explicitTermsMatched: qualification.explicitMatches,
          strongTermsMatched: qualification.strongMatches,
          supportingTermsMatched: [],
        },
      } as EnterpriseLocation,
    ];
  });
}

function applyStrictCuisinePrimaryFilter(
  rows: EnterpriseLocation[],
  intent: SearchIntent,
  debug: CandidateRetrievalDebug,
) {
  const query = String(intent.rawQuery || "").toLowerCase();
  if (!/\bsushi\b/.test(query)) return rows;

  debug.strictCuisinePrimaryFilterApplied = true;
  const filtered = rows.filter((row) =>
    /\b(sushi|sashimi|nigiri|omakase|maki|temaki)\b/i.test(
      trustedCuisineText(row),
    ),
  );
  debug.strictCuisinePrimaryRejectedCount = rows.length - filtered.length;
  return filtered;
}

function trustedCuisineText(row: EnterpriseLocation) {
  return [
    row.name,
    row.restaurant_name,
    row.cuisine,
    row.cuisine_type,
    row.primary_category,
    row.tags,
    row.semantic_tags,
    row.intent_tags,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function locationSearchText(row: EnterpriseLocation) {
  return [
    row.name,
    row.restaurant_name,
    row.activity_name,
    row.cuisine,
    row.cuisine_type,
    row.primary_category,
    row.tags,
    row.semantic_tags,
    row.intent_tags,
    row.search_keywords,
    row.search_document,
    row.semantic_search_text,
    row.description,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function dedupeLocations(rows: EnterpriseLocation[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = locationId(row) || locationSearchText(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function retrieveEdgeCandidates(
  request: CandidateSearchRequest,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<{
  response: CandidateSearchResponse | null;
  ms: number;
  error: string | null;
}> {
  const startedAt = now();
  const baseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SEARCH_EDGE_INTERNAL_SECRET;
  const gatewayKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !secret) {
    return {
      response: null,
      ms: elapsedMs(startedAt, now()),
      error:
        "Edge candidate shadow mode is missing SUPABASE_URL or SEARCH_EDGE_INTERNAL_SECRET.",
    };
  }

  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/$/, "")}/functions/v1/search-candidates`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-search-internal-secret": secret,
          "x-search-contract-version": request.contractVersion,
          "x-search-request-id": request.requestId,
          ...(gatewayKey
            ? { authorization: `Bearer ${gatewayKey}`, apikey: gatewayKey }
            : {}),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error || `Edge candidate request failed with ${response.status}.`,
      );
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
  edgeResult: {
    response: CandidateSearchResponse | null;
    ms: number;
    error: string | null;
  },
) {
  debug.candidateShadowEdgeMs = edgeResult.ms;
  debug.candidateShadowError = edgeResult.error;
  debug.candidateShadowEdgeSucceeded = Boolean(edgeResult.response);
  if (!edgeResult.response) return;

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
    appMs: appResponse.timing.totalMs,
    edgeMs: edgeResult.ms,
    ...comparison,
  });
}

function compareResponses(
  app: CandidateSearchResponse,
  edge: CandidateSearchResponse,
): ShadowComparison {
  return {
    contractMatched: app.contractVersion === edge.contractVersion,
    restaurantOverlap: overlapRatio(app.restaurants, edge.restaurants),
    activityOverlap: overlapRatio(app.activities, edge.activities),
    restaurantTop10Overlap: overlapRatio(
      app.restaurants.slice(0, 10),
      edge.restaurants.slice(0, 10),
    ),
    activityTop10Overlap: overlapRatio(
      app.activities.slice(0, 10),
      edge.activities.slice(0, 10),
    ),
    duplicateRestaurantIds: duplicateIdCount(edge.restaurants),
    duplicateActivityIds: duplicateIdCount(edge.activities),
  };
}

function overlapRatio(
  left: EnterpriseLocation[],
  right: EnterpriseLocation[],
): number {
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
  baseIntent: SearchIntent;
  domain: CandidateSearchDomain;
  limit: number;
  debug: CandidateRetrievalDebug;
  searchLane: CandidateLaneLoader;
  now: () => number;
  hardeningReasons: string[];
};

type CandidateLaneResult = {
  domain: CandidateSearchDomain;
  locations: EnterpriseLocation[];
  queryMs: number;
  truncated: boolean;
  recovered: boolean;
};

async function retrieveCandidateLane(
  input: RetrieveCandidateLaneInput,
): Promise<CandidateLaneResult> {
  const startedAt = input.now();
  let rows: EnterpriseLocation[] = [];
  let initialError: string | null = null;
  try {
    rows = await input.searchLane(
      input.supabase,
      input.intent,
      input.domain,
      input.debug,
    );
  } catch (error) {
    initialError = error instanceof Error ? error.message : String(error);
  }

  let safeRows = Array.isArray(rows) ? rows : [];
  let recovered = false;
  const shouldRecover =
    safeRows.length === 0 && input.hardeningReasons.length > 0;

  if (shouldRecover) {
    const recoveryStarted = input.now();
    let recoveryError: string | null = null;
    try {
      const widenedIntent: SearchIntent = {
        ...input.intent,
        strictness: "low",
        geo: {
          ...input.intent.geo,
          geoStrictness: "none",
          radiusMiles: Math.max(
            Number(input.intent.geo?.radiusMiles ?? 0),
            12,
          ),
        },
      };
      const recoveredRows = await input.searchLane(
        input.supabase,
        widenedIntent,
        input.domain,
        input.debug,
      );
      safeRows = dedupeLocations([
        ...safeRows,
        ...(Array.isArray(recoveredRows) ? recoveredRows : []),
      ]);
      recovered = safeRows.length > 0;
    } catch (error) {
      recoveryError = error instanceof Error ? error.message : String(error);
    }
    input.debug.recoveryAttempts?.push({
      lane: input.domain,
      reason: input.hardeningReasons.join(","),
      durationMs: elapsedMs(recoveryStarted, input.now()),
      resultCount: safeRows.length,
      error: recoveryError,
      hardenedIntentUsed: true,
    });
  } else if (initialError) {
    input.debug.recoveryAttempts?.push({
      lane: input.domain,
      reason: "initial_lane_error",
      durationMs: elapsedMs(startedAt, input.now()),
      resultCount: 0,
      error: initialError,
      hardenedIntentUsed: true,
    });
  }

  return {
    domain: input.domain,
    locations: safeRows.slice(0, input.limit),
    queryMs: elapsedMs(startedAt, input.now()),
    truncated: safeRows.length > input.limit,
    recovered,
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

function candidateEdgeMode(): "off" | "shadow" {
  return String(process.env.SEARCH_EDGE_CANDIDATE_MODE ?? "off").toLowerCase() ===
    "shadow"
    ? "shadow"
    : "off";
}

function performanceNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number, completedAt: number): number {
  return Math.max(0, Number((completedAt - startedAt).toFixed(2)));
}
