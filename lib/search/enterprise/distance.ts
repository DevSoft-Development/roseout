import type { EnterpriseLocation, GeoIntent, PairingPreference } from "./types";

export function toRadians(value: number) { return (value * Math.PI) / 180; }
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) { const dLat=toRadians(lat2-lat1); const dLon=toRadians(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(toRadians(lat1))*Math.cos(toRadians(lat2))*Math.sin(dLon/2)**2; return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
const num = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null;
const sameText = (a: unknown, b: unknown) => Boolean(a&&b&&String(a).toLowerCase()===String(b).toLowerCase());

export function getLocationDistanceMiles(location: EnterpriseLocation, geo: GeoIntent) { const lat=num(location.latitude), lon=num(location.longitude); if (lat==null||lon==null||geo.latitude==null||geo.longitude==null||Number.isNaN(lat)||Number.isNaN(lon)) return null; return haversineMiles(geo.latitude, geo.longitude, lat, lon); }
export function scoreDistance(location: EnterpriseLocation, geo: GeoIntent) { const d = location.distance_miles ?? getLocationDistanceMiles(location, geo); if (d == null) return 0; if (d <= 1) return 35; if (d <= 3) return 25; if (d <= 5) return 15; if (d <= 8) return 5; return geo.neighborhood ? -20 : -5; }
export function sortByDistanceWithinRelevance<T extends EnterpriseLocation>(results: T[], geo: GeoIntent) { return [...results].sort((a,b)=> (Number(b.match_score??0)+Number(b.term_score??0)+Number(b.geo_score??0)+scoreDistance(b,geo)) - (Number(a.match_score??0)+Number(a.term_score??0)+Number(a.geo_score??0)+scoreDistance(a,geo))); }
export function getRecordDistanceMiles(a: EnterpriseLocation, b: EnterpriseLocation) { const alat=num(a.latitude), alon=num(a.longitude), blat=num(b.latitude), blon=num(b.longitude); if ([alat,alon,blat,blon].some((x)=>x==null||Number.isNaN(x))) return null; return haversineMiles(alat!, alon!, blat!, blon!); }
export function getPairDistanceMiles(restaurant: EnterpriseLocation, activity: EnterpriseLocation): number | null;
export function getPairDistanceMiles(pair: any): number | null;
export function getPairDistanceMiles(restaurantOrPair: EnterpriseLocation | any, activity?: EnterpriseLocation): number | null {
  if (activity) {
    const d = getRecordDistanceMiles(restaurantOrPair, activity);
    return d == null ? null : Number(d.toFixed(2));
  }

  const raw =
    restaurantOrPair?.pairDistanceMiles ??
    restaurantOrPair?.pair_distance_miles ??
    restaurantOrPair?.distanceMiles ??
    restaurantOrPair?.distance_miles;

  const miles = Number(raw);
  if (!Number.isFinite(miles)) return null;
  if (miles < 0) return null;
  return miles;
}
export const MAX_SAFE_WALKING_ROUTE_MINUTES = 180;
export const DEFAULT_MAX_WALKING_PAIR_MINUTES = 60;
export const WALKING_MINUTES_PER_MILE = 20;
export const WALKING_ROUTE_LABEL_DISPLAY_MAX_MINUTES = 45;

export function estimateWalkingMinutes(distanceMiles: number) { return Math.round(distanceMiles * WALKING_MINUTES_PER_MILE); }

export function normalizeWalkingMinutes(value: unknown): number | null {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  if (minutes <= 0) return null;
  if (minutes >= MAX_SAFE_WALKING_ROUTE_MINUTES) return null;
  return Math.round(minutes);
}

export function normalizeRouteMinutes(value: unknown): number | null {
  return normalizeWalkingMinutes(value);
}

export function getWalkingMinutesFromLabel(label: string | undefined | null): number | null {
  if (!label) return null;

  const match = label.match(/\b(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s+walk\b/i);
  if (!match) return null;

  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes)) return null;

  return minutes;
}

export function isSafeWalkingLabel(label: string | undefined | null): boolean {
  const minutes = getWalkingMinutesFromLabel(label);
  const safeMinutes = normalizeWalkingMinutes(minutes);
  return safeMinutes != null && safeMinutes <= DEFAULT_MAX_WALKING_PAIR_MINUTES;
}

export function sanitizeWalkingDistanceLabel(label: string | undefined | null): string | undefined {
  if (!label) return undefined;

  const minutes = getWalkingMinutesFromLabel(label);

  if (minutes != null) {
    const safeMinutes = normalizeWalkingMinutes(minutes);

    if (safeMinutes == null || safeMinutes > DEFAULT_MAX_WALKING_PAIR_MINUTES) {
      return undefined;
    }

    return label.replace(/\b\d+(?:\.\d+)?\s*min(?:ute)?s?\s+walk\b/i, `${safeMinutes} min walk`);
  }

  return label;
}

export function cleanDistanceLabel(label: string | undefined | null): string | undefined {
  if (!label) return undefined;

  const cleaned = label
    .replace(/\s*•\s*Google walking route\s*/gi, "")
    .replace(/\s*Google walking route\s*/gi, "")
    .replace(/\s*•\s*walking route\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const walkingMinutes = getWalkingMinutesFromLabel(cleaned);

  if (walkingMinutes != null) {
    const safeMinutes = normalizeWalkingMinutes(walkingMinutes);

    if (safeMinutes == null || safeMinutes > DEFAULT_MAX_WALKING_PAIR_MINUTES) {
      return undefined;
    }
  }

  return cleaned || undefined;
}

export function isExtremeWalkingRoute(value: unknown): boolean {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= MAX_SAFE_WALKING_ROUTE_MINUTES;
}

export function getRawWalkingMinutes(pair: any): number | null {
  const raw =
    pair?.walkingDurationMinutes ??
    pair?.googleWalkingDurationMinutes ??
    pair?.routeDurationMinutes ??
    pair?.walking_route_minutes ??
    pair?.pairWalkingMinutes ??
    pair?.pair_walking_minutes ??
    pair?.activity?.walkingDurationMinutes ??
    pair?.activity?.googleWalkingDurationMinutes ??
    pair?.activity?.routeDurationMinutes ??
    pair?.activity?.walking_route_minutes;

  const minutes = Number(raw);
  return Number.isFinite(minutes) ? minutes : null;
}

export function estimateWalkingMinutesFromMiles(miles: unknown): number | null {
  if (miles == null) return null;

  const distanceMiles = Number(miles);

  if (!Number.isFinite(distanceMiles)) return null;
  if (distanceMiles < 0) return null;

  return Math.round(distanceMiles * WALKING_MINUTES_PER_MILE);
}

export function getSafeWalkingMinutes(pair: any): number | null {
  const routeMinutes = normalizeRouteMinutes(getRawWalkingMinutes(pair));

  if (routeMinutes != null) {
    return routeMinutes;
  }

  return estimateWalkingMinutesFromMiles(getPairDistanceMiles(pair));
}

export function shouldRejectPairForWalkingRoute(
  pair: any,
  pairingPreference: PairingPreference | null | undefined,
): { reject: boolean; reason: string | null } {
  const mode = pairingPreference?.distanceMode;
  const requiresWalkable =
    mode === "walking" ||
    mode === "short_walk" ||
    pairingPreference?.requireWalkablePair === true;

  if (!requiresWalkable) {
    return { reject: false, reason: null };
  }

  const requestedMaxMinutes = Number(pairingPreference?.maxPairWalkingMinutes);
  const hasRequestedMaxMinutes = Number.isFinite(requestedMaxMinutes) && requestedMaxMinutes > 0;
  const effectiveMaxMinutes = hasRequestedMaxMinutes
    ? Math.min(requestedMaxMinutes, DEFAULT_MAX_WALKING_PAIR_MINUTES)
    : DEFAULT_MAX_WALKING_PAIR_MINUTES;
  const exceedsReason = hasRequestedMaxMinutes
    ? "walking_route_exceeds_requested_minutes"
    : "walking_route_exceeds_default_60_minutes";

  const rawMinutes = getRawWalkingMinutes(pair);

  if (rawMinutes != null) {
    if (isExtremeWalkingRoute(rawMinutes)) {
      return { reject: true, reason: "extreme_walking_route_duration" };
    }

    const safeMinutes = normalizeRouteMinutes(rawMinutes);

    if (safeMinutes != null && safeMinutes > effectiveMaxMinutes) {
      return { reject: true, reason: exceedsReason };
    }

    if (rawMinutes > effectiveMaxMinutes) {
      return { reject: true, reason: exceedsReason };
    }

    return { reject: false, reason: null };
  }

  const estimatedMinutes = estimateWalkingMinutesFromMiles(getPairDistanceMiles(pair));

  if (estimatedMinutes != null && estimatedMinutes > effectiveMaxMinutes) {
    return { reject: true, reason: exceedsReason };
  }

  return { reject: false, reason: null };
}

export function userAskedForWalking(pairingPreference: any): boolean {
  return (
    pairingPreference?.distanceMode === "walking" ||
    pairingPreference?.distanceMode === "short_walk" ||
    pairingPreference?.requireWalkablePair === true ||
    (pairingPreference?.maxPairWalkingMinutes != null &&
      Number.isFinite(Number(pairingPreference.maxPairWalkingMinutes)))
  );
}

export function formatDistanceFromRestaurant({
  pair,
  restaurantName,
  pairingPreference,
}: {
  pair: any;
  restaurantName: string;
  pairingPreference: any;
}): string {
  const askedForWalking = userAskedForWalking(pairingPreference);
  const walkingMinutes = getSafeWalkingMinutes(pair);
  const miles = getPairDistanceMiles(pair);

  if (askedForWalking && walkingMinutes != null) {
    if (walkingMinutes > DEFAULT_MAX_WALKING_PAIR_MINUTES) {
      return "Distance unavailable";
    }

    return `${walkingMinutes} min walk from ${restaurantName}`;
  }

  if (miles != null) {
    return `${miles.toFixed(1)} mi from ${restaurantName}`;
  }

  if (walkingMinutes != null && walkingMinutes <= WALKING_ROUTE_LABEL_DISPLAY_MAX_MINUTES) {
    return `${walkingMinutes} min walk from ${restaurantName}`;
  }

  return "Distance unavailable";
}

export function buildSafePairDistanceLabel({
  pair,
  restaurantName,
  pairDistanceMiles,
  pairingPreference,
}: {
  pair: any;
  restaurantName: string;
  pairDistanceMiles: unknown;
  pairingPreference?: PairingPreference | null;
}) {
  return formatDistanceFromRestaurant({
    pair: { ...pair, pairDistanceMiles },
    restaurantName,
    pairingPreference,
  });
}


export function isWalkablePair(restaurant: EnterpriseLocation, activity: EnterpriseLocation, preference?: PairingPreference | null): { isWalkable: boolean; warnings: string[]; pairDistanceMiles: number | null; pairWalkingMinutes: number | null } {
  const pref = preference ?? { requiresPairing: false, distanceMode: "any" as const, maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false };
  const warnings: string[] = [];
  const pairDistanceMiles = getPairDistanceMiles(restaurant, activity);
  const pairWalkingMinutes = pairDistanceMiles == null ? null : estimateWalkingMinutes(pairDistanceMiles);
  const withinDefaultWalkingLimit = pairWalkingMinutes != null && pairWalkingMinutes <= DEFAULT_MAX_WALKING_PAIR_MINUTES;
  if (pairDistanceMiles == null) {
    warnings.push("missing_coordinates");
    return { isWalkable: !pref.requireWalkablePair, warnings, pairDistanceMiles, pairWalkingMinutes };
  }
  if (pref.distanceMode === "short_walk") return { isWalkable: withinDefaultWalkingLimit && pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 0.75), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "walking") return { isWalkable: withinDefaultWalkingLimit && pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 1.5), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "nearby") return { isWalkable: pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 2.5), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "same_area") {
    const closeEnough = pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 5);
    const sameArea = sameText(restaurant.neighborhood, activity.neighborhood) || sameText(restaurant.borough, activity.borough);
    return { isWalkable: closeEnough || sameArea, warnings, pairDistanceMiles, pairWalkingMinutes };
  }
  return { isWalkable: true, warnings, pairDistanceMiles, pairWalkingMinutes };
}
