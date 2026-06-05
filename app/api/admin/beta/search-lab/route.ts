import { NextRequest, NextResponse } from "next/server";
import { runEnterpriseSearch } from "@/lib/search/enterprise";
import { isEdgeCreateSearchEnabled, runCreateSearchWithEdgeFallback } from "@/lib/search/createSearch";
import { getSearchSpeedStatus } from "@/lib/search/performance";
import { logSearchHealthEvent } from "@/lib/search/enterprise/searchHealthLogger";
import { requireBetaAdmin, safeError } from "../_shared";

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const query = String(body.query || "").trim();
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
        body,
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

    const result = await runCreateSearchWithEdgeFallback(
      {
        prompt: query,
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

    const responseBody = {
      success: true,
      reply: result.reply,
      restaurants: (result.restaurants as any[])?.length || 0,
      activities: (result.activities as any[])?.length || 0,
      pairs: (result.pairs as any[])?.length || 0,
      cards: [...((result.restaurants as any[]) || []), ...((result.activities as any[]) || [])],
      source: (result as any).source || (isEdgeCreateSearchEnabled() ? "edge" : "legacy"),
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
      debug: result.debug,
    };

    if ((result as any).source === "edge" || debug?.source === "edge") {
      void logSearchHealthEvent({
        source: "admin_search_lab",
        rawQuery: query,
        result: responseBody,
        debug: result.debug,
        createdByUserId: auth.adminUser?.user_id ?? null,
        betaAssignmentId: body.betaAssignmentId ?? null,
        betaTesterId: body.betaTesterId ?? null,
        debugMode: true,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error(error);
    return safeError("Search Lab failed");
  }
}
