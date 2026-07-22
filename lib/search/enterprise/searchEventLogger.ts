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

function safeText(value: unknown, max = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeNumber(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function safeBool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function intentBool(
  args: SearchEventLoggerArgs,
  key: "wantsPairing" | "needsRestaurant" | "needsActivity",
) {
  const direct = safeBool(args[key]);
  if (direct != null) return direct;
  const metadataValue = safeBool(args.metadata?.[key]);
  if (metadataValue != null) return metadataValue;
  const normalizedValue = safeBool(args.metadata?.normalizedIntent?.[key]);
  if (normalizedValue != null) return normalizedValue;
  const renderMode = args.metadata?.render_mode ?? args.metadata?.renderMode;
  if (renderMode === "mixed_pairs") return true;
  return null;
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null;
}

function cleanMetadata(metadata: JsonRecord | null | undefined) {
  const next = { ...(metadata ?? {}) };

  delete next.email;
  delete next.phone;
  delete next.phoneNumber;
  delete next.address;
  delete next.fullAddress;
  delete next.name;
  delete next.fullName;

  return next;
}

function resolvedInferredSearchMode(
  args: SearchEventLoggerArgs,
  fallback: string,
) {
  const meta = args.metadata ?? {};
  const normalizedIntent = meta.normalizedIntent ?? {};
  const sameVenuePreferred =
    safeBool(normalizedIntent.sameVenuePreferred) ??
    safeBool(meta.sameVenuePreferred) ??
    safeBool(meta.debugParity?.sameVenuePreferred);
  const needsActivity =
    intentBool(args, "needsActivity") ??
    safeBool(normalizedIntent.needsActivity);
  const searchType =
    safeText(args.searchType, 100) ??
    safeText(meta.searchType, 100) ??
    safeText(normalizedIntent.searchType, 100);

  if (sameVenuePreferred === true && needsActivity === false) {
    return searchType === "same_location_combo"
      ? "same_location_combo"
      : "restaurant";
  }
  if (searchType === "same_location_combo") return "same_location_combo";
  if (searchType === "restaurant_only") return "restaurant";
  if (searchType === "activity_only") return "activity";
  if (searchType === "mixed_outing" || searchType === "paired_outing")
    return "mixed";
  if (searchType === "restaurant") return "restaurant";
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

    const restaurantCount =
      safeNumber(counts.restaurants ?? counts.restaurant_count) ?? 0;
    const activityCount =
      safeNumber(counts.activities ?? counts.activity_count) ?? 0;
    const pairCount = safeNumber(counts.pairs ?? counts.pair_count) ?? 0;

    const resultCount =
      safeNumber(counts.finalDisplayedResultCount) ??
      safeNumber(performance.result_count) ??
      restaurantCount + activityCount + pairCount;

    const mlIntent = classifySearchIntent(
      args.rawQuery || args.normalizedQuery || "",
    );
    const inferredSearchMode = resolvedInferredSearchMode(
      args,
      mlIntent.inferredSearchMode,
    );

    const row = {
      source: safeText(args.source, 100) ?? "search",
      route: safeText(args.route ?? performance.route, 200),
      environment:
        safeText(args.environment, 50) ?? process.env.NODE_ENV ?? "production",

      raw_query: safeText(args.rawQuery, 1000),
      normalized_query: safeText(args.normalizedQuery, 1000),

      search_type: safeText(args.searchType, 100),
      primary_domain: safeText(args.primaryDomain, 100),
      intent_parser_source: safeText(args.intentParserSource, 150),

      user_id: safeText(args.userId, 80),
      anonymous_id: safeText(args.anonymousId, 150),
      session_id: safeText(args.sessionId, 150),

      beta_tester_id: safeText(args.betaTesterId, 80),
      beta_assignment_id: safeText(args.betaAssignmentId, 80),

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
      radius_miles: safeNumber(geo.radiusMiles ?? geo.radius_miles),

      outing_date: normalizeDate(args.outingDate),
      outing_time: normalizeTime(args.outingTime),
      outing_datetime: safeText(args.outingDateTime, 100),
      outing_time_label: safeText(args.outingTimeLabel, 100),

      restaurant_count: restaurantCount,
      activity_count: activityCount,
      pair_count: pairCount,
      result_count: resultCount,
      pair_candidates_evaluated: safeNumber(counts.pairCandidatesEvaluated),
      valid_pair_count_before_render: safeNumber(
        counts.validPairCountBeforeRender,
      ),

      wants_pairing:
        safeBool(pairingPreference.requiresPairing) ??
        intentBool(args, "wantsPairing"),
      needs_restaurant: intentBool(args, "needsRestaurant"),
      needs_activity: intentBool(args, "needsActivity"),
      distance_mode: safeText(pairingPreference.distanceMode, 80),
      max_pair_distance_miles: safeNumber(
        pairingPreference.maxPairDistanceMiles,
      ),
      max_pair_walking_minutes: safeNumber(
        pairingPreference.maxPairWalkingMinutes,
      ),

      timing_ms: safeNumber(performance.total_ms ?? performance.timing_ms),
      llm_ms: safeNumber(performance.llm_ms),
      rpc_ms: safeNumber(performance.rpc_ms),
      pairing_ms: safeNumber(performance.pairing_ms),
      ranking_ms: safeNumber(performance.ranking_ms),
      speed_status: safeText(
        performance.speed_status ?? args.metadata?.speedStatus,
        80,
      ),

      success: args.success !== false,
      had_issue: args.hadIssue === true,
      issue_type: safeText(args.issueType, 120),
      issue_label: safeText(args.issueLabel, 250),
      no_results_reason: safeText(args.noResultsReason, 250),
      no_pairs_reason: safeText(args.noPairsReason, 250),

      metadata: cleanMetadata({
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
            args.metadata?.intent_confidence ?? args.metadata?.intentConfidence,
          ) ?? mlIntent.confidence,
        searchType:
          safeText(args.searchType, 100) ??
          safeText(args.metadata?.searchType, 100),
        primaryDomain:
          safeText(args.primaryDomain, 100) ??
          safeText(args.metadata?.primaryDomain, 100),
        wantsPairing: intentBool(args, "wantsPairing"),
        needsRestaurant: intentBool(args, "needsRestaurant"),
        needsActivity: intentBool(args, "needsActivity"),
        inferred_search_mode: inferredSearchMode,
      }),
    };

    const { error } = await supabaseAdmin.from("search_events").insert(row);

    if (error) {
      console.warn("[search-events] insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        raw_query: row.raw_query,
        source: row.source,
      });
      return { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    console.warn("[search-events] insert failed", error);
    return { ok: false, error };
  }
}
