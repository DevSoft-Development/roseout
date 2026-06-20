import { NextRequest, NextResponse } from "next/server";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { isEdgeCreateSearchEnabled, runCreateSearchWithEdgeFallback } from "@/lib/search/createSearch";
import { getSearchSpeedStatus } from "@/lib/search/performance";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
import { requireBetaAdmin, safeError } from "../_shared";
import { parseOutingDateTime } from "@/lib/search/parse-outing-date-time";
import { normalizeCreateSearchRequest } from "@/lib/search/normalizeCreateSearchRequest";
import { detectRequestedMarket } from "@/lib/location-markets";

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const rawQuery = String(body.query || body.input || body.prompt || "").trim();
    const simulatedLocation = body.simulateCurrentLocation === true
      ? { userLatitude: body.testLatitude, userLongitude: body.testLongitude, latitude: body.testLatitude, longitude: body.testLongitude }
      : {};
    const normalizedRequest = normalizeCreateSearchRequest({
      rawQuery,
      body: { ...body, ...simulatedLocation },
      source: "admin_search_lab",
    });
    const query = normalizedRequest.cleanedQuery;
    const queryFlag = req.nextUrl.searchParams.get("useFastPath");
    const useFastPath = body.force_llm === true
      ? false
      : typeof body.useFastPath === "boolean"
        ? body.useFastPath
        : queryFlag === "false"
          ? false
          : true;

    if (!query) return safeError("query required", 400);

    const legacySearch = () =>
      runEnterpriseSearch(query, {
        useLLM: true,
        body: normalizedRequest.searchBody,
        source: "admin_search_lab",
        route: "/api/admin/beta/search-lab",
        logPerformance: true,
        betaDebug: true,
        betaAssignmentId: body.betaAssignmentId ?? null,
        betaTesterId: body.betaTesterId ?? null,
        usedCustomPrompt: !!body.usedCustomPrompt,
        useFastPath,
        createdByUserId: auth.adminUser?.user_id ?? null,
        searchHealthDebug: true,
      });

    const marketDetection = detectRequestedMarket(query);
    const forceLegacyForLongIsland = false;
    const forceLegacyForUserLocation = normalizedRequest.useCurrentLocation;
    const searchBackendUsed = forceLegacyForUserLocation ? "legacy_for_current_location" : "edge";

    const result = forceLegacyForLongIsland || forceLegacyForUserLocation
      ? await legacySearch()
      : await runCreateSearchWithEdgeFallback(
      {
        ...normalizedRequest.searchBody,
        prompt: query,
        input: query,
        query,
        debug: true,
        force_llm: body.force_llm === true || useFastPath === false,
        useFastPath,
        limit: 12,
      },
      {
        accessToken: req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null,
        legacySearch,
      },
    );
    const debug = result.debug as any;
    const perf = debug?.performance || {};
    const outingTiming = { ...parseOutingDateTime(query), ...(debug?.normalizedIntent ? { outingDateLabel: debug.normalizedIntent.outingDateLabel, outingTimeLabel: debug.normalizedIntent.outingTimeLabel, outingDateTimeText: debug.normalizedIntent.outingDateTimeText, outingTimeConfidence: debug.normalizedIntent.outingTimeConfidence, parsedDateText: debug.normalizedIntent.parsedDateText, parsedTimeText: debug.normalizedIntent.parsedTimeText, parsedDateTimeISO: debug.normalizedIntent.parsedDateTimeISO } : {}) };
    const restaurantCards = (result.restaurants as any[]) || [];
    const activityCards = (result.activities as any[]) || [];
    const pairCards = (result.pairs as any[]) || [];
    const rawCounts = { restaurants: restaurantCards.length, activities: activityCards.length, pairs: pairCards.length };
    const publicCounts = { ...rawCounts, cards: restaurantCards.length + activityCards.length };
    const finalResultNames = [...restaurantCards, ...activityCards, ...pairCards].slice(0, 12).map((item: any) => item?.name || item?.restaurant_name || item?.activity_name || item?.restaurant?.name || item?.activity?.name).filter(Boolean);
    const marketFiltering = {
      explicitMarketRequested: debug?.explicitMarketRequested ?? normalizedRequest.debugParity.explicitMarketRequested,
      resolvedMarket: debug?.resolvedMarket ?? normalizedRequest.debugParity.resolvedMarket,
      requestedMarket: debug?.requestedMarket ?? normalizedRequest.debugParity.requestedMarket,
      allowedMarkets: debug?.allowedMarkets ?? normalizedRequest.debugParity.allowedMarkets,
      geoSource: normalizedRequest.debugParity.geoSource,
      userLocationReceived: normalizedRequest.userLatitude != null && normalizedRequest.userLongitude != null,
      userLocationUsedAsPrimaryGeo: normalizedRequest.useCurrentLocation,
      userLocationUsedAsSoftBoost: Boolean(normalizedRequest.debugParity.userLocationUsedAsSoftBoost),
      restaurantCandidatesBeforeMarketFilter: debug?.restaurantCandidatesBeforeMarketFilter ?? restaurantCards.length,
      restaurantCandidatesAfterMarketFilter: restaurantCards.length,
      activityCandidatesBeforeMarketFilter: debug?.activityCandidatesBeforeMarketFilter ?? activityCards.length,
      activityCandidatesAfterMarketFilter: activityCards.length,
      outOfMarketRestaurantsRemoved: debug?.outOfMarketRestaurantsRemoved ?? 0,
      outOfMarketActivitiesRemoved: debug?.outOfMarketActivitiesRemoved ?? 0,
    };
    const debugParity = {
      ...normalizedRequest.debugParity,
      route: "/api/admin/beta/search-lab",
      source: "admin_search_lab",
      rawQueryReceived: rawQuery,
      forceLegacyForLongIsland,
      forceLegacyForUserLocation,
      searchBackendUsed,
      resolvedMarket: marketFiltering.resolvedMarket,
      allowedMarkets: marketFiltering.allowedMarkets,
      explicitMarketRequested: marketFiltering.explicitMarketRequested,
      searchType: debug?.normalizedIntent?.searchType ?? normalizedRequest.debugParity.searchType,
      wantsPairing: debug?.normalizedIntent?.wantsPairing ?? normalizedRequest.debugParity.wantsPairing,
      needsRestaurant: debug?.normalizedIntent?.needsRestaurant ?? normalizedRequest.debugParity.needsRestaurant,
      needsActivity: debug?.normalizedIntent?.needsActivity ?? normalizedRequest.debugParity.needsActivity,
      resultCounts: rawCounts,
      firstResultNames: finalResultNames.slice(0, 5),
    };

    const responseBody = {
      success: true,
      reply: result.reply,
      restaurants: restaurantCards.length,
      activities: activityCards.length,
      pairs: pairCards.length,
      restaurantCards,
      activityCards,
      pairCards,
      cards: [...restaurantCards, ...activityCards],
      rawCounts,
      publicCounts,
      finalResultNames,
      debugParity,
      marketFiltering,
      source: (result as any).source || (isEdgeCreateSearchEnabled() ? "edge" : "legacy"),
      searchBackendUsed,
      parser_source: debug?.parser_source,
      intentParserSource: debug?.intentParserSource ?? debug?.parser_source,
      fastPathMatched: Boolean(debug?.fastPathMatched ?? (debug?.parser_source === "fast_parser" || debug?.parser_source === "fast_path")),
      fastPathReason: debug?.fastPathReason ?? null,
      useFastPath,
      cache_hit: debug?.cache_hit,
      llm_used: debug?.llm_used,
      total_ms: perf.total_ms,
      speed_status: perf.speed_status,
      parsedIntent: debug?.normalizedIntent || (result as any).normalizedIntent,
      outingDateLabel: outingTiming.outingDateLabel ?? null,
      outingTimeLabel: outingTiming.outingTimeLabel ?? null,
      outingDateTimeText: outingTiming.outingDateTimeText ?? null,
      outingTimeConfidence: outingTiming.outingTimeConfidence ?? "none",
      parsedDateText: outingTiming.parsedDateText ?? null,
      parsedTimeText: outingTiming.parsedTimeText ?? null,
      parsedDateTimeISO: outingTiming.parsedDateTimeISO ?? null,
      performance: perf,
      defaultMarketApplied: debug?.defaultMarketApplied ?? false,
      defaultMarketId: debug?.defaultMarketId ?? null,
      defaultMarketLabel: debug?.defaultMarketLabel ?? null,
      defaultMarketRadiusMiles: debug?.defaultMarketRadiusMiles ?? null,
      marketReason: debug?.marketReason ?? null,
      originalGeo: debug?.originalGeo ?? null,
      effectiveGeo: debug?.effectiveGeo ?? null,
      rpcGeoLatitude: debug?.rpcGeoLatitude ?? debug?.geoLatitude ?? null,
      rpcGeoLongitude: debug?.rpcGeoLongitude ?? debug?.geoLongitude ?? null,
      rpcRadiusMiles: debug?.rpcRadiusMiles ?? debug?.radiusMiles ?? null,
      rejectedReasons: {
        restaurants: debug?.restaurantRejectedSummary,
        activities: debug?.activityRejectedSummary,
      },
      restaurantRpcTerms: debug?.restaurantRpcTerms ?? debug?.restaurantRpcTermsPruned,
      restaurantRpcTermsOriginal: debug?.restaurantRpcTermsOriginal,
      restaurantRpcTermsPruned: debug?.restaurantRpcTermsPruned,
      activityRpcTerms: debug?.activityRpcTerms ?? debug?.activityRpcTermsPruned,
      activityRpcTermsOriginal: debug?.activityRpcTermsOriginal,
      activityRpcTermsPruned: debug?.activityRpcTermsPruned,
      speedStatus: perf.speed_status || getSearchSpeedStatus({ totalMs: perf.total_ms, success: true }),
      activityRpcCountBeforePairing: debug?.activityRpcCountBeforePairing,
      activityRpcCountAfterRecovery: debug?.activityRpcCountAfterRecovery,
      pairCandidatesEvaluated: debug?.pairCandidatesEvaluated,
      validPairCountBeforeRender: debug?.validPairCountBeforeRender,
      pair_count: debug?.pair_count ?? (result.pairs as any[])?.length ?? 0,
      pairsRejectedForDistance: debug?.pairsRejectedForDistance,
      pairsRejectedForWalkingMinutes: debug?.pairsRejectedForWalkingMinutes,
      extremeWalkingRoutesRejected: debug?.extremeWalkingRoutesRejected,
      walkingMinutesEstimatedFromMiles: debug?.walkingMinutesEstimatedFromMiles,
      pairsWithGoogleWalkingMinutes: debug?.pairsWithGoogleWalkingMinutes,
      pairsMissingGoogleWalkingMinutes: debug?.pairsMissingGoogleWalkingMinutes,
      displayedWalkingMinuteLabels: debug?.displayedWalkingMinuteLabels,
      displayedMilesLabels: debug?.displayedMilesLabels,
      invalidWalkingRoutesHiddenFromDisplay: debug?.invalidWalkingRoutesHiddenFromDisplay,
      noPairsReason: debug?.noPairsReason,
      rejectedPairs: debug?.rejectedPairs,
      missingPhotoResultsRemoved: true,
      fallbackUsed: Boolean(debug?.restaurantRecoveryUsed || debug?.activityRecoveryUsed || debug?.edge_error),
      customPrompt: !!body.usedCustomPrompt,
      debug: { ...(result.debug as any || {}), debugParity, marketFiltering, searchBackendUsed },
    };

    if ((result as any).source === "edge" || debug?.source === "edge") {
      void logSearchHealthEvent({
        source: "admin_search_lab",
        rawQuery: normalizedRequest.rawQuery,
        result: responseBody,
        debug: { ...(result.debug as any || {}), debugParity, marketFiltering, searchBackendUsed },
        createdByUserId: auth.adminUser?.user_id ?? null,
        betaAssignmentId: body.betaAssignmentId ?? null,
        betaTesterId: body.betaTesterId ?? null,
        debugMode: true,
        forceLog: body?.logSearchHealth === true || body?.debug === true || body?.debug?.logSearchHealth === true,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error(error);
    return safeError("Search Lab failed");
  }
}
