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
  durationMs: number;
  before: { restaurants: number; activities: number; pairs: number };
  recovered: { restaurants: number; activities: number; pairs: number };
  after: { restaurants: number; activities: number; pairs: number };
  radiusMiles: number | null;
  maxPairDistanceMiles: number | null;
  error: string | null;
};

type RunRecoverySearch = (args: {
  query: string;
  userLocation: UserSearchLocation | null;
  body: Record<string, any>;
}) => Promise<EnterpriseSearchResult>;

function count(result: EnterpriseSearchResult) {
  return {
    restaurants: Array.isArray(result.restaurants)
      ? result.restaurants.length
      : 0,
    activities: Array.isArray(result.activities)
      ? result.activities.length
      : 0,
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
    (a, b) =>
      Number((b as any).score ?? (b as any).pairScore ?? 0) -
      Number((a as any).score ?? (a as any).pairScore ?? 0),
  );
}

function selectedLocation(
  location: UserSearchLocation | null,
  radiusMiles: number,
): UserSearchLocation | null {
  if (!location) return null;
  return {
    ...location,
    radiusMiles: Math.max(Number(location.radiusMiles ?? 0), radiusMiles),
  };
}

function syncCounts(result: EnterpriseSearchResult) {
  const restaurants = result.restaurants.length;
  const activities = result.activities.length;
  const pairs = result.pairs.length;
  if (result.card_counts) {
    result.card_counts.restaurants = restaurants;
    result.card_counts.activities = activities;
    result.card_counts.pairs = pairs;
  }
  if (result.cardCounts) {
    result.cardCounts.restaurants = restaurants;
    result.cardCounts.activities = activities;
    result.cardCounts.pairs = pairs;
  }
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
  const needsRestaurant = Boolean(
    debug.needsRestaurant ?? debug.debugParity?.needsRestaurant,
  );
  const needsActivity = Boolean(
    debug.needsActivity ?? debug.debugParity?.needsActivity,
  );
  const wantsPairing = Boolean(
    debug.wantsPairing ?? debug.debugParity?.wantsPairing,
  );
  const minimumRestaurants = args.minimumRestaurants ?? 3;
  const minimumActivities = args.minimumActivities ?? 3;
  const restaurantWeak =
    needsRestaurant && before.restaurants < minimumRestaurants;
  const activityWeak = needsActivity && before.activities < minimumActivities;
  const pairPlan = planPairRecovery({
    restaurantCount: before.restaurants,
    activityCount: before.activities,
    pairCount: before.pairs,
    radiusMiles: args.userLocation?.radiusMiles ?? null,
    maxPairDistanceMiles: Number(
      debug.pairingPreference?.maxPairDistanceMiles ?? 0,
    ),
  });
  const pairWeak = wantsPairing && pairPlan.shouldRecover;

  if (!restaurantWeak && !activityWeak && !pairWeak) return result;

  const lane: RecoveryAttempt["lane"] =
    restaurantWeak && activityWeak
      ? "both"
      : restaurantWeak
        ? "restaurant"
        : activityWeak
          ? "activity"
          : pairPlan.lane ?? "both";
  const stage: RecoveryAttempt["stage"] =
    pairWeak && !restaurantWeak && !activityWeak
      ? "pair_recovery"
      : "post_filter_viability";
  const radiusMiles = Math.max(
    pairPlan.radiusMiles || 0,
    Number(args.userLocation?.radiusMiles ?? 0),
    12,
  );
  const startedAt = Date.now();
  let recovered: EnterpriseSearchResult | null = null;
  let error: string | null = null;

  try {
    recovered = await args.runRecoverySearch({
      query: args.query,
      userLocation: selectedLocation(args.userLocation, radiusMiles),
      body: {
        ...args.body,
        postFilterRecoveryPass: 2,
        postFilterRecoveryLane: lane,
        postFilterRecoveryReason: pairWeak
          ? pairPlan.reason
          : "required_lane_below_post_filter_viability_threshold",
        relaxedGeoRecovery: true,
        recoveryRadiusMiles: radiusMiles,
        recoveryMaxPairDistanceMiles: pairPlan.maxPairDistanceMiles || 3,
      },
    });
  } catch (recoveryError) {
    error =
      recoveryError instanceof Error
        ? recoveryError.message
        : String(recoveryError);
  }

  if (recovered) {
    result.restaurants = mergeRecoveredCandidates(
      result.restaurants,
      recovered.restaurants,
    );
    result.activities = mergeRecoveredCandidates(
      result.activities,
      recovered.activities,
    );
    result.pairs = mergePairs(result.pairs, recovered.pairs);
    (result as any).fallbackPairs = mergePairs(
      Array.isArray((result as any).fallbackPairs)
        ? (result as any).fallbackPairs
        : [],
      Array.isArray((recovered as any).fallbackPairs)
        ? (recovered as any).fallbackPairs
        : [],
    );
    syncCounts(result);
  }

  const after = count(result);
  const recoveredCounts = recovered
    ? count(recovered)
    : { restaurants: 0, activities: 0, pairs: 0 };
  const attempt: RecoveryAttempt = {
    stage,
    lane,
    reason: pairWeak
      ? pairPlan.reason ?? "valid_lanes_but_no_pair_after_primary_pairing"
      : "required_lane_below_post_filter_viability_threshold",
    durationMs: Date.now() - startedAt,
    before,
    recovered: recoveredCounts,
    after,
    radiusMiles,
    maxPairDistanceMiles: pairPlan.maxPairDistanceMiles || 3,
    error,
  };

  result.debug = {
    ...debug,
    postFilterRecoveryAttempted: true,
    postFilterRecoverySucceeded:
      Boolean(recovered) &&
      (after.restaurants > before.restaurants ||
        after.activities > before.activities ||
        after.pairs > before.pairs),
    postFilterRecoveryLane: lane,
    postFilterRecoveryStage: stage,
    postFilterRecoveryReason: attempt.reason,
    postFilterRecoveryBefore: before,
    postFilterRecoveryRecovered: recoveredCounts,
    postFilterRecoveryAfter: after,
    postFilterRecoveryMs: attempt.durationMs,
    recoveryAttempts: [
      ...(Array.isArray(debug.recoveryAttempts)
        ? debug.recoveryAttempts
        : []),
      attempt,
    ],
    orchestrationTiming: {
      ...(debug.orchestrationTiming ?? {}),
      postFilterRecoveryMs: attempt.durationMs,
      postFilterRecoveryStage: stage,
    },
  };

  return result;
}
