import { runEnterpriseSearch } from "@/lib/search/enterprise";
import type {
  EnterpriseLocation,
  EnterpriseSearchResult,
} from "@/lib/search/enterprise/types";
import type { UserSearchLocation } from "@/lib/search/enterprise/markets";
import { runAnchoredNearbySearch } from "@/lib/search/enterprise/anchoredNearby";
import { filterAnchoredRestaurantResults } from "@/lib/search/enterprise/anchoredRestaurantEligibility";
import {
  matchesAnchoredQualifier,
  normalizeAnchoredQuery,
} from "@/lib/search/enterprise/anchoredQueryNormalization";
import { applyResultGuardrails } from "@/lib/search/enterprise/resultGuardrails";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RunOutingSearchInput = {
  query: string;
  userLocation?: UserSearchLocation | null;
  market?: string | null;
  source?: string | null;
  route?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  filters?: Record<string, unknown> | null;
  body?: Record<string, any> | null;
  supabase?: any;
  displayLimit?: number;
  useLLM?: boolean;
  logPerformance?: boolean;
  betaDebug?: boolean;
  betaAssignmentId?: string | null;
  betaTesterId?: string | null;
  usedCustomPrompt?: boolean;
  useFastPath?: boolean;
  createdByUserId?: string | null;
  searchHealthDebug?: boolean;
  betaFeedbackSubmitted?: boolean;
};

type AnchoredResultWithCards = EnterpriseSearchResult & {
  cards?: EnterpriseLocation[];
  anchor_location?: EnterpriseLocation | null;
  search_context?: Record<string, any> | null;
};

function anchoredSpeedStatus(totalMs: number) {
  if (totalMs < 1500) return "fast";
  if (totalMs < 3000) return "acceptable";
  if (totalMs < 5000) return "slow";
  return "critical";
}

function finalizeAnchoredResult(
  result: EnterpriseSearchResult,
  query: string,
  qualifier: string | null,
  displayLimit: number,
  totalMs: number,
): EnterpriseSearchResult {
  const anchored = result as AnchoredResultWithCards;

  if (anchored.restaurants.length > 0) {
    const originalRestaurantCount = anchored.restaurants.length;
    const qualifierFiltered = anchored.restaurants.filter((row) =>
      matchesAnchoredQualifier(row, qualifier),
    );
    const filtered = filterAnchoredRestaurantResults(
      qualifierFiltered,
      query,
      displayLimit,
    );

    anchored.restaurants = filtered.results;
    anchored.cards = filtered.results;
    anchored.success = filtered.results.length > 0;
    anchored.card_counts.restaurants = filtered.results.length;

    if (anchored.cardCounts) {
      anchored.cardCounts.restaurants = filtered.results.length;
    }

    anchored.debug = {
      ...(anchored.debug ?? {}),
      anchorQualifier: qualifier,
      anchorQualifierApplied: Boolean(qualifier),
      anchorQualifierRejectedCount:
        originalRestaurantCount - qualifierFiltered.length,
      excludedBakeryOnlyCount: filtered.excludedBakeryOnlyCount,
      finalDisplayedResultCount: filtered.results.length,
    };
  } else if (anchored.activities.length > displayLimit) {
    anchored.activities = anchored.activities.slice(0, displayLimit);
    anchored.cards = anchored.activities;
    anchored.card_counts.activities = anchored.activities.length;
  }

  const anchor = anchored.anchor_location;
  const requestedDomain =
    anchored.restaurants.length > 0 ? "restaurant" : "activity";
  const intentName = `anchored_nearby_${requestedDomain}`;
  const resolvedMarket =
    (typeof anchor?.market === "string" && anchor.market) ||
    (anchored.debug as any)?.resolvedMarket ||
    null;
  const maxDistanceMiles =
    Number((anchored.search_context as any)?.max_distance_miles) ||
    Number((anchored.debug as any)?.maxAnchorDistanceMiles) ||
    null;
  const anchorConfidence = Number((anchored.debug as any)?.anchorConfidence);
  const speedStatus = anchoredSpeedStatus(totalMs);
  const debugParity = {
    ...((anchored.debug as any)?.debugParity ?? {}),
    geoSource: "named_location_anchor",
    selectedSearchLane: `anchored_${requestedDomain}`,
    searchType: "anchored_nearby",
    distanceMode: "anchor_radius",
    intentParserSource: "named_location_anchor",
    primaryIntent: intentName,
    resolvedMarket,
    wantsPairing: false,
    needsRestaurant: requestedDomain === "restaurant",
    needsActivity: requestedDomain === "activity",
  };

  anchored.debug = {
    ...(anchored.debug ?? {}),
    debugParity,
    intentParserSource: "named_location_anchor",
    intent_parser_source: "named_location_anchor",
    primaryIntent: intentName,
    primary_intent: intentName,
    intentConfidence: Number.isFinite(anchorConfidence) ? anchorConfidence : 1,
    intent_confidence: Number.isFinite(anchorConfidence) ? anchorConfidence : 1,
    allIntents: [intentName],
    all_intents: [intentName],
    selectedSearchLane: `anchored_${requestedDomain}`,
    selected_search_lane: `anchored_${requestedDomain}`,
    geoSource: "named_location_anchor",
    geo_source: "named_location_anchor",
    resolvedMarket,
    resolved_market: resolvedMarket,
    distanceMode: "anchor_radius",
    distance_mode: "anchor_radius",
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "anchor_radius",
      maxPairDistanceMiles: maxDistanceMiles,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    performance: {
      ...((anchored.debug as any)?.performance ?? {}),
      route: "/api/generate",
      total_ms: totalMs,
      result_count: anchored.restaurants.length + anchored.activities.length,
      speed_status: speedStatus,
    },
    speedStatus,
  };

  return applyResultGuardrails(anchored, query);
}

/** Canonical app-side public outing search orchestration. */
export async function runOutingSearch(
  input: RunOutingSearchInput,
): Promise<EnterpriseSearchResult> {
  const query = String(input.query || "").trim();
  if (!query) throw new Error("Search query is required.");

  const body = {
    ...(input.body ?? {}),
    ...(input.filters ? { filters: input.filters } : {}),
    query,
    input: query,
    message: query,
  };

  const displayLimit = Math.max(1, input.displayLimit ?? 12);
  const normalizedAnchor = normalizeAnchoredQuery(query);
  const anchoredStartedAt = Date.now();
  const anchored = await runAnchoredNearbySearch({
    query: normalizedAnchor?.canonicalQuery ?? query,
    supabase: input.supabase ?? supabaseAdmin,
    // Pull extra nearby candidates so qualifier and eligibility filtering can
    // remove weak rows without shrinking the final result set unnecessarily.
    displayLimit: Math.max(displayLimit * 3, 36),
  });

  if (anchored) {
    return finalizeAnchoredResult(
      anchored,
      query,
      normalizedAnchor?.qualifier ?? null,
      displayLimit,
      Date.now() - anchoredStartedAt,
    );
  }

  const result = await runEnterpriseSearch(query, {
    ...input,
    body,
    userLocation: input.userLocation ?? null,
    selectedMarketId:
      input.market ??
      input.body?.selectedMarketId ??
      input.body?.selected_market_id ??
      null,
    source: input.source ?? "public_outing_search",
    route: input.route ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  });

  return applyResultGuardrails(result, query);
}
