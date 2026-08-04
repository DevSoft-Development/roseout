import type { EnterpriseLocation } from "../../enterprise/types";
import type { SearchPlan } from "../planner/searchPlanTypes";
import {
  candidateMatchesRequestedGeo,
  normalizeGeoValue,
  resolveCandidateGeo,
} from "./geoBoundary";

export type GeoMatchTier =
  | "exact_locality"
  | "nearby_radius"
  | "broader_fallback"
  | "outside_scope";

export type GeoScopeLevel =
  | "neighborhood"
  | "city"
  | "borough"
  | "county"
  | "market"
  | "radius";

export type GeoMatchResult = {
  accepted: boolean;
  tier: GeoMatchTier;
  scopeLevel: GeoScopeLevel | null;
  reason: string;
  distanceMiles: number | null;
  requestedLocality: string | null;
  candidateLocality: string | null;
};

const same = (a: string | null | undefined, b: string | null | undefined) => {
  const left = normalizeGeoValue(a);
  const right = normalizeGeoValue(b);
  return Boolean(left && right && left === right);
};

function requestedLocality(plan: SearchPlan) {
  return plan.geo.neighborhood ?? plan.geo.city ?? plan.geo.borough ?? plan.geo.county ?? plan.geo.market ?? null;
}

function candidateLocality(location: EnterpriseLocation) {
  return location.neighborhood ?? location.city ?? location.borough ?? location.county ?? location.market ?? null;
}

function exactScope(plan: SearchPlan, location: EnterpriseLocation): GeoScopeLevel | null {
  const resolved = resolveCandidateGeo(location);
  if (plan.geo.neighborhood && (same(plan.geo.neighborhood, resolved.neighborhood) || same(plan.geo.neighborhood, resolved.city))) return "neighborhood";
  if (plan.geo.city && (same(plan.geo.city, resolved.city) || same(plan.geo.city, resolved.neighborhood))) return "city";
  if (plan.geo.borough && same(plan.geo.borough, resolved.borough)) return "borough";
  if (plan.geo.county && same(plan.geo.county, resolved.county)) return "county";
  if (plan.geo.market && same(plan.geo.market, resolved.market)) return "market";
  return null;
}

export function classifyCandidateGeo(plan: SearchPlan, location: EnterpriseLocation): GeoMatchResult {
  const boundary = candidateMatchesRequestedGeo(plan.geo, location);
  const exact = exactScope(plan, location);
  const requested = requestedLocality(plan);
  const candidate = candidateLocality(location);

  if (exact) {
    return {
      accepted: true,
      tier: "exact_locality",
      scopeLevel: exact,
      reason: `exact_${exact}_match`,
      distanceMiles: boundary.distanceMiles,
      requestedLocality: requested,
      candidateLocality: candidate,
    };
  }

  if (boundary.matches && boundary.reason === "inside_requested_radius") {
    return {
      accepted: true,
      tier: "nearby_radius",
      scopeLevel: "radius",
      reason: "inside_requested_radius_outside_exact_locality",
      distanceMiles: boundary.distanceMiles,
      requestedLocality: requested,
      candidateLocality: candidate,
    };
  }

  if (boundary.matches) {
    return {
      accepted: true,
      tier: "broader_fallback",
      scopeLevel: plan.geo.borough ? "borough" : plan.geo.county ? "county" : "market",
      reason: boundary.reason,
      distanceMiles: boundary.distanceMiles,
      requestedLocality: requested,
      candidateLocality: candidate,
    };
  }

  return {
    accepted: false,
    tier: "outside_scope",
    scopeLevel: null,
    reason: boundary.reason,
    distanceMiles: boundary.distanceMiles,
    requestedLocality: requested,
    candidateLocality: candidate,
  };
}

export function geoTierRank(tier: GeoMatchTier) {
  return tier === "exact_locality" ? 0 : tier === "nearby_radius" ? 1 : tier === "broader_fallback" ? 2 : 3;
}

export function pairGeoTier(a: GeoMatchTier, b: GeoMatchTier): Exclude<GeoMatchTier, "outside_scope"> | null {
  if (a === "outside_scope" || b === "outside_scope") return null;
  return geoTierRank(a) >= geoTierRank(b) ? a : b;
}
