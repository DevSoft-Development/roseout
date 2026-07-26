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

import type {
  EnterpriseLocation,
  SearchDomain,
  SearchIntent,
} from "./types";

import { searchEnterpriseLane } from "./rpc";

export type CandidateRetrievalDebug = {
  rpcCalls?: string[];
  errors?: string[];
  [key: string]: unknown;
};

export type CandidateLaneLoader = (
  supabase: SupabaseClient,
  intent: SearchIntent,
  domain: SearchDomain,
  debug?: CandidateRetrievalDebug,
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
  validateCandidateSearchRequest(input.request);

  const now = dependencies.now ?? performanceNow;
  const searchLane = dependencies.searchLane ?? searchEnterpriseLane;

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
        debug: input.debug,
        searchLane,
        now,
      }),
    ),
  );

  const restaurantLane = laneResults.find(
    (lane) => lane.domain === "restaurant",
  );

  const activityLane = laneResults.find(
    (lane) => lane.domain === "activity",
  );

  const restaurants = restaurantLane?.locations ?? [];
  const activities = activityLane?.locations ?? [];

  const response: CandidateSearchResponse = {
    contractVersion: SEARCH_CANDIDATE_CONTRACT_VERSION,
    requestId: input.request.requestId,
    restaurants,
    activities,
    timing: {
      totalMs: elapsedMs(startedAt, now()),
      restaurantQueryMs: restaurantLane?.queryMs ?? null,
      activityQueryMs: activityLane?.queryMs ?? null,
    },
    metadata: {
      provider: "app",
      truncated:
        Boolean(restaurantLane?.truncated) ||
        Boolean(activityLane?.truncated),
      restaurantTruncated: Boolean(restaurantLane?.truncated),
      activityTruncated: Boolean(activityLane?.truncated),
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
  debug.candidateProvider = response.metadata.provider;
  debug.candidateContractVersion = response.contractVersion;
  debug.candidateRetrievalMs = response.timing.totalMs;
  debug.candidateRestaurantRetrievalMs =
    response.timing.restaurantQueryMs;
  debug.candidateActivityRetrievalMs =
    response.timing.activityQueryMs;
  debug.candidateFallbackUsed =
    response.metadata.candidateFallbackUsed;
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
  debug?: CandidateRetrievalDebug;
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

  const safeRows = Array.isArray(rows) ? rows : [];
  const truncated = safeRows.length > input.limit;

  return {
    domain: input.domain,
    locations: safeRows.slice(0, input.limit),
    queryMs: elapsedMs(startedAt, input.now()),
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

function elapsedMs(startedAt: number, completedAt: number): number {
  return Math.max(
    0,
    Number((completedAt - startedAt).toFixed(2)),
  );
}