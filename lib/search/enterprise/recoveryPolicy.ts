import type { EnterpriseLocation, SearchIntent } from "./types";

export type RecoveryLane = "restaurant" | "activity";

export type ViabilitySnapshot = {
  rawCount: number;
  eligibleCount: number;
  rankedCount: number;
  displayedCount: number;
};

export type RecoveryDecision = {
  shouldRecover: boolean;
  reason: string | null;
  targetMinimum: number;
};

export type PairRecoveryPlan = {
  shouldRecover: boolean;
  lane: RecoveryLane | "both" | null;
  radiusMiles: number;
  maxPairDistanceMiles: number;
  reason: string | null;
};

const TARGET_VIABLE_CANDIDATES = 3;

export function decideLaneRecovery(
  snapshot: ViabilitySnapshot,
  hardeningReasons: string[],
  targetMinimum = TARGET_VIABLE_CANDIDATES,
): RecoveryDecision {
  if (!hardeningReasons.length) {
    return { shouldRecover: false, reason: null, targetMinimum };
  }

  const viableCount = Math.min(
    snapshot.eligibleCount,
    snapshot.rankedCount,
    snapshot.displayedCount,
  );

  if (viableCount >= targetMinimum) {
    return { shouldRecover: false, reason: null, targetMinimum };
  }

  return {
    shouldRecover: true,
    reason:
      viableCount === 0
        ? "post_filter_zero_viable_candidates"
        : "post_filter_candidate_count_below_threshold",
    targetMinimum,
  };
}

export function buildWidenedRecoveryIntent(
  intent: SearchIntent,
  options?: { radiusMiles?: number; relaxGeo?: boolean },
): SearchIntent {
  const requestedRadius = Number(intent.geo?.radiusMiles ?? 0);
  const widenedRadius = Math.max(
    requestedRadius,
    Number(options?.radiusMiles ?? 12),
  );

  return {
    ...intent,
    strictness: "low",
    geo: {
      ...intent.geo,
      radiusMiles: widenedRadius,
      geoStrictness: options?.relaxGeo === false
        ? intent.geo?.geoStrictness
        : "none",
    },
  };
}

export function mergeRecoveredCandidates(
  current: EnterpriseLocation[],
  recovered: EnterpriseLocation[],
): EnterpriseLocation[] {
  const rows = new Map<string, EnterpriseLocation>();
  for (const row of [...current, ...recovered]) {
    const id = row?.id == null ? "" : String(row.id);
    const fallbackKey = [
      row?.name,
      row?.restaurant_name,
      row?.activity_name,
      row?.address,
      row?.city,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
    rows.set(id || fallbackKey || JSON.stringify(row), row);
  }
  return Array.from(rows.values());
}

export function planPairRecovery(args: {
  restaurantCount: number;
  activityCount: number;
  pairCount: number;
  radiusMiles?: number | null;
  maxPairDistanceMiles?: number | null;
}): PairRecoveryPlan {
  if (args.pairCount > 0 || args.restaurantCount === 0 || args.activityCount === 0) {
    return {
      shouldRecover: false,
      lane: null,
      radiusMiles: Number(args.radiusMiles ?? 0),
      maxPairDistanceMiles: Number(args.maxPairDistanceMiles ?? 0),
      reason: null,
    };
  }

  const lane: PairRecoveryPlan["lane"] =
    args.restaurantCount < 3 && args.activityCount < 3
      ? "both"
      : args.restaurantCount < args.activityCount
        ? "restaurant"
        : "activity";

  return {
    shouldRecover: true,
    lane,
    radiusMiles: Math.max(Number(args.radiusMiles ?? 0), 12),
    maxPairDistanceMiles: Math.max(
      Number(args.maxPairDistanceMiles ?? 0),
      3,
    ),
    reason: "valid_lanes_but_no_pair_after_primary_pairing",
  };
}
