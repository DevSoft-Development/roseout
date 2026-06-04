import type { EnterpriseLocation, EnterprisePair, GeoIntent, PairDistanceMode, PairingPreference, SearchIntent } from "./types";
import { estimateWalkingMinutes, estimateWalkingMinutesFromMiles, getPairDistanceMiles, getRawWalkingMinutes, getSafeWalkingMinutes, isWalkablePair, normalizeWalkingMinutes, shouldRejectPairForWalkingRoute } from "./distance";
import { scoreGeoMatch } from "./geo-taxonomy";

const titleCase = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
const sameText = (a: unknown, b: unknown) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());

export type PairingDebug = {
  pairCandidatesEvaluated: number;
  pairsRejectedForDistance: number;
  pairsRejectedForMissingCoordinates: number;
  pairsRejectedForWalkingMinutes: number;
  extremeWalkingRoutesRejected: number;
  invalidWalkingRoutesHiddenFromDisplay: number;
  walkingMinutesEstimatedFromMiles: number;
  pairsWithGoogleWalkingMinutes: number;
  pairsMissingGoogleWalkingMinutes: number;
  validPairCountBeforeRender: number;
  walkablePairsFound: number;
  rejectedPairs: Array<{
    restaurantId: EnterpriseLocation["id"];
    restaurantName?: string | null;
    activityId: EnterpriseLocation["id"];
    activityName?: string | null;
    reason: string | null;
    pairDistanceMiles: number | null;
    walkingDurationMinutes?: number | null;
  }>;
};
export function createPairingDebug(): PairingDebug { return { pairCandidatesEvaluated: 0, pairsRejectedForDistance: 0, pairsRejectedForMissingCoordinates: 0, pairsRejectedForWalkingMinutes: 0, extremeWalkingRoutesRejected: 0, invalidWalkingRoutesHiddenFromDisplay: 0, walkingMinutesEstimatedFromMiles: 0, pairsWithGoogleWalkingMinutes: 0, pairsMissingGoogleWalkingMinutes: 0, validPairCountBeforeRender: 0, walkablePairsFound: 0, rejectedPairs: [] }; }

function pairPreference(intent: SearchIntent): PairingPreference { return intent.pairingPreference ?? { requiresPairing: intent.wantsPairing, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }; }
function distanceBonus(distanceMiles: number | null, mode: PairDistanceMode) { if (distanceMiles == null) return 0; if (distanceMiles <= 0.25) return 50; if (distanceMiles <= 0.5) return 40; if (distanceMiles <= 0.75) return 30; if (distanceMiles <= 1.5 && (mode === "walking" || mode === "nearby")) return 15; if (distanceMiles <= 3 && mode === "same_area") return 5; return 0; }
export function buildPairDistanceLabel(distanceMiles: number | null) { if (distanceMiles == null) return "Distance unavailable"; if (distanceMiles <= 0.25) return "About a 5-minute walk"; if (distanceMiles <= 0.5) return "About a 10-minute walk"; if (distanceMiles <= 0.75) return "About a 15-minute walk"; if (distanceMiles <= 1.5) return "About a 30-minute walk"; return "Not walking distance"; }
export function scorePair(pair: Pick<EnterprisePair, "restaurant" | "activity" | "distance_miles" | "pairDistanceMiles">, intent: SearchIntent) { const pref = pairPreference(intent); let score = Number(pair.restaurant.match_score ?? 0) + Number(pair.activity.match_score ?? 0) + scoreGeoMatch(pair.restaurant, intent.geo) + scoreGeoMatch(pair.activity, intent.geo); if (sameText(pair.restaurant.neighborhood, pair.activity.neighborhood)) score += 120; else if (sameText(pair.restaurant.borough, pair.activity.borough)) score += 80; else if (sameText(pair.restaurant.city, pair.activity.city)) score += 50; score += distanceBonus(pair.pairDistanceMiles ?? pair.distance_miles, pref.distanceMode); return score; }
export function buildPairTitle(_pair: Pick<EnterprisePair, "restaurant" | "activity">, intent: SearchIntent) { const food = intent.restaurantIntent.foodTerms.find((t) => !["restaurant", "dining"].includes(t)) ?? intent.restaurantIntent.cuisineTerms[0] ?? intent.restaurantIntent.mealTerms[0] ?? "Dinner"; const act = intent.activityIntent.activityTerms.find((t) => !["activity", "things to do"].includes(t)) ?? "Activity"; return `${titleCase(food)} + ${titleCase(act)} Night`; }
export function buildPairExplanation(pair: Pick<EnterprisePair, "restaurant" | "activity" | "pairDistanceMiles" | "pairWalkingMinutes" | "pairDistanceLabel" | "isWalkable">, intent: SearchIntent) { const geo = intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? "your area"; if (pair.isWalkable && pair.pairWalkingMinutes != null) return `This pair is walkable: the restaurant and activity are about a ${pair.pairWalkingMinutes}-minute walk apart.`; if (pair.isWalkable) return `Both spots are in ${geo} and close enough for a no-driving date night.`; const distance = pair.pairDistanceMiles != null ? `, about ${pair.pairDistanceMiles} miles apart` : ""; return `This works because both options fit ${geo}${distance}, and match your restaurant + activity request.`; }

export function normalizeGeoText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function hasFiniteCoordinate(value: unknown) {
  return Number.isFinite(Number(value));
}

export function getPairCityState(pair: Partial<EnterprisePair> & { restaurantResult?: EnterpriseLocation; activityResult?: EnterpriseLocation }) {
  const restaurant = pair.restaurant || pair.restaurantResult || {} as EnterpriseLocation;
  const activity = pair.activity || pair.activityResult || {} as EnterpriseLocation;
  const restaurantCity = normalizeGeoText(restaurant.city);
  const activityCity = normalizeGeoText(activity.city);
  const restaurantState = normalizeGeoText(restaurant.state);
  const activityState = normalizeGeoText(activity.state);

  return {
    restaurant,
    activity,
    restaurantCity,
    activityCity,
    restaurantState,
    activityState,
    samePairCity: Boolean(restaurantCity && activityCity && restaurantCity === activityCity),
    samePairState: Boolean(restaurantState && activityState && restaurantState === activityState),
    hasBothCoords: Boolean(hasFiniteCoordinate(restaurant.latitude) && hasFiniteCoordinate(restaurant.longitude) && hasFiniteCoordinate(activity.latitude) && hasFiniteCoordinate(activity.longitude)),
  };
}

export function getPairGeoPriority(pair: Partial<EnterprisePair> & { restaurantResult?: EnterpriseLocation; activityResult?: EnterpriseLocation }, searchGeo?: Partial<GeoIntent> | null) {
  const { restaurant, activity, restaurantCity, activityCity, restaurantState, activityState, samePairCity, samePairState, hasBothCoords } = getPairCityState(pair);
  const searchCity = normalizeGeoText(searchGeo?.city);
  const searchState = normalizeGeoText(searchGeo?.state);
  const searchBorough = normalizeGeoText(searchGeo?.borough);
  const searchNeighborhood = normalizeGeoText(searchGeo?.neighborhood);
  const restaurantBorough = normalizeGeoText(restaurant.borough);
  const activityBorough = normalizeGeoText(activity.borough);
  const restaurantNeighborhood = normalizeGeoText(restaurant.neighborhood);
  const activityNeighborhood = normalizeGeoText(activity.neighborhood);
  const matchesSearchNeighborhood = Boolean(searchNeighborhood && restaurantNeighborhood === searchNeighborhood && activityNeighborhood === searchNeighborhood);
  const matchesSearchBorough = Boolean(searchBorough && restaurantBorough === searchBorough && activityBorough === searchBorough);
  const matchesSearchCity = Boolean(searchCity && restaurantCity === searchCity && activityCity === searchCity);
  const matchesSearchState = Boolean(searchState && restaurantState === searchState && activityState === searchState);

  if (!hasBothCoords) return 5;
  if (matchesSearchNeighborhood || matchesSearchBorough || matchesSearchCity || (samePairCity && samePairState)) return 0;
  if (matchesSearchState) return 1;
  if (samePairState) return 2;
  if (!samePairState) return 3;
  return 4;
}

export function getPairDistanceValue(pair: Partial<EnterprisePair>) {
  const value = Number(pair.pairDistanceMiles ?? pair.distance_miles ?? (pair as any).distanceMiles ?? (pair as any).distance_miles);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function getPairCombinedScore(pair: Partial<EnterprisePair>) {
  return Number((pair as any).combinedScore ?? pair.score ?? (pair as any).rankingScore ?? 0);
}

export function getPairReviewStrength(pair: Partial<EnterprisePair>) {
  return Number(pair.restaurant?.review_count ?? (pair.restaurant as any)?.reviewCount ?? 0) + Number(pair.activity?.review_count ?? (pair.activity as any)?.reviewCount ?? 0);
}

export function pairHasPhotos(pair: Partial<EnterprisePair>) {
  return Boolean(
    (pair.restaurant as any)?.photo_url ||
      (pair.restaurant as any)?.image_url ||
      (pair.restaurant as any)?.primary_photo_url ||
      (pair.activity as any)?.photo_url ||
      (pair.activity as any)?.image_url ||
      (pair.activity as any)?.primary_photo_url,
  );
}

export function getPairStableName(pair: Partial<EnterprisePair>) {
  return `${pair.restaurant?.name || pair.restaurant?.restaurant_name || ""} ${pair.activity?.name || pair.activity?.activity_name || ""}`.trim();
}

export function sortMixedPairs<T extends EnterprisePair>(pairs: T[], geo?: Partial<GeoIntent> | null) {
  return pairs.sort((a, b) => {
    const aGeoPriority = getPairGeoPriority(a, geo);
    const bGeoPriority = getPairGeoPriority(b, geo);
    if (aGeoPriority !== bGeoPriority) return aGeoPriority - bGeoPriority;

    const aDistance = getPairDistanceValue(a);
    const bDistance = getPairDistanceValue(b);
    if (aDistance !== bDistance) return aDistance - bDistance;

    const aWalkMinutes = getSafeWalkingMinutes(a);
    const bWalkMinutes = getSafeWalkingMinutes(b);
    if (aWalkMinutes != null && bWalkMinutes != null && aWalkMinutes !== bWalkMinutes) {
      return aWalkMinutes - bWalkMinutes;
    }

    const aScore = getPairCombinedScore(a);
    const bScore = getPairCombinedScore(b);
    if (aScore !== bScore) return bScore - aScore;

    const aReviewStrength = getPairReviewStrength(a);
    const bReviewStrength = getPairReviewStrength(b);
    if (aReviewStrength !== bReviewStrength) return bReviewStrength - aReviewStrength;

    const aPhotos = pairHasPhotos(a) ? 1 : 0;
    const bPhotos = pairHasPhotos(b) ? 1 : 0;
    if (aPhotos !== bPhotos) return bPhotos - aPhotos;

    return getPairStableName(a).localeCompare(getPairStableName(b));
  });
}

function shouldKeepMissingCoordinatePair(pref: PairingPreference, missingCoordinatePairsKept: number, validPairsWithinMax: number) {
  if (!pref.requireWalkablePair) return true;
  if (pref.distanceMode !== "walking" && pref.distanceMode !== "short_walk") return false;
  return validPairsWithinMax < 3 && missingCoordinatePairsKept < Math.max(0, 3 - validPairsWithinMax);
}

function rejectedPairDebug(restaurant: EnterpriseLocation, activity: EnterpriseLocation, pairDistanceMiles: number | null, reason: string | null) {
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || restaurant.restaurant_name || null,
    activityId: activity.id,
    activityName: activity.name || activity.activity_name || null,
    pairDistanceMiles,
    walkingDurationMinutes: getRawWalkingMinutes({ restaurant, activity }),
    reason,
  };
}

export function createSearchPairs(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], intent: SearchIntent, debug: PairingDebug = createPairingDebug()) {
  const pref = pairPreference(intent);
  const candidates: EnterprisePair[] = [];
  let validPairsWithinMax = 0;

  for (const restaurant of restaurants.slice(0, 12)) for (const activity of activities.slice(0, 12)) {
    const pairDistanceMiles = getPairDistanceMiles(restaurant, activity);
    const maxDistance = pref.maxPairDistanceMiles;
    if (pairDistanceMiles != null && maxDistance != null && Number.isFinite(Number(pairDistanceMiles)) && Number(pairDistanceMiles) <= Number(maxDistance)) validPairsWithinMax += 1;
  }

  let missingCoordinatePairsKept = 0;

  for (const restaurant of restaurants.slice(0, 12)) for (const activity of activities.slice(0, 12)) {
    debug.pairCandidatesEvaluated += 1;
    const walkability = isWalkablePair(restaurant, activity, pref);
    const pairDistanceMiles = walkability.pairDistanceMiles;
    const pairSeed = { restaurant, activity, pairDistanceMiles, distance_miles: pairDistanceMiles };
    const rawWalkingMinutes = getRawWalkingMinutes(pairSeed);
    const safeRouteWalkingMinutes = normalizeWalkingMinutes(rawWalkingMinutes);
    const estimatedWalkingMinutes = estimateWalkingMinutesFromMiles(pairDistanceMiles);
    const safeWalkingMinutes = getSafeWalkingMinutes(pairSeed);
    const pairWalkingMinutes = safeWalkingMinutes ?? walkability.pairWalkingMinutes ?? (pairDistanceMiles == null ? null : estimateWalkingMinutes(pairDistanceMiles));
    const missingCoordinates = walkability.warnings.includes("missing_coordinates");
    const maxDistance = pref.maxPairDistanceMiles;
    const rejectedByMiles =
      maxDistance != null &&
      Number.isFinite(Number(pairDistanceMiles)) &&
      Number(pairDistanceMiles) > Number(maxDistance);

    if (rawWalkingMinutes != null) {
      debug.pairsWithGoogleWalkingMinutes += 1;
    } else {
      debug.pairsMissingGoogleWalkingMinutes += 1;
    }

    if (rawWalkingMinutes != null && safeRouteWalkingMinutes == null) {
      debug.invalidWalkingRoutesHiddenFromDisplay += 1;
    }

    const walkingRouteDecision = shouldRejectPairForWalkingRoute(pairSeed, pref);

    if (walkingRouteDecision.reject) {
      debug.pairsRejectedForWalkingMinutes += 1;
      if (walkingRouteDecision.reason === "extreme_walking_route_duration") {
        debug.extremeWalkingRoutesRejected += 1;
      }
      debug.rejectedPairs.push(rejectedPairDebug(restaurant, activity, pairDistanceMiles, walkingRouteDecision.reason));
      continue;
    }

    if (missingCoordinates && !shouldKeepMissingCoordinatePair(pref, missingCoordinatePairsKept, validPairsWithinMax)) {
      debug.pairsRejectedForMissingCoordinates += 1;
      debug.rejectedPairs.push(rejectedPairDebug(restaurant, activity, pairDistanceMiles, "missing_coordinates"));
      continue;
    }

    if (rejectedByMiles) {
      debug.pairsRejectedForDistance += 1;
      debug.rejectedPairs.push(rejectedPairDebug(restaurant, activity, pairDistanceMiles, "pair_distance_exceeds_requested_max"));
      continue;
    }

    const isWalkable = !missingCoordinates && (safeWalkingMinutes != null
      ? true
      : pairDistanceMiles != null && (pref.maxPairDistanceMiles == null ? pairDistanceMiles <= 1.5 : pairDistanceMiles <= pref.maxPairDistanceMiles));
    if (walkability.isWalkable && !missingCoordinates) debug.walkablePairsFound += 1;
    const pairWarnings = missingCoordinates && pref.requireWalkablePair ? [...walkability.warnings, "missing_coordinates_walkability_unverified"] : walkability.warnings;
    if (missingCoordinates) missingCoordinatePairsKept += 1;
    if (safeRouteWalkingMinutes == null && estimatedWalkingMinutes != null) {
      debug.walkingMinutesEstimatedFromMiles += 1;
    }
    const pair: EnterprisePair = {
      restaurant,
      activity,
      distance_miles: pairDistanceMiles,
      pairDistanceMiles,
      pairWalkingMinutes,
      pairDistanceLabel: buildPairDistanceLabel(pairDistanceMiles),
      pairWarnings,
      isWalkable,
      title: "",
      explanation: "",
      pairExplanation: "",
      score: 0,
      pairScore: 0,
    };
    (pair as any).walkingDurationMinutes = rawWalkingMinutes;
    (pair as any).googleWalkingDurationMinutes = rawWalkingMinutes;
    pair.title = buildPairTitle(pair, intent);
    pair.explanation = buildPairExplanation(pair, intent);
    pair.pairExplanation = pair.explanation;
    pair.score = scorePair(pair, intent);
    pair.pairScore = pair.score;
    candidates.push(pair);
  }

  debug.validPairCountBeforeRender = candidates.length;
  return sortMixedPairs(candidates, intent.geo).slice(0, 8);
}

export { getPairDistanceMiles };
