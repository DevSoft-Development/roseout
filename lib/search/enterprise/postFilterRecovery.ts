import type {
  EnterpriseLocation,
  EnterprisePair,
  EnterpriseSearchResult,
} from "./types";
import type { UserSearchLocation } from "./markets";
import { mergeRecoveredCandidates, planPairRecovery } from "./recoveryPolicy";

export type RecoveryAttempt = {
  stage: "post_filter_viability" | "pair_recovery" | "same_venue_pair_fallback";
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
  regeneratedPairCount: number;
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
    (a, b) =>
      Number((b as any).score ?? (b as any).pairScore ?? 0) -
      Number((a as any).score ?? (a as any).pairScore ?? 0),
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

function isRooftopQuery(query: string) {
  return /\b(rooftop|roof\s*deck|roof\s*top|skyline|terrace)\b/i.test(query);
}

function hasRooftopEvidence(row: EnterpriseLocation) {
  return /\b(rooftop|roof\s*deck|roof\s*top|skyline\s*(view|views)?|terrace\s*(bar|dining|restaurant)?|city\s*view|city\s*views)\b/.test(
    locationText(row),
  );
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
  if (isRooftopQuery(normalized)) {
    return hasRooftopEvidence(row);
  }
  return false;
}

function rewriteRecoveryQuery(
  query: string,
  lane: RecoveryAttempt["lane"],
  sameVenuePairFallback: boolean,
): string {
  const normalized = query.toLowerCase();
  if (sameVenuePairFallback) {
    const food = /steak/.test(normalized) ? "steakhouse restaurant" : "restaurant";
    return `${food} and rooftop bar nearby`;
  }
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
      label:
        row?.name ??
        row?.restaurant_name ??
        row?.activity_name ??
        fallback?.label ??
        "Recovery center",
    };
  }
  if (!fallback) return null;
  return {
    ...fallback,
    radiusMiles: Math.max(Number(fallback.radiusMiles ?? 0), radiusMiles),
  };
}

function milesBetween(a: EnterpriseLocation, b: EnterpriseLocation) {
  const lat1 = Number(a?.latitude);
  const lon1 = Number(a?.longitude);
  const lat2 = Number(b?.latitude);
  const lon2 = Number(b?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function regeneratePairs(
  restaurants: EnterpriseLocation[],
  activities: EnterpriseLocation[],
  maxDistanceMiles: number,
  limit = 3,
): EnterprisePair[] {
  const candidates: EnterprisePair[] = [];
  for (const restaurant of restaurants) {
    for (const activity of activities) {
      if (locationKey(restaurant) === locationKey(activity)) continue;
      const distance = milesBetween(restaurant, activity);
      if (distance == null || distance > maxDistanceMiles) continue;
      const quality =
        Number((restaurant as any).quality_score ?? (restaurant as any).theouthaven_score ?? 0) +
        Number((activity as any).quality_score ?? (activity as any).theouthaven_score ?? 0);
      const score = Math.max(0, 100 - distance * 20) + quality * 0.1;
      candidates.push({
        restaurant,
        activity,
        pair_distance_miles: Number(distance.toFixed(2)),
        distance_miles: Number(distance.toFixed(2)),
        pair_walking_minutes: Math.round(distance * 20),
        walking_minutes: Math.round(distance * 20),
        pairScore: score,
        score,
        recovery_generated: true,
      } as any);
    }
  }
  return candidates
    .sort(
      (a, b) =>
        Number((b as any).pairScore ?? 0) - Number((a as any).pairScore ?? 0),
    )
    .slice(0, limit);
}

function synchronizePublicResult(result: EnterpriseSearchResult) {
  const restaurants = result.restaurants ?? [];
  const activities = result.activities ?? [];
  const pairs = result.pairs ?? [];
  const cards = pairs.length > 0 ? pairs : restaurants.length > 0 ? restaurants : activities;
  const matched = restaurants.length > 0 ? restaurants : activities;
  const resultCount = restaurants.length + activities.length;
  const primaryResultType = pairs.length > 0
    ? "pairs"
    : restaurants.length > 0 && activities.length > 0
      ? "partial_mixed"
      : restaurants.length > 0
        ? "restaurant_cards"
        : activities.length > 0
          ? "activity_cards"
          : "empty";
  const renderMode = pairs.length > 0
    ? "pairs"
    : primaryResultType === "partial_mixed"
      ? "partial_mixed"
      : primaryResultType;

  result.restaurants = restaurants;
  result.activities = activities;
  result.pairs = pairs;
  (result as any).cards = cards;
  (result as any).matched_locations = matched;
  (result as any).matchedLocations = matched;
  (result as any).restaurantCount = restaurants.length;
  (result as any).activityCount = activities.length;
  (result as any).cardCount = cards.length;
  (result as any).result_count = resultCount;
  (result as any).primaryResultType = primaryResultType;
  (result as any).renderMode = renderMode;
  (result as any).render_mode = renderMode;
  (result as any).status = resultCount + pairs.length > 0 ? "success" : "empty";
  (result as any).counts = {
    ...((result as any).counts ?? {}),
    restaurants: restaurants.length,
    activities: activities.length,
    pairs: pairs.length,
    cards: cards.length,
  };
  result.card_counts = {
    ...(result.card_counts ?? {}),
    restaurants: restaurants.length,
    activities: activities.length,
    pairs: pairs.length,
    matched_locations: matched.length,
  } as any;
  if (result.cardCounts) {
    result.cardCounts = {
      ...result.cardCounts,
      restaurants: restaurants.length,
      activities: activities.length,
      pairs: pairs.length,
      matched_locations: matched.length,
    } as any;
  }
  if (pairs.length > 0) {
    (result as any).no_pairs_reason = null;
    (result as any).noPairsReason = null;
  }
  result.success = resultCount + pairs.length > 0;

  const debug = ((result as any).debug ?? {}) as Record<string, any>;
  const performance = {
    ...(debug.performance ?? {}),
    result_count: resultCount,
    restaurant_count: restaurants.length,
    activity_count: activities.length,
    pair_count: pairs.length,
    primaryResultType,
  };
  const debugParity = {
    ...(debug.debugParity ?? {}),
    restaurantCount: restaurants.length,
    activityCount: activities.length,
    pairCount: pairs.length,
    resultCount,
    finalDisplayedResultCount: cards.length,
    resultCounts: {
      restaurants: restaurants.length,
      activities: activities.length,
      pairs: pairs.length,
      cards: cards.length,
    },
  };
  (result as any).debug = {
    ...debug,
    performance,
    debugParity,
    restaurantCount: restaurants.length,
    activityCount: activities.length,
    pair_count: pairs.length,
    finalDisplayedResultCount: cards.length,
  };
  if ((result as any).searchPerformance) {
    (result as any).searchPerformance = {
      ...(result as any).searchPerformance,
      resultCount,
    };
  }
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
  const rooftopRequested = isRooftopQuery(args.query);
  const sameVenueRequested = Boolean(
    (result.debug as any)?.sameLocationRequired ??
      (result.debug as any)?.normalizedIntent?.sameLocationRequired,
  );
  if (rooftopRequested && sameVenueRequested) {
    result.restaurants = (result.restaurants ?? []).filter(hasRooftopEvidence);
  }

  const before = count(result);
  const debug = (result.debug ?? {}) as Record<string, any>;
  const needsRestaurant = Boolean(
    debug.needsRestaurant ?? debug.debugParity?.needsRestaurant,
  );
  const needsActivity = Boolean(
    debug.needsActivity ?? debug.debugParity?.needsActivity,
  );
  const originalWantsPairing = Boolean(
    debug.wantsPairing ?? debug.debugParity?.wantsPairing,
  );
  const sameVenuePairFallback =
    rooftopRequested && sameVenueRequested && before.restaurants === 0;
  const wantsPairing = originalWantsPairing || sameVenuePairFallback;
  const minimumRestaurants = args.minimumRestaurants ?? 3;
  const minimumActivities = args.minimumActivities ?? 3;
  const restaurantWeak = needsRestaurant && before.restaurants < minimumRestaurants;
  const activityWeak =
    (needsActivity || sameVenuePairFallback) &&
    before.activities < minimumActivities;
  const pairPlan = planPairRecovery({
    restaurantCount: before.restaurants,
    activityCount: before.activities,
    pairCount: before.pairs,
    radiusMiles: args.userLocation?.radiusMiles ?? null,
    maxPairDistanceMiles: Number(
      debug.pairingPreference?.maxPairDistanceMiles ?? 0,
    ),
  });
  const pairOnlyRecovery =
    wantsPairing &&
    before.restaurants > 0 &&
    before.activities > 0 &&
    before.pairs === 0;
  const pairWeak = pairOnlyRecovery || pairPlan.shouldRecover || sameVenuePairFallback;

  if (!restaurantWeak && !activityWeak && !pairWeak) {
    synchronizePublicResult(result);
    return result;
  }

  const lane: RecoveryAttempt["lane"] = sameVenuePairFallback
    ? "both"
    : restaurantWeak && activityWeak
      ? "both"
      : restaurantWeak
        ? "restaurant"
        : activityWeak
          ? "activity"
          : pairPlan.lane ?? "both";
  const stage: RecoveryAttempt["stage"] = sameVenuePairFallback
    ? "same_venue_pair_fallback"
    : pairOnlyRecovery
      ? "pair_recovery"
      : "post_filter_viability";
  const maxPairDistanceMiles = Math.max(
    Number(pairPlan.maxPairDistanceMiles ?? 0),
    Number(args.body?.recoveryMaxPairDistanceMiles ?? 0),
    3,
  );
  const radiusMiles = Math.max(
    pairPlan.radiusMiles || 0,
    Number(args.userLocation?.radiusMiles ?? 0),
    12,
  );
  const rewrittenQuery = rewriteRecoveryQuery(
    args.query,
    lane,
    sameVenuePairFallback,
  );
  const centerRow = pairOnlyRecovery
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
  const recoveryLocation = coordinateLocation(
    centerRow,
    args.userLocation,
    radiusMiles,
  );
  const startedAt = Date.now();
  let recovered: EnterpriseSearchResult | null = null;
  let error: string | null = null;
  let promotedRestaurantTypedActivities = 0;
  let regeneratedPairCount = 0;

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
        postFilterRecoveryReason: sameVenuePairFallback
          ? "strict_same_venue_rooftop_zero_results"
          : pairWeak
            ? pairPlan.reason ?? "valid_lanes_but_no_pair_after_primary_pairing"
            : "required_lane_below_post_filter_viability_threshold",
        recoveryOriginalQuery: args.query,
        relaxedGeoRecovery: true,
        relaxedCandidateEligibility: true,
        allowRestaurantTypedActivityRecovery:
          lane === "activity" || lane === "both",
        forcePairingRecovery: pairWeak,
        sameVenueFallbackToNearbyPair: sameVenuePairFallback,
        recoveryRadiusMiles: radiusMiles,
        recoveryMaxPairDistanceMiles: maxPairDistanceMiles,
      },
    });
  } catch (recoveryError) {
    error =
      recoveryError instanceof Error
        ? recoveryError.message
        : String(recoveryError);
  }

  if (recovered) {
    const promoted =
      lane === "activity" || lane === "both"
        ? recovered.restaurants.filter((row) =>
            strongCrossDomainActivity(row, args.query),
          )
        : [];
    promotedRestaurantTypedActivities = promoted.length;
    const recoveredActivities = mergeRecoveredCandidates(
      recovered.activities,
      promoted,
    );

    result.restaurants = mergeRecoveredCandidates(
      result.restaurants,
      recovered.restaurants,
    );
    result.activities = mergeRecoveredCandidates(
      result.activities,
      recoveredActivities,
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
  }

  if (
    wantsPairing &&
    result.pairs.length === 0 &&
    result.restaurants.length > 0 &&
    result.activities.length > 0
  ) {
    const regenerated = regeneratePairs(
      result.restaurants,
      result.activities,
      maxPairDistanceMiles,
    );
    regeneratedPairCount = regenerated.length;
    result.pairs = mergePairs(result.pairs, regenerated);
  }

  if (sameVenuePairFallback && result.pairs.length > 0) {
    (result as any).fallbackMode = "nearby_pair_after_strict_same_venue_rooftop_miss";
    (result as any).sameLocationRequired = false;
    (result as any).pairedFallbackUsed = true;
    (result as any).fallbackPairsUsedAsPrimary = true;
  }

  const after = count(result);
  const recoveredCounts = recovered
    ? count(recovered)
    : { restaurants: 0, activities: 0, pairs: 0 };
  const attempt: RecoveryAttempt = {
    stage,
    lane,
    reason: sameVenuePairFallback
      ? "strict_same_venue_rooftop_zero_results"
      : pairWeak
        ? pairPlan.reason ?? "valid_lanes_but_no_pair_after_primary_pairing"
        : "required_lane_below_post_filter_viability_threshold",
    rewrittenQuery,
    durationMs: Date.now() - startedAt,
    before,
    recovered: recoveredCounts,
    after,
    radiusMiles,
    maxPairDistanceMiles,
    centeredOn,
    promotedRestaurantTypedActivities,
    regeneratedPairCount,
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
    postFilterRecoveryRewrittenQuery: rewrittenQuery,
    postFilterRecoveryCenteredOn: centeredOn,
    postFilterRecoveryPromotedRestaurantTypedActivities:
      promotedRestaurantTypedActivities,
    postFilterRecoveryRegeneratedPairCount: regeneratedPairCount,
    postFilterRecoveryBefore: before,
    postFilterRecoveryRecovered: recoveredCounts,
    postFilterRecoveryAfter: after,
    postFilterRecoveryMs: attempt.durationMs,
    sameVenueFallbackToNearbyPairAttempted: sameVenuePairFallback,
    sameVenueFallbackToNearbyPairUsed:
      sameVenuePairFallback && result.pairs.length > 0,
    recoveryAttempts: [
      ...(Array.isArray(debug.recoveryAttempts) ? debug.recoveryAttempts : []),
      attempt,
    ],
    orchestrationTiming: {
      ...(debug.orchestrationTiming ?? {}),
      postFilterRecoveryMs: attempt.durationMs,
      postFilterRecoveryStage: stage,
    },
  };

  synchronizePublicResult(result);
  return result;
}
