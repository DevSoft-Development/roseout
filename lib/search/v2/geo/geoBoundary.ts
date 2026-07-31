import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";

export type RequestedGeoBoundary = {
  state?: string | null;
  borough?: string | null;
  county?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  market?: string | null;
};

export type ResolvedCandidateGeo = {
  state: string | null;
  borough: string | null;
  county: string | null;
  region: string | null;
  source: "record" | "taxonomy" | "borough_inference" | "unknown";
};

const BOROUGH_COUNTIES: Record<string, string> = {
  manhattan: "New York County",
  brooklyn: "Kings County",
  queens: "Queens County",
  bronx: "Bronx County",
  "staten island": "Richmond County",
};

export function normalizeGeoValue(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[_-]+/g, " ").replace(/\bcounty\b/g, "").replace(/\bcore\b/g, "").replace(/\s+/g, " ").trim()
    : "";
}

export function sameGeoValue(left: unknown, right: unknown) {
  const a = normalizeGeoValue(left);
  const b = normalizeGeoValue(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aliases: Record<string, string> = {
    nyc: "new york city",
    "nyc market": "new york city",
    "new york": "new york city",
    kings: "brooklyn",
    richmond: "staten island",
    nassau: "nassau",
    suffolk: "suffolk",
    "long island market": "long island",
  };
  return (aliases[a] ?? a) === (aliases[b] ?? b);
}

export function resolveCandidateGeo(location: EnterpriseLocation): ResolvedCandidateGeo {
  const explicitState = typeof location.state === "string" && location.state.trim() ? location.state : null;
  const explicitBorough = typeof location.borough === "string" && location.borough.trim() ? location.borough : null;
  const explicitCounty = typeof location.county === "string" && location.county.trim() ? location.county : null;

  if (explicitCounty) {
    const taxonomy = normalizeGeoTerm(explicitCounty);
    return {
      state: explicitState ?? taxonomy?.state ?? null,
      borough: explicitBorough ?? taxonomy?.borough ?? null,
      county: explicitCounty,
      region: taxonomy?.region ?? null,
      source: "record",
    };
  }

  const boroughCounty = explicitBorough ? BOROUGH_COUNTIES[normalizeGeoValue(explicitBorough)] : null;
  if (boroughCounty) {
    return {
      state: explicitState ?? "NY",
      borough: explicitBorough,
      county: boroughCounty,
      region: "New York City",
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
      region: taxonomy.region ?? (taxonomy.borough ? "New York City" : null),
      source: "taxonomy",
    };
  }

  return { state: explicitState, borough: explicitBorough, county: null, region: null, source: "unknown" };
}

export function candidateMatchesRequestedGeo(boundary: RequestedGeoBoundary, location: EnterpriseLocation) {
  const resolved = resolveCandidateGeo(location);

  if (boundary.state && resolved.state && !sameGeoValue(boundary.state, resolved.state)) {
    return { matches: false, reason: "state_mismatch" as const, resolved };
  }

  if (boundary.borough) {
    if (!resolved.borough || !sameGeoValue(boundary.borough, resolved.borough)) {
      return { matches: false, reason: "borough_mismatch" as const, resolved };
    }
  }

  if (boundary.county) {
    if (!resolved.county || !sameGeoValue(boundary.county, resolved.county)) {
      return { matches: false, reason: "county_mismatch" as const, resolved };
    }
  }

  return { matches: true, reason: "matched" as const, resolved };
}
