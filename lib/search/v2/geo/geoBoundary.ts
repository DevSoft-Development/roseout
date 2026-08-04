import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import {
  distanceFromRequestedLocality,
  normalizeLocalityValue,
  resolveCandidateMarket,
  resolveCanonicalLocality,
  sameLocalityValue,
} from "./localityResolver";

export type RequestedGeoBoundary = {
  state?: string | null;
  borough?: string | null;
  county?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  market?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
};

export type ResolvedCandidateGeo = {
  state: string | null;
  borough: string | null;
  county: string | null;
  city: string | null;
  neighborhood: string | null;
  region: string | null;
  market: string | null;
  source: "record" | "taxonomy" | "borough_inference" | "unknown";
};

const BOROUGH_COUNTIES: Record<string, string> = {
  manhattan: "New York County",
  brooklyn: "Kings County",
  queens: "Queens County",
  bronx: "Bronx County",
  "staten island": "Richmond County",
};

export const normalizeGeoValue = normalizeLocalityValue;
export const sameGeoValue = sameLocalityValue;

function directPlaceMatch(boundary: RequestedGeoBoundary, location: EnterpriseLocation) {
  const requestedNeighborhood = normalizeGeoValue(boundary.neighborhood);
  const requestedCity = normalizeGeoValue(boundary.city);
  const locationNeighborhood = normalizeGeoValue(location.neighborhood);
  const locationCity = normalizeGeoValue(location.city);

  if (requestedNeighborhood && (sameGeoValue(requestedNeighborhood, locationNeighborhood) || sameGeoValue(requestedNeighborhood, locationCity))) return true;
  if (requestedCity && (sameGeoValue(requestedCity, locationCity) || sameGeoValue(requestedCity, locationNeighborhood))) return true;
  return false;
}

export function resolveCandidateGeo(location: EnterpriseLocation): ResolvedCandidateGeo {
  const explicitState = typeof location.state === "string" && location.state.trim() ? location.state : null;
  const explicitBorough = typeof location.borough === "string" && location.borough.trim() ? location.borough : null;
  const explicitCounty = typeof location.county === "string" && location.county.trim() ? location.county : null;
  const explicitCity = typeof location.city === "string" && location.city.trim() ? location.city : null;
  const explicitNeighborhood = typeof location.neighborhood === "string" && location.neighborhood.trim() ? location.neighborhood : null;
  const explicitMarket = typeof location.market === "string" && location.market.trim() ? location.market : null;

  if (explicitCounty) {
    const taxonomy = normalizeGeoTerm(explicitCounty);
    return {
      state: explicitState ?? taxonomy?.state ?? null,
      borough: explicitBorough ?? taxonomy?.borough ?? null,
      county: explicitCounty,
      city: explicitCity,
      neighborhood: explicitNeighborhood,
      region: taxonomy?.region ?? null,
      market: explicitMarket,
      source: "record",
    };
  }

  const boroughCounty = explicitBorough ? BOROUGH_COUNTIES[normalizeGeoValue(explicitBorough)] : null;
  if (boroughCounty) {
    return {
      state: explicitState ?? "NY",
      borough: explicitBorough,
      county: boroughCounty,
      city: explicitCity,
      neighborhood: explicitNeighborhood,
      region: "New York City",
      market: explicitMarket,
      source: "borough_inference",
    };
  }

  for (const candidate of [location.neighborhood, location.city, location.market]) {
    const taxonomy = normalizeGeoTerm(typeof candidate === "string" ? candidate : null);
    if (!taxonomy) continue;
    return {
      state: explicitState ?? taxonomy.state ?? null,
      borough: explicitBorough ?? taxonomy.borough ?? null,
      county: taxonomy.county ?? null,
      city: explicitCity,
      neighborhood: explicitNeighborhood,
      region: taxonomy.region ?? (taxonomy.borough ? "New York City" : null),
      market: explicitMarket,
      source: "taxonomy",
    };
  }

  return {
    state: explicitState,
    borough: explicitBorough,
    county: null,
    city: explicitCity,
    neighborhood: explicitNeighborhood,
    region: null,
    market: explicitMarket,
    source: "unknown",
  };
}

export function candidateMatchesRequestedGeo(boundary: RequestedGeoBoundary, location: EnterpriseLocation) {
  const requested = resolveCanonicalLocality(boundary);
  const resolved = resolveCandidateGeo(location);
  const matchedDirectPlace = directPlaceMatch(boundary, location);
  const distanceMiles = distanceFromRequestedLocality(boundary, location);
  const candidateMarket = resolveCandidateMarket(location);

  if (boundary.state && resolved.state && !sameGeoValue(boundary.state, resolved.state)) {
    return { matches: false, reason: "state_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  if (requested.market && candidateMarket && requested.market !== candidateMarket && requested.market !== "OTHER" && candidateMarket !== "OTHER") {
    return { matches: false, reason: "market_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  if (distanceMiles != null) {
    if (distanceMiles <= requested.radiusMiles) {
      return { matches: true, reason: "inside_requested_radius" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
    }
    return { matches: false, reason: "outside_requested_radius" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  if (matchedDirectPlace) {
    return { matches: true, reason: "direct_place_match" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  if (boundary.neighborhood) {
    const knownNeighborhood = normalizeGeoValue(resolved.neighborhood);
    const knownCity = normalizeGeoValue(resolved.city);
    if ((knownNeighborhood || knownCity) && !sameGeoValue(boundary.neighborhood, knownNeighborhood) && !sameGeoValue(boundary.neighborhood, knownCity)) {
      return { matches: false, reason: "neighborhood_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
    }
  }

  if (boundary.city) {
    const knownCity = normalizeGeoValue(resolved.city);
    const knownNeighborhood = normalizeGeoValue(resolved.neighborhood);
    if ((knownCity || knownNeighborhood) && !sameGeoValue(boundary.city, knownCity) && !sameGeoValue(boundary.city, knownNeighborhood)) {
      return { matches: false, reason: "city_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
    }
  }

  if (boundary.borough && resolved.borough && !sameGeoValue(boundary.borough, resolved.borough)) {
    return { matches: false, reason: "borough_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  if (boundary.county && resolved.county && !sameGeoValue(boundary.county, resolved.county)) {
    return { matches: false, reason: "county_mismatch" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
  }

  return { matches: true, reason: "matched_hierarchy" as const, resolved, distanceMiles, requestedMarket: requested.market, candidateMarket };
}
