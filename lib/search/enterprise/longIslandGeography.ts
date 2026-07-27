import type { EnterpriseLocation } from "./types";

export type LongIslandSearchGeo = {
  latitude: number;
  longitude: number;
  radiusMiles: number;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  market?: string | null;
};

const NASSAU_TOWNS = new Set([
  "garden city", "mineola", "carle place", "westbury", "hempstead", "uniondale",
]);

export function distanceMiles(
  latitude: number,
  longitude: number,
  result: EnterpriseLocation,
): number | null {
  const lat2 = Number(result.latitude);
  const lon2 = Number(result.longitude);
  if (![latitude, longitude, lat2, lon2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - latitude) * rad;
  const dLon = (lon2 - longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Coordinate inclusion for Nassau town searches; city text is only a ranking signal. */
export function isAllowedLongIslandNearbyResult(
  result: EnterpriseLocation,
  requestedGeo: LongIslandSearchGeo,
): boolean {
  if (requestedGeo.state && String(result.state ?? "").toLowerCase() !== requestedGeo.state.toLowerCase())
    return false;
  const county = String(result.county ?? "").toLowerCase();
  const city = String(result.city ?? "").toLowerCase();
  const market = String(result.market ?? "").toLowerCase();
  if (/queens|suffolk/.test(county) || /queens|suffolk/.test(market)) return false;
  if (county && !/nassau/.test(county)) return false;
  if (!county && city && !NASSAU_TOWNS.has(city)) return false;
  if (result.is_searchable === false || result.is_hidden === true || result.deleted_at) return false;
  const distance = distanceMiles(requestedGeo.latitude, requestedGeo.longitude, result);
  return distance != null && distance <= requestedGeo.radiusMiles;
}
