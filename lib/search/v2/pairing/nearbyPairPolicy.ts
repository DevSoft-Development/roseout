import type { SearchPlan } from "../planner/searchPlanTypes";

export function nearbyPairDistanceMiles(plan: SearchPlan): number | null {
  if (!plan.fallback.allowNearbyPair) return null;
  if (plan.pairing.requireWalkable || plan.pairing.maxWalkingMinutes != null) return null;
  if (plan.pairing.sameVenueRequired) return null;

  const strictMiles = Number(plan.pairing.maxDistanceMiles ?? 3);
  const geoRadiusMiles = Number(plan.geo.radiusMiles ?? 6);
  if (!Number.isFinite(strictMiles) || !Number.isFinite(geoRadiusMiles)) return null;

  return Math.max(strictMiles, Math.min(strictMiles * 2, geoRadiusMiles, 6));
}
