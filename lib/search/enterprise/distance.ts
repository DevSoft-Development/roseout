import type {
  EnterpriseLocation,
  EnterprisePair,
  GeoIntent,
  PairDistanceMode,
} from "./types";

export const WALKING_MINUTES_PER_MILE = 20;
export const MAX_WALKING_DISTANCE_MINUTES = 60;
export const DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES = 3;

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const num = (v: unknown) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim()
      ? Number(v)
      : null;
const sameText = (a: unknown, b: unknown) =>
  Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
const finitePositive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function getLocationDistanceMiles(
  location: EnterpriseLocation,
  geo: GeoIntent,
) {
  const lat = num(location.latitude),
    lon = num(location.longitude);
  if (
    lat == null ||
    lon == null ||
    geo.latitude == null ||
    geo.longitude == null ||
    Number.isNaN(lat) ||
    Number.isNaN(lon)
  )
    return null;
  return haversineMiles(geo.latitude, geo.longitude, lat, lon);
}
export function scoreDistance(location: EnterpriseLocation, geo: GeoIntent) {
  const d = location.distance_miles ?? getLocationDistanceMiles(location, geo);
  if (d == null) return 0;
  if (d <= 1) return 35;
  if (d <= 3) return 25;
  if (d <= 5) return 15;
  if (d <= 8) return 5;
  return geo.neighborhood ? -20 : -5;
}
export function sortByDistanceWithinRelevance<T extends EnterpriseLocation>(
  results: T[],
  geo: GeoIntent,
) {
  return [...results].sort(
    (a, b) =>
      Number(b.match_score ?? 0) +
      Number(b.term_score ?? 0) +
      Number(b.geo_score ?? 0) +
      scoreDistance(b, geo) -
      (Number(a.match_score ?? 0) +
        Number(a.term_score ?? 0) +
        Number(a.geo_score ?? 0) +
        scoreDistance(a, geo)),
  );
}
export function getRecordDistanceMiles(
  a: EnterpriseLocation,
  b: EnterpriseLocation,
) {
  const alat = num(a.latitude),
    alon = num(a.longitude),
    blat = num(b.latitude),
    blon = num(b.longitude);
  if ([alat, alon, blat, blon].some((x) => x == null || Number.isNaN(x)))
    return null;
  return haversineMiles(alat!, alon!, blat!, blon!);
}
type PairLike = Partial<EnterprisePair> & {
  pair_distance_miles?: number | null;
};
type PairingPreferenceLike = {
  requiresPairing?: boolean | null;
  distanceMode?: PairDistanceMode | string | null;
  maxPairDistanceMiles?: number | null;
  maxPairWalkingMinutes?: number | null;
  requireWalkablePair?: boolean | null;
};

export function getPairDistanceMiles(
  restaurant: EnterpriseLocation,
  activity: EnterpriseLocation,
): number | null;
export function getPairDistanceMiles(pair: PairLike): number | null;
export function getPairDistanceMiles(
  restaurantOrPair: EnterpriseLocation | PairLike,
  activity?: EnterpriseLocation,
) {
  if (activity) {
    const d = getRecordDistanceMiles(
      restaurantOrPair as EnterpriseLocation,
      activity,
    );
    return d == null ? null : Number(d.toFixed(2));
  }
  const pair = restaurantOrPair as PairLike;
  const existing =
    pair.pairDistanceMiles ??
    pair.pair_distance_miles ??
    pair.distance_miles ??
    null;
  return existing == null ? null : Number(existing);
}
export function estimateWalkingMinutes(distanceMiles: number) {
  return Math.round(distanceMiles * WALKING_MINUTES_PER_MILE);
}
export function walkingMinutesToMiles(minutes: number) {
  return Number((minutes / WALKING_MINUTES_PER_MILE).toFixed(2));
}

function clampedWalkingMinutes(minutes: number) {
  return Math.min(minutes, MAX_WALKING_DISTANCE_MINUTES);
}

function maxMilesForPreference(
  pref: PairingPreferenceLike,
  fallbackMiles: number,
  fallbackMinutes?: number,
) {
  const candidates: number[] = [];

  if (finitePositive(pref.maxPairDistanceMiles)) {
    candidates.push(pref.maxPairDistanceMiles as number);
  }

  if (finitePositive(pref.maxPairWalkingMinutes)) {
    candidates.push(
      walkingMinutesToMiles(
        clampedWalkingMinutes(pref.maxPairWalkingMinutes as number),
      ),
    );
  }

  if (!candidates.length && fallbackMinutes) {
    candidates.push(walkingMinutesToMiles(fallbackMinutes));
  }

  if (!candidates.length) {
    candidates.push(fallbackMiles);
  }

  return Math.min(...candidates);
}

function maxMinutesForPreference(
  pref: PairingPreferenceLike,
  fallbackMinutes: number,
) {
  const minutes = finitePositive(pref.maxPairWalkingMinutes)
    ? (pref.maxPairWalkingMinutes as number)
    : fallbackMinutes;

  return clampedWalkingMinutes(minutes);
}

export function isWalkablePair(
  restaurant: EnterpriseLocation,
  activity: EnterpriseLocation,
  preference?: PairingPreferenceLike | null,
): {
  isWalkable: boolean;
  warnings: string[];
  pairDistanceMiles: number | null;
  pairWalkingMinutes: number | null;
} {
  const pref = preference ?? {
    requiresPairing: false,
    distanceMode: "any" as const,
    maxPairDistanceMiles: null,
    maxPairWalkingMinutes: null,
    requireWalkablePair: false,
  };
  const warnings: string[] = [];
  const pairDistanceMiles = getPairDistanceMiles(restaurant, activity);
  const pairWalkingMinutes =
    pairDistanceMiles == null
      ? null
      : estimateWalkingMinutes(pairDistanceMiles);
  if (pairDistanceMiles == null) {
    warnings.push("missing_coordinates");
    return {
      isWalkable: !pref.requireWalkablePair,
      warnings,
      pairDistanceMiles,
      pairWalkingMinutes,
    };
  }
  if (pref.distanceMode === "walking") {
    const maxMiles = maxMilesForPreference(
      pref,
      3,
      MAX_WALKING_DISTANCE_MINUTES,
    );
    const maxMinutes = maxMinutesForPreference(
      pref,
      MAX_WALKING_DISTANCE_MINUTES,
    );
    return {
      isWalkable:
        pairDistanceMiles <= maxMiles &&
        pairWalkingMinutes != null &&
        pairWalkingMinutes <= maxMinutes,
      warnings,
      pairDistanceMiles,
      pairWalkingMinutes,
    };
  }
  if (pref.distanceMode === "nearby") {
    const maxMiles = maxMilesForPreference(pref, 1.5, 30);
    const maxMinutes = maxMinutesForPreference(pref, 30);
    return {
      isWalkable:
        pairDistanceMiles <= maxMiles &&
        pairWalkingMinutes != null &&
        pairWalkingMinutes <= maxMinutes,
      warnings,
      pairDistanceMiles,
      pairWalkingMinutes,
    };
  }
  if (pref.distanceMode === "same_area") {
    const closeEnough = pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 3);
    const sameArea =
      sameText(restaurant.neighborhood, activity.neighborhood) ||
      sameText(restaurant.borough, activity.borough);
    return {
      isWalkable: closeEnough || sameArea,
      warnings,
      pairDistanceMiles,
      pairWalkingMinutes,
    };
  }
  return {
    isWalkable:
      pairDistanceMiles <=
      (pref.maxPairDistanceMiles ??
        DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES),
    warnings,
    pairDistanceMiles,
    pairWalkingMinutes,
  };
}

export function userAskedForWalking(preference?: PairingPreferenceLike | null) {
  if (!preference) return false;
  return (
    preference.requireWalkablePair === true ||
    ["short_walk", "walking", "nearby"].includes(
      String(preference.distanceMode ?? ""),
    ) ||
    finitePositive(preference.maxPairWalkingMinutes)
  );
}

export function getEffectiveWalkingPairLimitMinutes(
  preference?: PairingPreferenceLike | null,
) {
  if (!preference) return null;
  if (finitePositive(preference.maxPairWalkingMinutes))
    return clampedWalkingMinutes(preference.maxPairWalkingMinutes as number);
  if (preference.distanceMode === "short_walk") return 15;
  if (preference.distanceMode === "nearby") return 30;
  if (preference.distanceMode === "walking")
    return MAX_WALKING_DISTANCE_MINUTES;
  return null;
}

export function isWalkingDistanceSearch(
  preference?: PairingPreferenceLike | null,
) {
  return userAskedForWalking(preference);
}

export function getRawWalkingMinutes(pair: PairLike | null | undefined) {
  const value =
    pair?.googleWalkingDurationMinutes ??
    pair?.routeDurationMinutes ??
    pair?.walking_route_minutes ??
    pair?.walkingDurationMinutes ??
    null;
  return finitePositive(value) ? Number(value) : null;
}

export function getSafeWalkingMinutes(pair: PairLike | null | undefined) {
  const raw = getRawWalkingMinutes(pair);
  if (raw != null) return raw;
  const distance = pair?.pairDistanceMiles ?? pair?.distance_miles ?? null;
  return finitePositive(distance)
    ? estimateWalkingMinutes(Number(distance))
    : null;
}

export function shouldHidePairForWalkingLimit(
  pair: PairLike,
  preference?: PairingPreferenceLike | null,
) {
  const limit = getEffectiveWalkingPairLimitMinutes(preference);
  if (!limit || !userAskedForWalking(preference))
    return { hide: false, reason: null as string | null };
  const minutes = getSafeWalkingMinutes(pair);
  if (minutes == null)
    return {
      hide: preference?.requireWalkablePair === true,
      reason: "missing_coordinates",
    };
  return minutes > limit
    ? { hide: true, reason: "walking_route_exceeds_requested_minutes" }
    : { hide: false, reason: null as string | null };
}

export function isSafeWalkingLabel(label: string | null | undefined) {
  return /\b\d+\s+min(?:ute)?s?\s+walk\b/i.test(String(label ?? ""));
}

export function cleanDistanceLabel(label: string | null | undefined) {
  const trimmed = String(label ?? "").trim();
  return trimmed && trimmed !== "Distance unavailable" ? trimmed : null;
}

export function formatDistanceFromRestaurant({
  pair,
  restaurantName,
  pairingPreference,
}: {
  pair: PairLike;
  restaurantName?: string | null;
  pairingPreference?: PairingPreferenceLike | null;
}) {
  const minutes = getSafeWalkingMinutes(pair);
  if (userAskedForWalking(pairingPreference) && minutes != null)
    return `${minutes} min walk from ${restaurantName ?? "restaurant"}`;
  const distance = pair.pairDistanceMiles ?? pair.distance_miles ?? null;
  if (distance != null)
    return `${Number(distance).toFixed(Number(distance) < 1 ? 1 : 0)} mi from ${restaurantName ?? "restaurant"}`;
  return cleanDistanceLabel(pair.pairDistanceLabel) ?? "Distance unavailable";
}
