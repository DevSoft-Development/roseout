import type { EnterpriseLocation, GeoIntent, PairingPreference } from "./types";

export function toRadians(value: number) { return (value * Math.PI) / 180; }
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) { const dLat=toRadians(lat2-lat1); const dLon=toRadians(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(toRadians(lat1))*Math.cos(toRadians(lat2))*Math.sin(dLon/2)**2; return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
const num = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null;
const sameText = (a: unknown, b: unknown) => Boolean(a&&b&&String(a).toLowerCase()===String(b).toLowerCase());

export function getLocationDistanceMiles(location: EnterpriseLocation, geo: GeoIntent) { const lat=num(location.latitude), lon=num(location.longitude); if (lat==null||lon==null||geo.latitude==null||geo.longitude==null||Number.isNaN(lat)||Number.isNaN(lon)) return null; return haversineMiles(geo.latitude, geo.longitude, lat, lon); }
export function scoreDistance(location: EnterpriseLocation, geo: GeoIntent) { const d = location.distance_miles ?? getLocationDistanceMiles(location, geo); if (d == null) return 0; if (d <= 1) return 35; if (d <= 3) return 25; if (d <= 5) return 15; if (d <= 8) return 5; return geo.neighborhood ? -20 : -5; }
export function sortByDistanceWithinRelevance<T extends EnterpriseLocation>(results: T[], geo: GeoIntent) { return [...results].sort((a,b)=> (Number(b.match_score??0)+Number(b.term_score??0)+Number(b.geo_score??0)+scoreDistance(b,geo)) - (Number(a.match_score??0)+Number(a.term_score??0)+Number(a.geo_score??0)+scoreDistance(a,geo))); }
export function getRecordDistanceMiles(a: EnterpriseLocation, b: EnterpriseLocation) { const alat=num(a.latitude), alon=num(a.longitude), blat=num(b.latitude), blon=num(b.longitude); if ([alat,alon,blat,blon].some((x)=>x==null||Number.isNaN(x))) return null; return haversineMiles(alat!, alon!, blat!, blon!); }
export function getPairDistanceMiles(restaurant: EnterpriseLocation, activity: EnterpriseLocation) { const d=getRecordDistanceMiles(restaurant,activity); return d==null?null:Number(d.toFixed(2)); }
export function estimateWalkingMinutes(distanceMiles: number) { return Math.round((distanceMiles / 3.0) * 60); }

export const MAX_SAFE_WALKING_ROUTE_MINUTES = 180;
export const WALKING_ROUTE_LABEL_DISPLAY_MAX_MINUTES = 45;

export function normalizeWalkingMinutes(value: unknown): number | null {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  if (minutes <= 0) return null;
  if (minutes > MAX_SAFE_WALKING_ROUTE_MINUTES) return null;
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
  return normalizeWalkingMinutes(minutes) != null;
}

export function sanitizeWalkingDistanceLabel(label: string | undefined | null): string | undefined {
  if (!label) return undefined;

  const minutes = getWalkingMinutesFromLabel(label);

  if (minutes != null) {
    const safeMinutes = normalizeWalkingMinutes(minutes);

    if (safeMinutes == null) {
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

  if (walkingMinutes != null && normalizeWalkingMinutes(walkingMinutes) == null) {
    return undefined;
  }

  return cleaned || undefined;
}

export function isExtremeWalkingRoute(value: unknown): boolean {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > MAX_SAFE_WALKING_ROUTE_MINUTES;
}

export function getRawWalkingMinutes(pair: any): number | null {
  const raw =
    pair?.walkingDurationMinutes ??
    pair?.googleWalkingDurationMinutes ??
    pair?.routeDurationMinutes ??
    pair?.walking_route_minutes ??
    pair?.activity?.walkingDurationMinutes ??
    pair?.activity?.googleWalkingDurationMinutes ??
    pair?.activity?.routeDurationMinutes ??
    pair?.activity?.walking_route_minutes;

  const minutes = Number(raw);
  return Number.isFinite(minutes) ? minutes : null;
}

export function getSafeWalkingMinutes(pair: any): number | null {
  return normalizeRouteMinutes(getRawWalkingMinutes(pair));
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

  const rawMinutes = getRawWalkingMinutes(pair);

  if (rawMinutes == null) {
    return { reject: false, reason: null };
  }

  if (isExtremeWalkingRoute(rawMinutes)) {
    return { reject: true, reason: "extreme_walking_route_duration" };
  }

  const safeMinutes = normalizeRouteMinutes(rawMinutes);

  if (safeMinutes == null) {
    return { reject: false, reason: null };
  }

  const maxMinutes = Number(pairingPreference?.maxPairWalkingMinutes);

  if (Number.isFinite(maxMinutes) && safeMinutes > maxMinutes) {
    return { reject: true, reason: "walking_route_exceeds_requested_minutes" };
  }

  return { reject: false, reason: null };
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
  const safeWalkingMinutes = getSafeWalkingMinutes(pair);
  const mode = pairingPreference?.distanceMode;

  if (
    safeWalkingMinutes != null &&
    (mode === "walking" || mode === "short_walk" || safeWalkingMinutes <= WALKING_ROUTE_LABEL_DISPLAY_MAX_MINUTES)
  ) {
    return cleanDistanceLabel(`${safeWalkingMinutes} min walk from ${restaurantName}`) ?? "Distance unavailable";
  }

  if (Number.isFinite(Number(pairDistanceMiles))) {
    return `${Number(pairDistanceMiles).toFixed(1)} mi from ${restaurantName}`;
  }

  return "Distance unavailable";
}


export function isWalkablePair(restaurant: EnterpriseLocation, activity: EnterpriseLocation, preference?: PairingPreference | null): { isWalkable: boolean; warnings: string[]; pairDistanceMiles: number | null; pairWalkingMinutes: number | null } {
  const pref = preference ?? { requiresPairing: false, distanceMode: "any" as const, maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false };
  const warnings: string[] = [];
  const pairDistanceMiles = getPairDistanceMiles(restaurant, activity);
  const pairWalkingMinutes = pairDistanceMiles == null ? null : estimateWalkingMinutes(pairDistanceMiles);
  if (pairDistanceMiles == null) {
    warnings.push("missing_coordinates");
    return { isWalkable: !pref.requireWalkablePair, warnings, pairDistanceMiles, pairWalkingMinutes };
  }
  if (pref.distanceMode === "short_walk") return { isWalkable: pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 0.75), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "walking") return { isWalkable: pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 1.5), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "nearby") return { isWalkable: pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 2.5), warnings, pairDistanceMiles, pairWalkingMinutes };
  if (pref.distanceMode === "same_area") {
    const closeEnough = pairDistanceMiles <= (pref.maxPairDistanceMiles ?? 5);
    const sameArea = sameText(restaurant.neighborhood, activity.neighborhood) || sameText(restaurant.borough, activity.borough);
    return { isWalkable: closeEnough || sameArea, warnings, pairDistanceMiles, pairWalkingMinutes };
  }
  return { isWalkable: true, warnings, pairDistanceMiles, pairWalkingMinutes };
}
