import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";

type JsonRecord = Record<string, any>;

export type SearchEventLoggerArgs = {
  source?: string;
  route?: string;
  environment?: string;
  rawQuery?: string | null;
  normalizedQuery?: string | null;
  searchType?: string | null;
  primaryDomain?: string | null;
  intentParserSource?: string | null;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  betaTesterId?: string | null;
  betaAssignmentId?: string | null;
  geo?: JsonRecord | null;
  outingDate?: string | null;
  outingTime?: string | null;
  outingDateTime?: string | null;
  outingTimeLabel?: string | null;
  counts?: JsonRecord | null;
  performance?: JsonRecord | null;
  pairingPreference?: JsonRecord | null;
  success?: boolean;
  hadIssue?: boolean;
  issueType?: string | null;
  issueLabel?: string | null;
  noResultsReason?: string | null;
  noPairsReason?: string | null;
  metadata?: JsonRecord | null;
  wantsPairing?: boolean | null;
  needsRestaurant?: boolean | null;
  needsActivity?: boolean | null;
};

function safeText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function safeInteger(value: unknown): number | null {
  const numberValue = safeNumber(value);
  if (numberValue == null) return null;

  return Math.round(numberValue);
}

function safeBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeUuid(value: unknown): string | null {
  const text = safeText(value, 80);
  if (!text) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;

  return /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null;
}

function normalizeDateTime(value: unknown): string | null {
  const text = safeText(value, 150);
  if (!text) return null;

  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp).toISOString();
}

function filterResultIdsForServedCounts(
  value: unknown,
  restaurantCount: number,
  activityCount: number,
) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    const locationType = safeText(item?.location_type ?? item?.locationType, 40)?.toLowerCase();
    if (locationType === "restaurant" && restaurantCount === 0) return false;
    if (locationType === "activity" && activityCount === 0) return false;
    return true;
  });
}

function cleanMetadata(
  metadata: JsonRecord | null | undefined,
  restaurantCount: number,
  activityCount: number,
): JsonRecord {
  const next = { ...(metadata ?? {}) };

  delete next.email;
  delete next.phone;
  delete next.phoneNumber;
  delete next.address;
  delete next.fullAddress;
  delete next.name;
  delete next.fullName;

  next.result_ids = filterResultIdsForServedCounts(
    next.result_ids,
    restaurantCount,
    activityCount,
  );
  next.ml_result_ids = filterResultIdsForServedCounts(
    next.ml_result_ids,
    restaurantCount,
    activityCount,
  );

  return next;
}

function intentBool(
  args: SearchEventLoggerArgs,
  key: "wantsPairing" | "needsRestaurant" | "needsActivity",
): boolean | null {
  const direct = safeBool(args[key]);
  if (direct != null) return direct;

  const metadataValue = safeBool(args.metadata?.[key]);
  if (metadataValue != null) return metadataValue;

  const normalizedValue = safeBool(args.metadata?.normalizedIntent?.[key]);
  if (normalizedValue != null) return normalizedValue;

  const renderMode =
    args.metadata?.render_mode ?? args.metadata?.renderMode;

  if (renderMode === "mixed_pairs") return true;

  return null;
}

function resolvedInferredSearchMode(
  args: SearchEventLoggerArgs,
  fallback: string,
): string {
  const metadata = args.metadata ?? {};
  const normalizedIntent = metadata.normalizedIntent ?? {};

  const sameVenuePreferred =
    safeBool(normalizedIntent.sameVenuePreferred) ??
    safeBool(metadata.sameVenuePreferred) ??
    safeBool(metadata.debugParity?.sameVenuePreferred);

  const needsActivity =
    intentBool(args, "needsActivity") ??
    safeBool(normalizedIntent.needsActivity);

  const searchType =
    safeText(args.searchType, 100) ??
    safeText(metadata.searchType, 100) ??
    safeText(normalizedIntent.searchType, 100);

  if (sameVenuePreferred === true && needsActivity === false) {
    return searchType === "same_location_combo"
      ? "same_location_combo"
      : "restaurant";
  }

  if (searchType === "same_location_combo") {
    return "same_location_combo";
  }

  if (searchType === "restaurant_only") {
    return "restaurant";
  }

  if (searchType === "activity_only") {
    return "activity";
  }

  if (
    searchType === "mixed_outing" ||
    searchType === "paired_outing"
  ) {
    return "mixed";
  }

  if (searchType === "restaurant") {
    return "restaurant";
  }

  return fallback;
}

export async function logSearchEvent(
  args: SearchEventLoggerArgs,
): Promise<{ ok: boolean; error?: unknown }> {
  try {
    const geo = args.geo ?? {};
    const counts = args.counts ?? {};
    const performance = args.performance ?? {};
    const pairingPreference = args.pairingPreference ?? {};

    const rawQuery = safeText(args.rawQuery, 1000);
    const normalizedQuery = safeText(args.normalizedQuery, 1000);

    const restaurantCount =
      safeInteger(
        counts.restaurants ?? counts.restaurant_count,
      ) ?? 0;

    const activityCount =
      safeInteger(
        counts.activities ?? counts.activity_count,
      ) ?? 0;

    const pairCount =
      safeInteger(counts.pairs ?? counts.pair_count) ?? 0;

    const resultCount =
      safeInteger(counts.finalDisplayedResultCount) ??
      safeInteger(performance.result_count) ??
      restaurantCount + activityCount + pairCount;

    const mlIntent = classifySearchIntent(
      rawQuery || normalizedQuery || "",
    );

    const inferredSearchMode = resolvedInferredSearchMode(
      args,
      mlIntent.inferredSearchMode,
    );
    const wantsPairing =
      safeBool(pairingPreference.requiresPairing) ??
      intentBool(args, "wantsPairing") ??
      inferredSearchMode === "mixed";
    const mixedWithoutPair = wantsPairing === true && pairCount === 0;
    const mixedPartial =
      mixedWithoutPair && (restaurantCount > 0 || activityCount > 0);
    const noPairsReason =
      safeText(args.noPairsReason, 250) ??
      (mixedWithoutPair ? "no_compatible_pair" : null);

    const cleanedMetadata = cleanMetadata(
      {
        ...(args.metadata ?? {}),

        primary_intent:
          args.metadata?.primary_intent ??
          args.metadata?.primaryIntent ??
          mlIntent.primaryIntent,

        secondary_intents:
          args.metadata?.secondary_intents ??
          args.metadata?.secondaryIntents ??
          mlIntent.secondaryIntents,

        all_intents:
          args.metadata?.all_intents ??
          args.metadata?.allIntents ??
          mlIntent.allIntents,

        intent_confidence:
          safeNumber(
            args.metadata?.intent_confidence ??
              args.metadata?.intentConfidence,
          ) ?? mlIntent.confidence,

        searchType:
          safeText(args.searchType, 100) ??
          safeText(args.metadata?.searchType, 100),

        primaryDomain:
          safeText(args.primaryDomain, 100) ??
          safeText(args.metadata?.primaryDomain, 100),

        wantsPairing,
        needsRestaurant: intentBool(args, "needsRestaurant"),
        needsActivity: intentBool(args, "needsActivity"),

        inferred_search_mode: inferredSearchMode,
        requestFulfilled:
          mixedWithoutPair ? false : args.metadata?.requestFulfilled,
        partialResults:
          mixedPartial ? true : args.metadata?.partialResults,
        no_pairs_reason: noPairsReason,
      },
      restaurantCount,
      activityCount,
    );

    const row = {
      source: safeText(args.source, 100) ?? "search",
      route: safeText(args.route ?? performance.route, 200),
      environment:
        safeText(args.environment, 50) ??
        process.env.NODE_ENV ??
        "production",

      search_query: rawQuery ?? normalizedQuery,
      raw_query: rawQuery,
      normalized_query: normalizedQuery,

      search_type: safeText(args.searchType, 100),
      primary_domain: safeText(args.primaryDomain, 100),
      intent_parser_source: safeText(
        args.intentParserSource,
        150,
      ),

      user_id: safeUuid(args.userId),
      anonymous_id: safeText(args.anonymousId, 150),
      session_id: safeText(args.sessionId, 150),

      beta_tester_id: safeUuid(args.betaTesterId),
      beta_assignment_id: safeUuid(args.betaAssignmentId),

      default_market_id: safeText(
        geo.defaultMarketId ?? geo.default_market_id,
        100,
      ),
      city: safeText(geo.city, 120),
      state: safeText(geo.state, 50),
      borough: safeText(geo.borough, 120),
      neighborhood: safeText(geo.neighborhood, 120),
      latitude: safeNumber(geo.latitude),
      longitude: safeNumber(geo.longitude),
      radius_miles: safeNumber(
        geo.radiusMiles ?? geo.radius_miles,
      ),

      outing_date: normalizeDate(args.outingDate),
      outing_time: normalizeTime(args.outingTime),
      outing_datetime: normalizeDateTime(args.outingDateTime),
      outing_time_label: safeText(args.outingTimeLabel, 100),

      restaurant_count: restaurantCount,
      activity_count: activityCount,
      pair_count: pairCount,
      result_count: resultCount,

      pair_candidates_evaluated: safeInteger(
        counts.pairCandidatesEvaluated,
      ),
      valid_pair_count_before_render: safeInteger(
        counts.validPairCountBeforeRender,
      ),

      wants_pairing: wantsPairing,
      needs_restaurant: intentBool(args, "needsRestaurant"),
      needs_activity: intentBool(args, "needsActivity"),

      distance_mode: safeText(
        pairingPreference.distanceMode,
        80,
      ),
      max_pair_distance_miles: safeNumber(
        pairingPreference.maxPairDistanceMiles,
      ),
      max_pair_walking_minutes: safeNumber(
        pairingPreference.maxPairWalkingMinutes,
      ),

      timing_ms: safeInteger(
        performance.total_ms ?? performance.timing_ms,
      ),
      llm_ms: safeInteger(performance.llm_ms),
      rpc_ms: safeInteger(performance.rpc_ms),
      pairing_ms: safeInteger(performance.pairing_ms),
      ranking_ms: safeInteger(performance.ranking_ms),

      speed_status: safeText(
        performance.speed_status ?? args.metadata?.speedStatus,
        80,
      ),

      success: mixedWithoutPair ? false : args.success !== false,
      had_issue: args.hadIssue === true || mixedWithoutPair,

      issue_type: safeText(args.issueType, 120),
      issue_label: safeText(args.issueLabel, 250),
      no_results_reason: safeText(args.noResultsReason, 250),
      no_pairs_reason: noPairsReason,

      metadata: cleanedMetadata,
    };

    const { error } = await supabaseAdmin
      .from("search_events")
      .insert(row);

    if (error) {
      console.error("[search-events] insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        raw_query: row.raw_query,
        source: row.source,
        route: row.route,
      });

      return {
        ok: false,
        error,
      };
    }

    console.info("[search-events] insert succeeded", {
      raw_query: row.raw_query,
      source: row.source,
      route: row.route,
    });

    return {
      ok: true,
    };
  } catch (error) {
    console.error("[search-events] insert crashed", {
      message:
        error instanceof Error
          ? error.message
          : String(error),
      source: args.source,
      raw_query: args.rawQuery,
    });

    return {
      ok: false,
      error,
    };
  }
}
