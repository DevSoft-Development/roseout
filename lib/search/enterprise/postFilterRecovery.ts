import type {
  EnterpriseLocation,
  EnterprisePair,
  EnterpriseSearchResult,
} from "./types";
import type { UserSearchLocation } from "./markets";
import { mergeRecoveredCandidates, planPairRecovery } from "./recoveryPolicy";

export type RecoveryAttempt = {
  stage: "post_filter_viability" | "pair_recovery";
  lane: "restaurant" | "activity" | "both";
  reason: string;
  rewrittenQuery: string;
  durationMs: number;
  before: { restaurants: number; activities: number; pairs: number };
  recovered: { restaurants: number; activities: number; pairs: number };
  after: { restaurants: number; activities: number; pairs: number };
  radiusMiles: number | null;
  maxPairDistanceMiles: number | null;
  centeredOn: "request" | "restaurant" | "activity";
  promotedRestaurantTypedActivities: number;
  error: string | null;
};

type RunRecoverySearch = (args: {
  query: string;
  userLocation: UserSearchLocation | null;
  body: Record<string, any>;
}) => Promise<EnterpriseSearchResult>;

function count(result: EnterpriseSearchResult) {
  return {
    restaurants: Array.isArray(result.restaurants) ? result.restaurants.length : 0,
    activities: Array.isArray(result.activities) ? result.activities.length : 0,
    pairs: Array.isArray(result.pairs) ? result.pairs.length : 0,
  };
}

function locationKey(row: EnterpriseLocation) {
  if (row?.id != null) return String(row.id);
  return [row?.name, row?.restaurant_name, row?.activity_name, row?.address]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function pairKey(pair: EnterprisePair) {
  return `${locationKey(pair.restaurant)}:${locationKey(pair.activity)}`;
}

function mergePairs(current: EnterprisePair[], recovered: EnterprisePair[]) {
  const rows = new Map<string, EnterprisePair>();
  for (const pair of [...recovered, ...current]) rows.set(pairKey(pair), pair);
  return Array.from(rows.values()).sort(
    (a, b) => Number((b as any).score ?? (b as any).pairScore ?? 0) - Number((a as any).score ?? (a as any).pairScore ?? 0),
  );
}

function locationText(row: EnterpriseLocation): string {
  return [
    row?.name,
    row?.restaurant_name,
    row?.activity_name,
    row?.activity_type,
    row?.primary_category,
    row?.description,
    ...(Array.isArray(row?.tags) ? row.tags : []),
    ...(Array.isArray(row?.semantic_tags) ? row.semantic_tags : []),
    ...(Array.isArray(row?.search_keywords) ? row.search_keywords : []),
    row?.search_document,
    row?.semantic_search_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function strongCrossDomainActivity(row: EnterpriseLocation, query: string): boolean {
  const text = locationText(row);
  const normalized = query.toLowerCase();
  if (/knicks|sports?\s*(bar|lounge|viewing)|watch\s+(the\s+)?game|basketball/.test(normalized)) {
    return /sports?\s*bar|sports?\s*lounge|watch\s*party|game\s*day|live\s*sports|big\s*screen|tvs?|pub|tavern|bar\s*and\s*grill/.test(text);
  }
  if (/karaoke/.test(normalized)) {
    return /karaoke|private\s*karaoke|sing\s*along/.test(text);
  }
  if (/hookah|shisha/.test(normalized)) {
    return /hookah|shisha/.test(text);
  }
  return false;
}

function rewriteRecoveryQuery(query: string, lane: RecoveryAttempt["lane"]): string {
  const normalized = query.toLowerCase();
  if (/karaoke/.test(normalized)) return "karaoke bar private karaoke karaoke lounge";
  if (/knicks|watch\s+(the\s+)?game|sports?\s*bar|basketball/.test(normalized)) {
    return "sports bar pub tavern bar with TVs live sports watch party";
  }
  if (/hookah|shisha/.test(normalized)) return "hookah lounge hookah bar shisha lounge";
  if (/relaxed|relaxing|chill|casual activity|low key/.test(normalized)) {
    return "relaxed activity bowling billiards mini golf art gallery museum scenic park board games";
  }
  if (lane === "restaurant") {
    return query.replace(/\b(and|with|after|nearby)\b[\s\S]*$/i, "").trim() || query;
  }
  return query;
}

function coordinateLocation(
  row: EnterpriseLocation | undefined,
  fallback: UserSearchLocation | null,
  radiusMiles: number,
): UserSearchLocation | null {
  const latitude = Number(row?.latitude);
  const longitude = Number(row?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      latitude,
      longitude,
      radiusMiles,
      state: row?.state ?? fallback?.state ?? null,
      label: row?.name ?? row?.restaurant_name ?? row?.activity_name ?? fallback?.label ?? "Recovery center",
    };
  }
  if (!fallback) return null;
  return { ...fallback, radiusMiles: Math.max(Number(fallback.radiusMiles ?? 0), radiusMiles) };
}

function syncCounts(result: EnterpriseSearchResult) {
  const restaurants = result.restaurants.length;
  const activities = result.activities.length;
  const pairs = result.pairs.length;
  const matched = Array.isArray((result as any).matched_locations)
    ? (result as any).matched_locations.length
    : Array.isArray((result as any).matchedLocations)
      ? (result as any).matchedLocations.length
      : restaurants + activities;

  if (result.card_counts) {
    result.card_counts.restaurants = restaurants;
    result.card_counts.activities = activities;
    result.card_counts.pairs = pairs;
    result.card_counts.matched_locations = matched;
  }
  if (result.cardCounts) {
    result.cardCounts.restaurants = restaurants;
    result.cardCounts.activities = activities;
    result.cardCounts.pairs = pairs;
    result.cardCounts.matched_locations = matched;
  }
  if ((result as any).debug?.performance) {
    (result as any).debug.performance.result_count = restaurants + activities;
  }
  (result as any).result_count = restaurants + activities;
  if (pairs > 0) {
    (result as any).primaryResultType = "pairs";
    (result as any).renderMode = "pairs";
    (result as any).render_mode = "pairs";
    (result as any).no_pairs_reason = null;
  }
  result.success = restaurants + activities + pairs > 0;
}

export async function recoverPostFilterSearchResult(args: {
  result: EnterpriseSearchResult;
  query: string;
  userLocation: UserSearchLocation | null;
  body: Record<string, any>;
  runRecoverySearch: RunRecoverySearch;
  minimumRestaurants?: number;
  minimumActivities?: number;
}): Promise<EnterpriseSearchResult> {
  if (args.body?.postFilterRecoveryPass) return args.result;

  const result = args.result;
  const before = count(result);
  const debug = (result.debug ?? {}) as Record<string, any>;
  const needsRestaurant = Boolean(debug.needsRestaurant ?? debug.debugParity?.needsRestaurant);
  const needsActivity = Boolean(debug.needsActivity ?? debug.debugParity?.needsActivity);
  const wantsPairing = Boolean(debug.wantsPairing ?? debug.debugParity?.wantsPairing);
  const minimumRestaurants = args.minimumRestaurants ?? 3;
  const minimumActivities = args.minimumActivities ?? 3;
  const restaurantWeak = needsRestaurant && before.restaurants < minimumRestaurants;
  const activityWeak = needsActivity && before.activities < minimumActivities;
  const pairPlan = planPairRecovery({
    restaurantCount: before.restaurants,
    activityCount: before.activities,
    pairCount: before.pairs,
    radiusMiles: args.userLocation?.radiusMiles ?? null,
    maxPairDistanceMiles: Number(debug.pairingPreference?.maxPairDistanceMiles ?? 0),
  });
  const pairWeak = wantsPairing && pairPlan.shouldRecover;

  if (!restaurantWeak && !activityWeak && !pairWeak) return result;

  const lane: RecoveryAttempt["lane"] = restaurantWeak && activityWeak
    ? "both"
    : restaurantWeak
      ? "restaurant"
      : activityWeak
        ? "activity"
        : pairPlan.lane ?? "both";
  const stage: RecoveryAttempt["stage"] = pairWeak && !restaurantWeak && !activityWeak
    ? "pair_recovery"
    : "post_filter_viability";
  const radiusMiles = Math.max(pairPlan.radiusMiles || 0, Number(args.userLocation?.radiusMiles ?? 0), 12);
  const rewrittenQuery = rewriteRecoveryQuery(args.query, lane);
  const centerRow = pairWeak
    ? lane === "restaurant"
      ? result.activities[0]
      : lane === "activity"
        ? result.restaurants[0]
        : result.activities[0] ?? result.restaurants[0]
    : undefined;
  const centeredOn: RecoveryAttempt["centeredOn"] = centerRow
    ? lane === "restaurant"
      ? "activity"
      : "restaurant"
    : "request";
  const recoveryLocation = coordinateLocation(centerRow, args.userLocation, radiusMiles);
  const startedAt = Date.now();
  let recovered: EnterpriseSearchResult | null = null;
  let error: string | null = null;
  let promotedRestaurantTypedActivities = 0;

  try {
    recovered = await args.runRecoverySearch({
      query: rewrittenQuery,
      userLocation: recoveryLocation,
      body: {
        ...args.body,
        query: rewrittenQuery,
        input: rewrittenQuery,
        message: rewrittenQuery,
        postFilterRecoveryPass: 2,
        postFilterRecoveryLane: lane,
        postFilterRecoveryReason: pairWeak
          ? pairPlan.reason
          : "required_lane_below_post_filter_viability_threshold",
        recoveryOriginalQuery: args.query,
        relaxedGeoRecovery: true,
        relaxedCandidateEligibility: true,
        allowRestaurantTypedActivityRecovery: lane === "activity" || lane === "both",
        recoveryRadiusMiles: radiusMiles,
        recoveryMaxPairDistanceMiles: pairPlan.maxPairDistanceMiles || 3,
      },
    });
  } catch (recoveryError) {
    error = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
  }

  if (recovered) {
    const promoted = (lane === "activity" || lane === "both")
      ? recovered.restaurants.filter((row) => strongCrossDomainActivity(row, args.query))
      : [];
    promotedRestaurantTypedActivities = promoted.length;
    const recoveredActivities = mergeRecoveredCandidates(recovered.activities, promoted);

    result.restaurants = mergeRecoveredCandidates(result.restaurants, recovered.restaurants);
    result.activities = mergeRecoveredCandidates(result.activities, recoveredActivities);
    result.pairs = mergePairs(result.pairs, recovered.pairs);
    (result as any).fallbackPairs = mergePairs(
      Array.isArray((result as any).fallbackPairs) ? (result as any).fallbackPairs : [],
      Array.isArray((recovered as any).fallbackPairs) ? (recovered as any).fallbackPairs : [],
    );
    syncCounts(result);
  }

  const after = count(result);
  const recoveredCounts = recovered ? count(recovered) : { restaurants: 0, activities: 0, pairs: 0 };
  const attempt: RecoveryAttempt = {
    stage,
    lane,
    reason: pairWeak
      ? pairPlan.reason ?? "valid_lanes_but_no_pair_after_primary_pairing"
      : "required_lane_below_post_filter_viability_threshold",
    rewrittenQuery,
    durationMs: Date.now() - startedAt,
    before,
    recovered: recoveredCounts,
    after,
    radiusMiles,
    maxPairDistanceMiles: pairPlan.maxPairDistanceMiles || 3,
    centeredOn,
    promotedRestaurantTypedActivities,
    error,
  };

  result.debug = {
    ...debug,
    postFilterRecoveryAttempted: true,
    postFilterRecoverySucceeded: Boolean(recovered) && (
      after.restaurants > before.restaurants ||
      after.activities > before.activities ||
      after.pairs > before.pairs
    ),
    postFilterRecoveryLane: lane,
    postFilterRecoveryStage: stage,
    postFilterRecoveryReason: attempt.reason,
    postFilterRecoveryRewrittenQuery: rewrittenQuery,
    postFilterRecoveryCenteredOn: centeredOn,
    postFilterRecoveryPromotedRestaurantTypedActivities: promotedRestaurantTypedActivities,
    postFilterRecoveryBefore: before,
    postFilterRecoveryRecovered: recoveredCounts,
    postFilterRecoveryAfter: after,
    postFilterRecoveryMs: attempt.durationMs,
    recoveryAttempts: [...(Array.isArray(debug.recoveryAttempts) ? debug.recoveryAttempts : []), attempt],
    orchestrationTiming: {
      ...(debug.orchestrationTiming ?? {}),
      postFilterRecoveryMs: attempt.durationMs,
      postFilterRecoveryStage: stage,
    },
  };

  syncCounts(result);
  return result;
}
