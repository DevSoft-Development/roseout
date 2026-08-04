import { haversineMiles } from "../../enterprise/distance";
import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { RequestedGeoBoundary } from "./geoBoundary";

export type SearchMarket = "NYC" | "LONG_ISLAND" | "OTHER" | null;
export type LocalityLevel =
  | "neighborhood"
  | "borough"
  | "city"
  | "town"
  | "village"
  | "hamlet"
  | "county"
  | "market"
  | "state"
  | "unknown";

export type CanonicalLocality = {
  canonicalName: string | null;
  aliases: string[];
  level: LocalityLevel;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number;
  neighborhood: string | null;
  city: string | null;
  borough: string | null;
  county: string | null;
  state: string | null;
  market: SearchMarket;
};

const NYC_BOROUGHS = new Set(["manhattan", "brooklyn", "queens", "bronx", "staten island"]);
const NYC_COUNTIES = new Set(["new york", "kings", "queens", "bronx", "richmond"]);
const LONG_ISLAND_COUNTIES = new Set(["nassau", "suffolk"]);

export function normalizeLocalityValue(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[_\-–—/]+/g, " ")
        .replace(/\b(county|borough|village of|town of|hamlet of)\b/g, " ")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function sameLocalityValue(left: unknown, right: unknown) {
  const a = normalizeLocalityValue(left);
  const b = normalizeLocalityValue(right);
  if (!a || !b) return false;
  const aliases: Record<string, string> = {
    nyc: "new york city",
    "new york": "new york city",
    "new york ny": "new york city",
    fidi: "financial district",
    lic: "long island city",
    sono: "south norwalk",
    kings: "brooklyn",
    richmond: "staten island",
    "long island market": "long island",
    "nyc market": "new york city",
  };
  return (aliases[a] ?? a) === (aliases[b] ?? b);
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function marketFor(values: Array<unknown>): SearchMarket {
  const normalized = values.map(normalizeLocalityValue).filter(Boolean);
  if (normalized.some((value) => value === "long island" || LONG_ISLAND_COUNTIES.has(value))) return "LONG_ISLAND";
  if (normalized.some((value) => value === "new york city" || NYC_BOROUGHS.has(value) || NYC_COUNTIES.has(value))) return "NYC";
  return normalized.length ? "OTHER" : null;
}

function requestedName(boundary: RequestedGeoBoundary) {
  return boundary.neighborhood ?? boundary.city ?? boundary.borough ?? boundary.county ?? boundary.market ?? boundary.state ?? null;
}

export function resolveCanonicalLocality(boundary: RequestedGeoBoundary): CanonicalLocality {
  const name = requestedName(boundary);
  const taxonomy = normalizeGeoTerm(name);
  const latitude = finite(boundary.latitude) ?? finite(taxonomy?.latitude);
  const longitude = finite(boundary.longitude) ?? finite(taxonomy?.longitude);
  const market = marketFor([
    boundary.market,
    boundary.county,
    boundary.borough,
    boundary.city,
    taxonomy?.region,
    taxonomy?.county,
    taxonomy?.borough,
    taxonomy?.city,
  ]);

  return {
    canonicalName: taxonomy?.name ?? name,
    aliases: taxonomy ? Array.from(new Set([taxonomy.name, ...taxonomy.aliases])) : name ? [name] : [],
    level: (taxonomy?.type as LocalityLevel | undefined) ?? (boundary.neighborhood ? "neighborhood" : boundary.borough ? "borough" : boundary.county ? "county" : boundary.city ? "city" : boundary.market ? "market" : boundary.state ? "state" : "unknown"),
    latitude,
    longitude,
    radiusMiles: Math.max(0.25, finite(boundary.radiusMiles) ?? finite(taxonomy?.defaultRadiusMiles) ?? 6),
    neighborhood: boundary.neighborhood ?? (taxonomy?.type === "neighborhood" ? taxonomy.name : null),
    city: boundary.city ?? taxonomy?.city ?? (taxonomy?.type === "city" ? taxonomy.name : null),
    borough: boundary.borough ?? taxonomy?.borough ?? (taxonomy?.type === "borough" ? taxonomy.name : null),
    county: boundary.county ?? taxonomy?.county ?? (taxonomy?.type === "county" ? taxonomy.name : null),
    state: boundary.state ?? taxonomy?.state ?? null,
    market,
  };
}

export function resolveCandidateMarket(location: EnterpriseLocation): SearchMarket {
  return marketFor([
    location.market,
    location.county,
    location.borough,
    location.city,
    location.neighborhood,
  ]);
}

export function distanceFromRequestedLocality(boundary: RequestedGeoBoundary, location: EnterpriseLocation) {
  const locality = resolveCanonicalLocality(boundary);
  const lat = finite(location.latitude);
  const lng = finite(location.longitude);
  if (locality.latitude == null || locality.longitude == null || lat == null || lng == null) return null;
  return haversineMiles(locality.latitude, locality.longitude, lat, lng);
}

export function buildGeoPredicateDiagnostics(boundary: RequestedGeoBoundary) {
  const locality = resolveCanonicalLocality(boundary);
  return {
    canonicalName: locality.canonicalName,
    aliases: locality.aliases,
    level: locality.level,
    market: locality.market,
    neighborhood: locality.neighborhood,
    city: locality.city,
    borough: locality.borough,
    county: locality.county,
    state: locality.state,
    latitude: locality.latitude,
    longitude: locality.longitude,
    requestedAreaRadiusMiles: locality.radiusMiles,
    coordinateFirst: locality.latitude != null && locality.longitude != null,
  };
}
