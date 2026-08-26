type PublicPayload = Record<string, any>;

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: any): string {
  return [
    value?.name,
    value?.restaurant_name,
    value?.activity_name,
    value?.activity_type,
    value?.primary_category,
    value?.description,
    ...list(value?.tags),
    ...list(value?.semantic_tags),
    ...list(value?.search_keywords),
    value?.search_document,
    value?.semantic_search_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rooftopEvidence(value: any): boolean {
  return /\b(rooftop|roof\s*deck|roof\s*top|skyline\s*(view|views)?|terrace\s*(bar|dining|restaurant)?|city\s*view|city\s*views)\b/.test(
    text(value),
  );
}

function locationKey(value: any): string {
  return String(
    value?.id ??
      value?.source_id ??
      value?.google_place_id ??
      [value?.name, value?.restaurant_name, value?.activity_name, value?.address]
        .filter(Boolean)
        .join("|"),
  ).toLowerCase();
}

function milesBetween(a: any, b: any): number | null {
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

function requestedGeo(payload: PublicPayload) {
  const geo =
    payload?.debug?.normalizedIntent?.geo ??
    payload?.debug?.geo ??
    payload?.debugParity?.geo ??
    null;
  return {
    borough: typeof geo?.borough === "string" ? geo.borough.toLowerCase() : null,
    city: typeof geo?.city === "string" ? geo.city.toLowerCase() : null,
    state: typeof geo?.state === "string" ? geo.state.toLowerCase() : null,
    explicit: Boolean(geo?.explicitMarketRequested ?? payload?.debug?.explicitMarketRequested),
  };
}

function matchesRequestedGeo(value: any, geo: ReturnType<typeof requestedGeo>): boolean {
  if (!geo.explicit) return true;
  if (geo.borough && String(value?.borough ?? "").toLowerCase() !== geo.borough) return false;
  if (!geo.borough && geo.city && String(value?.city ?? "").toLowerCase() !== geo.city) return false;
  if (geo.state && String(value?.state ?? "").toLowerCase() !== geo.state) return false;
  return true;
}

function pairActivity(pair: any) {
  return pair?.activity ?? pair?.activity_location ?? pair?.activityLocation ?? null;
}

function pairRestaurant(pair: any) {
  return pair?.restaurant ?? pair?.restaurant_location ?? pair?.restaurantLocation ?? null;
}

function sameVenuePair(pair: any) {
  const restaurant = pairRestaurant(pair);
  const activity = pairActivity(pair);
  return Boolean(restaurant && activity && locationKey(restaurant) === locationKey(activity));
}

function hardSameVenueRequested(payload: PublicPayload) {
  const plan =
    payload?.searchV2?.searchPlan ??
    payload?.searchPlan ??
    payload?.debug?.searchPlan ??
    payload?.debug?.normalizedIntent ??
    {};
  const mode = String(
    payload?.searchV2?.resolvedMode ??
      payload?.searchV2?.requestedMode ??
      payload?.resolvedMode ??
      payload?.requestedMode ??
      plan?.mode ??
      "",
  );
  const relationship = String(
    plan?.relationship?.type ??
      payload?.debug?.nlp?.relationship?.type ??
      payload?.debug?.normalizedIntent?.relationship?.type ??
      "",
  );
  return mode === "same_venue" || plan?.pairing?.sameVenueRequired === true || relationship === "same_venue_required";
}

function upstreamRequestFulfilled(payload: PublicPayload): boolean | null {
  if (typeof payload?.requestFulfilled === "boolean") return payload.requestFulfilled;
  if (typeof payload?.searchV2?.requestFulfilled === "boolean") return payload.searchV2.requestFulfilled;
  if (typeof payload?.debug?.requestFulfilled === "boolean") return payload.debug.requestFulfilled;
  return null;
}

function generatePairs(restaurants: any[], activities: any[], maxMiles: number, rooftopOnly: boolean) {
  const generated: any[] = [];
  for (const restaurant of restaurants) {
    for (const activity of activities) {
      if (locationKey(restaurant) === locationKey(activity)) continue;
      if (rooftopOnly && !rooftopEvidence(activity)) continue;
      const distance = milesBetween(restaurant, activity);
      if (distance == null || distance > maxMiles) continue;
      const score = Math.max(0, 100 - distance * 20);
      generated.push({
        restaurant,
        activity,
        pair_distance_miles: Number(distance.toFixed(2)),
        distance_miles: Number(distance.toFixed(2)),
        pair_walking_minutes: Math.round(distance * 20),
        walking_minutes: Math.round(distance * 20),
        pairScore: score,
        score,
        recovery_generated: true,
        final_serializer_generated: true,
      });
    }
  }
  return generated
    .sort((a, b) => Number(b.pairScore ?? 0) - Number(a.pairScore ?? 0))
    .slice(0, 3);
}

export function finalizePublicSearchPayload<T extends PublicPayload>(input: T): T {
  const payload = { ...input } as PublicPayload;
  const candidateRestaurants = list(payload.restaurants);
  const candidateActivities = list(payload.activities);
  const geo = requestedGeo(payload);
  const rooftopFallback = Boolean(
    payload?.debug?.sameVenueFallbackToNearbyPairAttempted ||
      payload?.fallbackMode === "nearby_pair_after_strict_same_venue_rooftop_miss",
  );
  const hardSameVenue = hardSameVenueRequested(payload);

  const restaurants = candidateRestaurants.filter((row) => matchesRequestedGeo(row, geo));
  const activities = candidateActivities.filter(
    (row) => matchesRequestedGeo(row, geo) && (!rooftopFallback || rooftopEvidence(row)),
  );

  const existingPairs = list(payload.pairs).filter((pair) => {
    const restaurant = pairRestaurant(pair);
    const activity = pairActivity(pair);
    if (!restaurant || !activity) return false;
    if (!matchesRequestedGeo(restaurant, geo) || !matchesRequestedGeo(activity, geo)) return false;
    if (rooftopFallback && !rooftopEvidence(activity)) return false;
    if (hardSameVenue && !sameVenuePair(pair)) return false;
    return true;
  });

  const shouldPair = Boolean(
    payload?.debug?.wantsPairing ??
      payload?.debug?.debugParity?.wantsPairing ??
      rooftopFallback,
  );
  const regenerated =
    shouldPair && !hardSameVenue && existingPairs.length === 0 && restaurants.length > 0 && activities.length > 0
      ? generatePairs(restaurants, activities, rooftopFallback ? 1.5 : 3, rooftopFallback)
      : [];
  const pairs = existingPairs.length > 0 ? existingPairs : regenerated;
  const restaurantCards = restaurants;
  const activityCards = activities;
  const cards = [...pairs, ...restaurantCards, ...activityCards];
  const status = cards.length > 0 ? "success" : "empty";
  const priorFulfilled = upstreamRequestFulfilled(payload);
  const requestFulfilled = priorFulfilled ?? (cards.length > 0);
  const partialResults = !requestFulfilled && cards.length > 0;
  const primaryResultType =
    requestFulfilled && pairs.length > 0 && restaurantCards.length > 0 && activityCards.length > 0
      ? "mixed_results"
      : requestFulfilled && pairs.length > 0
        ? "pairs"
        : restaurantCards.length > 0 && activityCards.length > 0
          ? "partial_mixed"
          : restaurantCards.length > 0
            ? "restaurant_cards"
            : activityCards.length > 0
              ? "activity_cards"
              : "empty";

  const candidateCounts = {
    restaurants: Number(payload?.debug?.postFilterRecoveryAfter?.restaurants ?? candidateRestaurants.length),
    activities: Number(payload?.debug?.postFilterRecoveryAfter?.activities ?? candidateActivities.length),
  };
  const displayedCounts = {
    restaurantCards: restaurantCards.length,
    activityCards: activityCards.length,
    pairs: pairs.length,
    cards: cards.length,
  };

  payload.restaurants = restaurantCards;
  payload.activities = activityCards;
  payload.pairs = pairs;
  payload.cards = cards;
  payload.matched_locations = [...restaurantCards, ...activityCards];
  payload.matchedLocations = payload.matched_locations;
  payload.restaurantCount = restaurantCards.length;
  payload.activityCount = activityCards.length;
  payload.cardCount = cards.length;
  payload.result_count = cards.length;
  payload.primaryResultType = primaryResultType;
  payload.renderMode = primaryResultType === "empty" ? "empty" : primaryResultType;
  payload.render_mode = payload.renderMode;
  payload.status = status;
  payload.requestFulfilled = requestFulfilled;
  payload.partialResults = partialResults;
  payload.success = status === "success" && requestFulfilled;
  payload.counts = {
    ...(payload.counts ?? {}),
    restaurants: restaurantCards.length,
    activities: activityCards.length,
    pairs: pairs.length,
    cards: cards.length,
    candidateRestaurants: candidateCounts.restaurants,
    candidateActivities: candidateCounts.activities,
    displayedRestaurantCards: displayedCounts.restaurantCards,
    displayedActivityCards: displayedCounts.activityCards,
    displayedPairs: displayedCounts.pairs,
  };
  payload.card_counts = {
    ...(payload.card_counts ?? {}),
    restaurants: restaurantCards.length,
    activities: activityCards.length,
    pairs: pairs.length,
    matched_locations: payload.matched_locations.length,
  };
  payload.cardCounts = { ...payload.card_counts };
  if (pairs.length > 0) {
    payload.no_pairs_reason = null;
    payload.noPairsReason = null;
  } else if (hardSameVenue) {
    payload.no_pairs_reason = payload.no_pairs_reason ?? "no_strong_same_venue_match";
    payload.noPairsReason = payload.noPairsReason ?? payload.no_pairs_reason;
  }
  payload.debug = {
    ...(payload.debug ?? {}),
    finalPublicSerializerApplied: true,
    finalPublicCandidateCounts: candidateCounts,
    finalPublicDisplayedCounts: displayedCounts,
    finalPublicRegeneratedPairCount: regenerated.length,
    finalPublicHardSameVenue: hardSameVenue,
    finalPublicRooftopActivityEvidenceRequired: rooftopFallback,
    finalPublicRequestedGeoPreserved: geo.explicit,
    performance: {
      ...(payload?.debug?.performance ?? {}),
      result_count: cards.length,
      restaurant_count: restaurantCards.length,
      activity_count: activityCards.length,
      pair_count: pairs.length,
      primaryResultType,
    },
    debugParity: {
      ...(payload?.debug?.debugParity ?? {}),
      restaurantCount: restaurantCards.length,
      activityCount: activityCards.length,
      pairCount: pairs.length,
      resultCount: cards.length,
      finalDisplayedResultCount: cards.length,
      resultCounts: {
        restaurants: restaurantCards.length,
        activities: activityCards.length,
        pairs: pairs.length,
        cards: cards.length,
      },
    },
  };
  payload.debugParity = {
    ...(payload.debugParity ?? {}),
    restaurantCount: restaurantCards.length,
    activityCount: activityCards.length,
    pairCount: pairs.length,
    resultCount: cards.length,
    finalDisplayedResultCount: cards.length,
    resultCounts: {
      restaurants: restaurantCards.length,
      activities: activityCards.length,
      pairs: pairs.length,
      cards: cards.length,
    },
  };
  if (payload.searchPerformance) {
    payload.searchPerformance = {
      ...payload.searchPerformance,
      resultCount: cards.length,
    };
  }
  return payload as T;
}
