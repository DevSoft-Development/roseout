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
  return plan.geo.neighborhood ?? plan.geo.borough ?? plan.geo.city ?? plan.geo.county ?? plan.geo.market ?? null;
}

function candidateLocality(location: EnterpriseLocation) {
  return location.neighborhood ?? location.borough ?? location.city ?? location.county ?? location.market ?? null;
}

export function mostSpecificRequestedGeoScope(plan: SearchPlan): Exclude<GeoScopeLevel, "radius"> | null {
  if (plan.geo.neighborhood) return "neighborhood";
  if (plan.geo.borough) return "borough";
  if (plan.geo.city) return "city";
  if (plan.geo.county) return "county";
  if (plan.geo.market) return "market";
  return null;
}

function matchesRequestedScope(
  scope: Exclude<GeoScopeLevel, "radius">,
  plan: SearchPlan,
  location: EnterpriseLocation,
) {
  const resolved = resolveCandidateGeo(location);

  switch (scope) {
    case "neighborhood":
      return same(plan.geo.neighborhood, resolved.neighborhood);
    case "city":
      return same(plan.geo.city, resolved.city);
    case "borough":
      return same(plan.geo.borough, resolved.borough);
    case "county":
      return same(plan.geo.county, resolved.county);
    case "market":
      return same(plan.geo.market, resolved.market);
  }
}

function exactScope(plan: SearchPlan, location: EnterpriseLocation): Exclude<GeoScopeLevel, "radius"> | null {
  const requestedScope = mostSpecificRequestedGeoScope(plan);
  if (!requestedScope) return null;
  return matchesRequestedScope(requestedScope, plan, location) ? requestedScope : null;
}

function broaderScope(plan: SearchPlan): Exclude<GeoScopeLevel, "neighborhood" | "city" | "radius"> {
  if (plan.geo.borough) return "borough";
  if (plan.geo.county) return "county";
  return "market";
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
      scopeLevel: broaderScope(plan),
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

export function geoTierRank(tier: GeoMatchTier | null | undefined) {
  return tier === "exact_locality" ? 0 : tier === "nearby_radius" ? 1 : tier === "broader_fallback" ? 2 : 3;
}

export function pairGeoTier(a: GeoMatchTier, b: GeoMatchTier): Exclude<GeoMatchTier, "outside_scope"> | null {
  if (a === "outside_scope" || b === "outside_scope") return null;
  return geoTierRank(a) >= geoTierRank(b) ? a : b;
}
