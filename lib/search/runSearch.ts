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
import { backfillQualifiedAnchorRestaurants } from "@/lib/search/enterprise/anchoredQualifiedBackfill";
import { applyResultGuardrails } from "@/lib/search/enterprise/resultGuardrails";
import { recoverPostFilterSearchResult } from "@/lib/search/enterprise/postFilterRecovery";
import { extractMixedOutingAnchor } from "@/lib/search/anchors/extractMixedAnchor";
import {
  recordAnchorDiscovery,
  resolveSearchAnchor,
} from "@/lib/search/anchors/resolve";
import { anchorRadiusPolicy } from "@/lib/search/anchors/radius";
import { buildUnresolvedAnchorFallbackQuery } from "@/lib/search/anchors/unresolvedFallback";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  PersonalizationMode,
  UserPreferenceProfile,
} from "@/lib/search/enterprise/personalization";

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
  personalizationProfile?: UserPreferenceProfile;
  personalizationMode?: PersonalizationMode;
  personalizationFailureReason?: string;
};

type AnchoredResultWithCards = EnterpriseSearchResult & {
  cards?: EnterpriseLocation[];
  anchor_location?: EnterpriseLocation | null;
  search_context?: Record<string, any> | null;
  broader_nearby_restaurants?: EnterpriseLocation[];
};

function anchoredSpeedStatus(totalMs: number) {
  if (totalMs < 1500) return "fast";
  if (totalMs < 3000) return "acceptable";
  if (totalMs < 5000) return "slow";
  return "critical";
}

async function finalizeAnchoredResult(
  result: EnterpriseSearchResult,
  query: string,
  qualifier: string | null,
  displayLimit: number,
  totalMs: number,
  supabase: any,
): Promise<EnterpriseSearchResult> {
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

    if (qualifier && anchored.anchor_location && filtered.results.length < 3) {
      const backfill = await backfillQualifiedAnchorRestaurants({
        supabase,
        anchor: anchored.anchor_location,
        query,
        qualifier,
        existingQualified: filtered.results,
        displayLimit,
      });

      anchored.restaurants = backfill.qualifiedRestaurants;
      anchored.cards = backfill.qualifiedRestaurants;
      anchored.broader_nearby_restaurants = backfill.broaderNearbyRestaurants;
      anchored.success = backfill.qualifiedRestaurants.length > 0;
      anchored.card_counts.restaurants = backfill.qualifiedRestaurants.length;
      anchored.search_context = {
        ...(anchored.search_context ?? {}),
        qualified_radius_expanded: true,
        qualified_radius_miles: backfill.expandedRadiusMiles,
        broader_nearby_heading: `More restaurants near ${anchored.anchor_location.name ?? anchored.anchor_location.restaurant_name ?? anchored.anchor_location.activity_name ?? "this location"}`,
        broader_nearby_count: backfill.broaderNearbyRestaurants.length,
      };
      anchored.debug = {
        ...(anchored.debug ?? {}),
        anchorQualifiedRadiusExpanded: true,
        anchorQualifiedExpandedRadiusMiles: backfill.expandedRadiusMiles,
        anchorQualifiedExpandedCandidateCount: backfill.expandedCandidateCount,
        anchorQualifiedAddedCount: backfill.qualifiedAddedCount,
        broaderNearbyRestaurantCount: backfill.broaderNearbyRestaurants.length,
      };
    }

    if (anchored.cardCounts) {
      anchored.cardCounts.restaurants = anchored.restaurants.length;
    }

    anchored.debug = {
      ...(anchored.debug ?? {}),
      anchorQualifier: qualifier,
      anchorQualifierApplied: Boolean(qualifier),
      anchorQualifierRejectedCount:
        originalRestaurantCount - qualifierFiltered.length,
      excludedBakeryOnlyCount: filtered.excludedBakeryOnlyCount,
      finalDisplayedResultCount: anchored.restaurants.length,
    };
  } else if (anchored.activities.length > displayLimit) {
    anchored.activities = anchored.activities.slice(0, displayLimit);
    anchored.cards = anchored.activities;
    anchored.card_counts.activities = anchored.activities.length;
  }

  const anchor = anchored.anchor_location;
  const debugRequestedDomain = (anchored.debug as any)?.requestedDomain;
  const requestedDomain =
    debugRequestedDomain === "activity"
      ? "activity"
      : debugRequestedDomain === "restaurant"
        ? "restaurant"
        : anchored.restaurants.length > 0
          ? "restaurant"
          : "activity";
  const intentName = `anchored_nearby_${requestedDomain}`;
  const resolvedMarket =
    (typeof anchor?.market === "string" && anchor.market) ||
    (anchored.debug as any)?.resolvedMarket ||
    null;
  const maxDistanceMiles =
    Number((anchored.search_context as any)?.qualified_radius_miles) ||
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
    needsRestaurant: requestedDomain === "restaurant",
    needsActivity: requestedDomain === "activity",
    wantsPairing: false,
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

  return anchored;
}

function anchorUserLocation(
  result: EnterpriseSearchResult,
): UserSearchLocation | null {
  const anchored = result as AnchoredResultWithCards;
  const anchor = anchored.anchor_location;
  const latitude = Number(anchor?.latitude);
  const longitude = Number(anchor?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    radiusMiles:
      Number((anchored.search_context as any)?.qualified_radius_miles) ||
      Number((anchored.search_context as any)?.max_distance_miles) ||
      Number((anchored.debug as any)?.maxAnchorDistanceMiles) ||
      12,
    state: anchor?.state ?? null,
    label:
      anchor?.name ??
      anchor?.restaurant_name ??
      anchor?.activity_name ??
      "Named location",
  };
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
  const selectedMarketId =
    input.market ??
    input.body?.selectedMarketId ??
    input.body?.selected_market_id ??
    null;
  const displayLimit = Math.max(1, input.displayLimit ?? 12);
  const normalizedAnchor = normalizeAnchoredQuery(query);
  const anchoredStartedAt = Date.now();
  const supabase = input.supabase ?? supabaseAdmin;

  const runEnterprise = (
    searchQuery: string,
    searchBody: Record<string, any>,
    userLocation: UserSearchLocation | null,
  ) =>
    runEnterpriseSearch(searchQuery, {
      ...input,
      body: searchBody,
      userLocation,
      selectedMarketId,
      source: input.source ?? "public_outing_search",
      route: input.route ?? null,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
    });

  const recoverAndGuard = async (
    result: EnterpriseSearchResult,
    searchQuery: string,
    searchBody: Record<string, any>,
    userLocation: UserSearchLocation | null,
  ) => {
    const recovered = await recoverPostFilterSearchResult({
      result,
      query: searchQuery,
      body: searchBody,
      userLocation,
      runRecoverySearch: ({
        query: recoveryQuery,
        body: recoveryBody,
        userLocation: recoveryLocation,
      }) => runEnterprise(recoveryQuery, recoveryBody, recoveryLocation),
    });
    return applyResultGuardrails(recovered, query);
  };

  const anchored = await runAnchoredNearbySearch({
    query: normalizedAnchor?.canonicalQuery ?? query,
    supabase,
    displayLimit: Math.max(displayLimit * 3, 36),
  });

  const anchorResolutionStatus = String(
    (anchored?.debug as any)?.anchorResolutionStatus ?? "",
  );
  if (
    anchored &&
    anchorResolutionStatus &&
    anchorResolutionStatus !== "resolved"
  ) {
    const rawAnchorText = String(
      (anchored.debug as any)?.anchorRawName ?? "",
    ).trim();
    const requestedDomain =
      (anchored.debug as any)?.requestedDomain === "activity"
        ? "activity"
        : "restaurant";
    const fallbackQuery = buildUnresolvedAnchorFallbackQuery({
      rawAnchorText,
      requestedDomain,
      qualifier: normalizedAnchor?.qualifier ?? null,
    });

    if (fallbackQuery) {
      const fallbackBody = {
        ...body,
        query: fallbackQuery,
        input: fallbackQuery,
        message: fallbackQuery,
        unresolvedAnchorFallback: true,
        unresolvedAnchorText: rawAnchorText,
        originalAnchoredQuery: query,
      };
      const fallback = await runEnterprise(
        fallbackQuery,
        fallbackBody,
        input.userLocation ?? null,
      );
      fallback.debug = {
        ...(fallback.debug ?? {}),
        anchorRequested: true,
        anchorResolved: false,
        anchorResolutionStatus,
        anchorRawName: rawAnchorText,
        unresolvedAnchorFallbackUsed: true,
        unresolvedAnchorFallbackQuery: fallbackQuery,
        originalAnchoredQuery: query,
        debugParity: {
          ...((fallback.debug as any)?.debugParity ?? {}),
          anchorRequested: true,
          anchorResolved: false,
          anchorResolutionStatus,
          unresolvedAnchorFallbackUsed: true,
          unresolvedAnchorFallbackQuery: fallbackQuery,
        },
      };
      return recoverAndGuard(
        fallback,
        fallbackQuery,
        fallbackBody,
        input.userLocation ?? null,
      );
    }
  }

  if (anchored) {
    const finalized = await finalizeAnchoredResult(
      anchored,
      query,
      normalizedAnchor?.qualifier ?? null,
      displayLimit,
      Date.now() - anchoredStartedAt,
      supabase,
    );
    return recoverAndGuard(
      finalized,
      normalizedAnchor?.canonicalQuery ?? query,
      body,
      anchorUserLocation(finalized),
    );
  }

  const mixedAnchorRequest = extractMixedOutingAnchor(query);
  if (mixedAnchorRequest) {
    const anchorResolution = await resolveSearchAnchor(
      supabase,
      mixedAnchorRequest.rawAnchorText,
    );

    if (anchorResolution.status === "resolved" && anchorResolution.anchor) {
      const anchor = anchorResolution.anchor;
      const radius = anchorRadiusPolicy(anchor);
      const anchorLocation: UserSearchLocation = {
        latitude: Number(anchor.latitude),
        longitude: Number(anchor.longitude),
        radiusMiles: radius.initialRadiusMiles,
        state: anchor.state ?? null,
        label: anchor.canonicalName ?? anchor.canonical_name ?? anchor.name,
      };
      const anchoredMixedBody = {
        ...body,
        query: mixedAnchorRequest.intentQuery,
        input: mixedAnchorRequest.intentQuery,
        message: mixedAnchorRequest.intentQuery,
        namedAnchor: {
          id: anchor.id,
          name: anchorLocation.label,
          source: anchorResolution.source,
          relationship: mixedAnchorRequest.relationship,
          radiusMiles: radius.initialRadiusMiles,
        },
      };
      const result = await runEnterprise(
        mixedAnchorRequest.intentQuery,
        anchoredMixedBody,
        anchorLocation,
      );
      result.debug = {
        ...(result.debug ?? {}),
        anchorRequested: true,
        anchorResolved: true,
        anchorRawName: mixedAnchorRequest.rawAnchorText,
        anchorLocationId: anchor.id,
        anchorLocationName: anchorLocation.label,
        anchorResolutionSource: anchorResolution.source,
        anchorResolutionMs: anchorResolution.resolutionMs,
        anchorConfidence: anchorResolution.confidence,
        anchorRelationship: mixedAnchorRequest.relationship,
        initialRadiusMiles: radius.initialRadiusMiles,
        maxAnchorDistanceMiles: radius.maxRadiusMiles,
        geoSource: "named_location_anchor",
        distanceMode: "anchor_radius",
        needsRestaurant: true,
        needsActivity: true,
        wantsPairing: true,
        debugParity: {
          ...((result.debug as any)?.debugParity ?? {}),
          geoSource: "named_location_anchor",
          distanceMode: "anchor_radius",
          searchType: "mixed_outing",
          wantsPairing: true,
          needsRestaurant: true,
          needsActivity: true,
          intentParserSource: "named_location_anchor",
          resolvedAnchor: {
            id: anchor.id,
            label: anchorLocation.label,
            matchedText: mixedAnchorRequest.rawAnchorText,
            latitude: anchorLocation.latitude,
            longitude: anchorLocation.longitude,
            radiusMiles: anchorLocation.radiusMiles,
          },
        },
      };
      return recoverAndGuard(
        result,
        mixedAnchorRequest.intentQuery,
        anchoredMixedBody,
        anchorLocation,
      );
    }

    if (anchorResolution.status === "not_found") {
      await recordAnchorDiscovery(supabase, {
        rawQuery: query,
        rawAnchorText: mixedAnchorRequest.rawAnchorText,
        requestedDomain: "activity",
      });
    }
  }

  const result = await runEnterprise(query, body, input.userLocation ?? null);
  return recoverAndGuard(result, query, body, input.userLocation ?? null);
}
