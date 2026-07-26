import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(
  process.cwd(),
  "lib/search/public-api/controller.ts",
);

if (!fs.existsSync(filePath)) {
  throw new Error(`File not found: ${filePath}`);
}

const original = fs.readFileSync(filePath, "utf8");

const startMarker =
  '    scheduleNoncriticalOperation(requestId, "logSearchEvent", () =>';

const endMarker =
  '    scheduleNoncriticalOperation(requestId, "logSearchHealthEvent", () =>';

const startIndex = original.indexOf(startMarker);
const endIndex = original.indexOf(endMarker);

if (startIndex === -1) {
  throw new Error(
    `Could not find the logSearchEvent block starting with:\n${startMarker}`,
  );
}

if (endIndex === -1 || endIndex <= startIndex) {
  throw new Error(
    `Could not find the logSearchHealthEvent block after logSearchEvent.`,
  );
}

const replacement = `    try {
      const analyticsResult = await logAnalytics({
        source: "public_create_search",
        route: "/api/generate",
        rawQuery: rawQueryBeforeNearMeStrip || input || cleanInput,
        normalizedQuery: cleanInput,
        searchType: resolvedSearchType,
        primaryDomain: resolvedPrimaryDomain,
        intentParserSource: resolvedIntentParserSource,
        userId:
          typeof searchIdentity.user?.id === "string"
            ? searchIdentity.user.id
            : null,
        anonymousId:
          (typeof body?.anonymousId === "string"
            ? body.anonymousId
            : null) ?? request.headers.get("x-anonymous-id"),
        sessionId: request.headers.get("x-session-id"),
        betaAssignmentId:
          typeof betaAssignmentId === "string"
            ? betaAssignmentId
            : null,
        betaTesterId:
          typeof betaTesterId === "string"
            ? betaTesterId
            : null,
        geo: resolvedGeo,
        outingDate: resolvedOutingDate,
        outingTime: resolvedOutingTime,
        outingDateTime: resolvedOutingDateTime,
        outingTimeLabel: resolvedOutingTimeLabel,
        counts,
        performance: {
          ...(debug?.performance ?? {}),
          route: "/api/generate",
          requestId,
          total_ms: now() - startedAt,
          timing_ms: now() - startedAt,
          llm_ms: timings.intentMs,
          rpc_ms: timings.searchMs,
          pairing_ms: timings.pairingMs,
          ranking_ms: timings.rankingMs,
          speed_status:
            now() - startedAt <= 3000
              ? "fast"
              : now() - startedAt <= 10000
                ? "ok"
                : "slow",
          publicSearchTimings: {
            ...timings,
            totalMs: now() - startedAt,
          },
        },
        pairingPreference:
          analyticsIntent?.pairingPreference ??
          debug?.pairingPreference ??
          null,
        wantsPairing: analyticsIntent?.wantsPairing ?? null,
        needsRestaurant: analyticsIntent?.needsRestaurant ?? null,
        needsActivity: analyticsIntent?.needsActivity ?? null,
        success: result?.success !== false,
        hadIssue: Boolean(
          noResultsReason ||
            noPairsReason ||
            debug?.event_type === "no_results" ||
            debug?.event_type === "no_valid_pairs",
        ),
        issueType: noResultsReason
          ? "no_results"
          : noPairsReason
            ? "no_valid_pairs"
            : null,
        issueLabel: noResultsReason ?? noPairsReason ?? null,
        noResultsReason,
        noPairsReason,
        metadata: sanitizeSearchMetadata({
          requestId,
          search_system: debug?.search_system,
          render_mode: debug?.render_mode ?? result?.render_mode,
          wantsPairing: analyticsIntent?.wantsPairing,
          needsRestaurant: analyticsIntent?.needsRestaurant,
          needsActivity: analyticsIntent?.needsActivity,
          normalizedIntent: analyticsNormalizedIntent,
          originalRawQuery:
            rawQueryBeforeNearMeStrip || input || cleanInput,
          raw_query_before_near_me_strip:
            rawQueryBeforeNearMeStrip,
          raw_query_after_near_me_strip: cleanInput,
          debugParity: analyticsDebugParity,
          geo: resolvedGeo,
          searchType: resolvedSearchType,
          primaryDomain: resolvedPrimaryDomain,
          intentParserSource: resolvedIntentParserSource,
          selectedSearchLane,
          ...nearMeDebug,
          geoSource: debug?.geoSource,
          raw_query:
            rawQueryBeforeNearMeStrip || input || cleanInput,
          result_ids: mlResultIds,
          pair_ids: mlPairIds,
          mlStatus: searchTelemetry.mlStatus,
          mlReason: searchTelemetry.mlReason,
          searchTelemetry: {
            pairCandidatesEvaluated:
              searchTelemetry.pairCandidatesEvaluated,
            validPairCountBeforeRender:
              searchTelemetry.validPairCountBeforeRender,
            candidatePairCountBeforeRequiredPairSuppression:
              searchTelemetry
                .candidatePairCountBeforeRequiredPairSuppression,
            pairsRejectedForDistance:
              searchTelemetry.pairsRejectedForDistance,
            pairsRejectedForMissingCoordinates:
              searchTelemetry.pairsRejectedForMissingCoordinates,
            extremeWalkingRoutesRejected:
              searchTelemetry.extremeWalkingRoutesRejected,
            invalidWalkingRoutesHiddenFromDisplay:
              searchTelemetry
                .invalidWalkingRoutesHiddenFromDisplay,
            distanceMode: searchTelemetry.distanceMode,
            maxPairDistanceMiles:
              searchTelemetry.maxPairDistanceMiles,
            maxPairWalkingMinutes:
              searchTelemetry.maxPairWalkingMinutes,
            intentMs: searchTelemetry.intentMs,
            searchMs: searchTelemetry.searchMs,
            pairingMs: searchTelemetry.pairingMs,
            rankingMs: searchTelemetry.rankingMs,
          },
          mlAppliedInPublicPath: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          ),
          mlNotAppliedReason: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          )
            ? null
            : ((result.debug as any)?.mlSearchDebug
                ?.mlUnavailableReason ??
              "ml_did_not_materially_change_results"),
          ml_result_ids: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          )
            ? mlResultIds
            : undefined,
          ml_pair_ids: Boolean(
            (result.debug as any)?.mlSearchDebug?.mlApplied,
          )
            ? mlPairIds
            : undefined,
          parsed_market: resolvedMarketForGuardrail,
          requestedMarket:
            normalizedIntent?.geo?.requestedMarket ??
            marketFiltering.requestedMarket,
          resolvedMarket:
            normalizedIntent?.geo?.resolvedMarket ??
            resolvedMarketForGuardrail,
          parsed_borough:
            normalizedIntent?.geo?.borough ??
            debug?.parsedBorough ??
            normalizedRequest.canonicalGeo?.borough ??
            null,
          parsed_city:
            normalizedIntent?.geo?.city ??
            debug?.parsedCity ??
            normalizedRequest.canonicalGeo?.city ??
            null,
          explicit_market_requested:
            explicitMarketRequestedForGuardrail,
          explicitGeoRequested: typedLocationIntent,
          canonicalLatitudePresent:
            normalizedRequest.canonicalGeo?.latitude != null,
          canonicalLongitudePresent:
            normalizedRequest.canonicalGeo?.longitude != null,
          userLocationUsedAsPrimaryGeo:
            normalizedRequest.debugParity
              .userLocationUsedAsPrimaryGeo,
          userLocationUsedAsSoftBoost:
            normalizedRequest.debugParity
              .userLocationUsedAsSoftBoost,
          final_result_markets_returned: Array.from(
            new Set(
              [
                ...publicRestaurants,
                ...publicActivities,
              ].map(
                (item: any) =>
                  \`\${item.market || "UNKNOWN"}:\${item.state || ""}\`,
              ),
            ),
          ),
          market_guardrail_rejected_count:
            marketGuardrailRejected,
          fallback_suppressed_count:
            explicitMarketRequestedForGuardrail &&
            marketGuardrailRejected > 0
              ? 1
              : 0,
        }) as Record<string, any>,
      });

      if (!analyticsResult.ok) {
        console.error(
          "[api/generate] search event was not saved",
          {
            requestId,
            rawQuery:
              rawQueryBeforeNearMeStrip ||
              input ||
              cleanInput,
            error: analyticsResult.error,
          },
        );
      }
    } catch (error) {
      console.error(
        "[api/generate] search event logging crashed",
        {
          requestId,
          rawQuery:
            rawQueryBeforeNearMeStrip ||
            input ||
            cleanInput,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }

`;

const updated =
  original.slice(0, startIndex) +
  replacement +
  original.slice(endIndex);

const backupPath = `${filePath}.before-search-event-fix`;

if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, "utf8");
}

fs.writeFileSync(filePath, updated, "utf8");

console.log("Updated:", filePath);
console.log("Backup:", backupPath);
console.log(
  "Search-event logging is now awaited before the response completes.",
);