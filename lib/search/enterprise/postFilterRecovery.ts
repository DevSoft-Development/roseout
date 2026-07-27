import type {
  EnterpriseLocation,
  EnterprisePair,
  EnterpriseSearchResult,
  SearchIntent,
} from "./types";
import type { UserSearchLocation } from "./markets";
import { mergeRecoveredCandidates, planPairRecovery } from "./recoveryPolicy";
import {
  qualifyKaraokeCandidate,
  qualifyHookahCandidate,
  qualifyRelaxedActivity,
  qualifyRooftopCandidate,
  qualifySportsWatchCandidate,
} from "./activityQualification";
import { isAllowedLongIslandNearbyResult } from "./longIslandGeography";
import { createPairingDebug, createSearchPairs } from "./pairing";

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

function recoveryCenters(rows: EnterpriseLocation[]): EnterpriseLocation[] {
  const seen = new Set<string>();
  const centers: EnterpriseLocation[] = [];
  for (const row of rows) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const key = row.id != null
      ? `id:${row.id}`
      : Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `geo:${latitude.toFixed(4)}:${longitude.toFixed(4)}`
        : locationKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    centers.push(row);
    if (centers.length === 3) break;
  }
  return centers;
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

function isRooftopQuery(query: string) {
  return /\b(rooftop|roof\s*deck|roof\s*top|skyline|terrace)\b/i.test(query);
}

const isGardenCityQuery = (query: string) => /\bgarden city\b/i.test(query);
const isExplicitManhattanQuery = (query: string) => /\bmanhattan\b/i.test(query);
const inManhattan = (row: EnterpriseLocation) => {
  const borough = String(row.borough ?? "").toLowerCase();
  const city = String(row.city ?? "").toLowerCase();
  const county = String(row.county ?? "").toLowerCase();
  return borough === "manhattan" || county === "new york" || city === "new york";
};

function hasRooftopEvidence(row: EnterpriseLocation) {
  return qualifyRooftopCandidate(row).matches;
}

function strongCrossDomainActivity(row: EnterpriseLocation, query: string): boolean {
  const normalized = query.toLowerCase();
  if (/knicks|sports?\s*(bar|lounge|viewing)|watch\s+(the\s+)?game|basketball/.test(normalized)) {
    return qualifySportsWatchCandidate(row).matches;
  }
  if (/karaoke/.test(normalized)) {
    return qualifyKaraokeCandidate(row).matches;
  }
  if (/hookah|shisha/.test(normalized)) {
    return qualifyHookahCandidate(row).matches;
  }
  if (isRooftopQuery(normalized)) {
    return qualifyRooftopCandidate(row).matches;
  }
  if (/relaxed|relaxing|chill|low key|casual activity/.test(normalized))
    return qualifyRelaxedActivity(row).matches;
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
    return "sports bar live sports watch party game day TVs big screens sports lounge pub with TVs tavern showing games basketball watch bar";
  }
  if (/hookah|shisha/.test(normalized)) return "hookah lounge hookah bar shisha lounge";
  if (/relaxed|relaxing|chill|casual activity|low key/.test(normalized)) {
    return "bowling billiards pool hall mini golf museum art gallery park scenic walk board games paint and sip low-key live music";
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

function regeneratePairs(
  restaurants: EnterpriseLocation[],
  activities: EnterpriseLocation[],
  maxDistanceMiles: number,
  query: string,
  sourceIntent?: Partial<SearchIntent> | null,
): EnterprisePair[] {
  const intent: SearchIntent = {
    rawQuery: query, searchType: "paired_outing", primaryDomain: "mixed",
    needsRestaurant: true, needsActivity: true, wantsPairing: true,
    restaurantIntent: sourceIntent?.restaurantIntent ?? { mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    activityIntent: sourceIntent?.activityIntent ?? { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
    geo: sourceIntent?.geo ?? { aliases: [], geoStrictness: "strict" },
    vibe: sourceIntent?.vibe ?? [], strictness: sourceIntent?.strictness ?? "high",
    pairingPreference: {
      requiresPairing: true,
      distanceMode: sourceIntent?.pairingPreference?.distanceMode ?? "nearby",
      maxPairDistanceMiles: Math.max(sourceIntent?.pairingPreference?.maxPairDistanceMiles ?? 0, maxDistanceMiles),
      maxPairWalkingMinutes: sourceIntent?.pairingPreference?.maxPairWalkingMinutes ?? null,
      requireWalkablePair: sourceIntent?.pairingPreference?.requireWalkablePair ?? true,
    },
  };
  return createSearchPairs(restaurants, activities, intent, createPairingDebug())
    .map((pair) => ({ ...pair, recovery_generated: true } as EnterprisePair));
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
    : before.restaurants > 0 && before.activities === 0 && activityWeak
      ? "activity"
      : before.activities > 0 && before.restaurants === 0 && restaurantWeak
        ? "restaurant"
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
  const radiusMiles = isGardenCityQuery(args.query) ? 5 : Math.max(
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
  const centerRows = pairOnlyRecovery
    ? recoveryCenters(
        lane === "restaurant" ? result.activities
          : lane === "activity" ? result.restaurants
            : [...result.activities, ...result.restaurants],
      )
    : centerRow ? [centerRow] : [];
  const centeredOn: RecoveryAttempt["centeredOn"] = centerRow
    ? lane === "restaurant"
      ? "activity"
      : "restaurant"
    : "request";
  const requestRecoveryLocation = isGardenCityQuery(args.query) && !args.userLocation
    ? { latitude: 40.7268, longitude: -73.6343, radiusMiles: 5, state: "NY", label: "Garden City" }
    : args.userLocation;
  const recoveryLocation = coordinateLocation(
    centerRow,
    requestRecoveryLocation,
    radiusMiles,
  );
  const startedAt = Date.now();
  let recovered: EnterpriseSearchResult | null = null;
  let error: string | null = null;
  let promotedRestaurantTypedActivities = 0;
  let regeneratedPairCount = 0;

  const runLane = (
    recoveryQuery: string,
    recoveryLane: RecoveryAttempt["lane"],
    laneLocation: UserSearchLocation | null = recoveryLocation,
  ) =>
    args.runRecoverySearch({
      query: recoveryQuery,
      userLocation: laneLocation,
      body: {
        ...args.body,
        query: recoveryQuery,
        input: recoveryQuery,
        message: recoveryQuery,
        postFilterRecoveryPass: 2,
        postFilterRecoveryLane: recoveryLane,
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
        recoveryBorough: isExplicitManhattanQuery(args.query) ? "Manhattan" : null,
        recoveryCity: isGardenCityQuery(args.query) ? "Garden City" : null,
      },
    });

  try {
    if (sameVenuePairFallback) {
      const [restaurantLane, activityLane] = await Promise.all([
        runLane("steakhouse steak restaurant dinner", "restaurant"),
        runLane("rooftop bar roof deck skyline terrace city views", "activity"),
      ]);
      recovered = {
        ...restaurantLane,
        restaurants: restaurantLane.restaurants,
        activities: [...activityLane.activities, ...activityLane.restaurants],
        pairs: [],
      };
    } else if (pairOnlyRecovery && centerRows.length > 0) {
      let aggregate: EnterpriseSearchResult | null = null;
      for (const center of centerRows) {
        const centeredLocation = coordinateLocation(center, requestRecoveryLocation, radiusMiles);
        const pass = await runLane(rewrittenQuery, lane, centeredLocation);
        if (aggregate === null) {
          aggregate = pass;
        } else {
          const currentAggregate: EnterpriseSearchResult = aggregate;
          aggregate = {
            ...currentAggregate,
            restaurants: mergeRecoveredCandidates(
              currentAggregate.restaurants ?? [],
              pass.restaurants ?? [],
            ),
            activities: mergeRecoveredCandidates(
              currentAggregate.activities ?? [],
              pass.activities ?? [],
            ),
            pairs: mergePairs(
              currentAggregate.pairs ?? [],
              pass.pairs ?? [],
            ),
          };
        }

        const currentAggregate: EnterpriseSearchResult = aggregate;
        const provisionalRestaurants = mergeRecoveredCandidates(
          result.restaurants ?? [],
          currentAggregate.restaurants ?? [],
        );
        const provisionalActivities = mergeRecoveredCandidates(
          result.activities ?? [],
          currentAggregate.activities ?? [],
        );
        const provisionalPairs = createSearchPairs(
          provisionalRestaurants,
          provisionalActivities,
          {
            rawQuery: args.query, searchType: "paired_outing", primaryDomain: "mixed",
            needsRestaurant: true, needsActivity: true, wantsPairing: true,
            restaurantIntent: { mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
            activityIntent: { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
            geo: { aliases: [], geoStrictness: "strict" }, vibe: [], strictness: "high",
            pairingPreference: { requiresPairing: true, distanceMode: "nearby", maxPairDistanceMiles, maxPairWalkingMinutes: null, requireWalkablePair: true },
          },
        );
        if (provisionalPairs.length >= (result.activities.length <= 1 ? 1 : 3)) {
          debug.recoveryStoppedEarly = true;
          debug.recoveryStoppedReason = "valid_pair_target_reached";
          break;
        }
      }
      recovered = aggregate;
      debug.recoveryCenters = centerRows.map((row) => row.name ?? row.restaurant_name ?? row.activity_name ?? row.id);
      debug.recoveryCenterCount = centerRows.length;
    } else {
      recovered = await runLane(rewrittenQuery, lane);
    }
  } catch (recoveryError) {
    error =
      recoveryError instanceof Error
        ? recoveryError.message
        : String(recoveryError);
  }

  if (recovered) {
    if (isExplicitManhattanQuery(args.query)) {
      const rejected = recovered.restaurants.filter((row) => !inManhattan(row)).length +
        recovered.activities.filter((row) => !inManhattan(row)).length;
      recovered.restaurants = recovered.restaurants.filter(inManhattan);
      recovered.activities = recovered.activities.filter(inManhattan);
      debug.rooftopRecoveryRejectedOutOfBoroughCount = rejected;
    }
    if (sameVenuePairFallback) {
      debug.rooftopRecoveryRestaurantCount = recovered.restaurants.length;
      debug.rooftopRecoveryActivityCount = recovered.activities.length;
      const qualified = recovered.activities.filter(hasRooftopEvidence);
      debug.rooftopRecoveryQualifiedActivityCount = qualified.length;
      debug.rooftopRecoveryRejectedGenericCount = recovered.activities.length - qualified.length;
      recovered.activities = qualified;
    }
    if (isGardenCityQuery(args.query) && recoveryLocation) {
      const latitude = Number(recoveryLocation.latitude);
      const longitude = Number(recoveryLocation.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const geo = {
          latitude,
          longitude,
          radiusMiles: 5,
          city: "Garden City",
          county: "Nassau",
          state: "NY",
          market: "Long Island",
        };
        const originalRestaurants = recovered.restaurants;
        recovered.restaurants = originalRestaurants.filter((row) =>
          isAllowedLongIslandNearbyResult(row, geo));
        debug.gardenCityExactRestaurantCount = recovered.restaurants.filter((row) =>
          String(row.city ?? "").toLowerCase() === "garden city").length;
        debug.gardenCityNearbyNassauRestaurantCount = recovered.restaurants.length - debug.gardenCityExactRestaurantCount;
        debug.gardenCityRestaurantRecoveryCount = recovered.restaurants.length;
        debug.gardenCityOutOfRadiusRejectedCount = originalRestaurants.length - recovered.restaurants.length;
      } else {
        debug.gardenCityGeoFilterSkipped = "missing_recovery_coordinates";
      }
    }
    const promoted =
      lane === "activity" || lane === "both"
        ? recovered.restaurants.filter((row) =>
            strongCrossDomainActivity(row, args.query),
          ).map((row) => ({
            ...row,
            result_role: "activity",
            public_activity_role: /knicks|watch\s+(?:the\s+)?game|sports/i.test(args.query)
              ? "sports_watch"
              : /karaoke/i.test(args.query) ? "karaoke"
                : /hookah|shisha/i.test(args.query) ? "hookah"
                  : isRooftopQuery(args.query) ? "rooftop" : "activity",
            source_location_type: row.location_type ?? null,
            cross_domain_promoted: true,
          } as EnterpriseLocation))
        : [];
    promotedRestaurantTypedActivities = promoted.length;
    const recoveredActivities = mergeRecoveredCandidates(
      recovered.activities,
      promoted,
    );

    result.restaurants = mergeRecoveredCandidates(
      result.restaurants,
      lane === "activity" ? [] : recovered.restaurants,
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
      args.query,
      debug.normalizedIntent,
    );
    regeneratedPairCount = regenerated.length;
    result.pairs = mergePairs(result.pairs, regenerated);
  }

  if (sameVenuePairFallback && result.pairs.length > 0) {
    (result as any).fallbackMode = "nearby_pair_after_strict_same_venue_rooftop_miss";
    (result as any).sameLocationRequired = false;
    (result as any).pairedFallbackUsed = true;
    (result as any).fallbackPairsUsedAsPrimary = true;
    debug.rooftopRecoveryPairCount = result.pairs.length;
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
    pairRegenerationAttempted: wantsPairing && before.pairs === 0,
    pairRegenerationCount: regeneratedPairCount,
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
