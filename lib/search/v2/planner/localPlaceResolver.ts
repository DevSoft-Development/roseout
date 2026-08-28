import { detectGeoIntent, normalizeGeoTerm } from "../../enterprise/geo-taxonomy";
import {
  detectRequestedMarket,
  MARKET_ALIASES,
  type MarketKey,
} from "../../../location-markets";

export type ParsedLocalPlace = readonly [
  alias: string,
  city: string | null,
  borough: string | null,
  market: string,
  county: string | null,
];

export const SEARCH_V2_LOCAL_MARKETS = [
  "NYC_CORE",
  "LONG_ISLAND",
  "NORTHERN_NJ",
  "WESTCHESTER",
  "CONNECTICUT",
] as const satisfies readonly MarketKey[];

const LOCAL_STATES = new Set(["NY", "NJ", "CT"]);
const BROAD_MARKET_ALIASES = new Set([
  "nyc",
  "new york",
  "new york city",
  "long island",
  "north jersey",
  "northern nj",
  "northern jersey",
  "new jersey",
  "nj",
  "connecticut",
  "ct",
]);
const COUNTY_ALIASES = new Set([
  "nassau",
  "suffolk",
  "westchester",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part === "nj") return "NJ";
      if (part === "nyc") return "NYC";
      if (part === "ct") return "CT";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function searchV2MarketName(value: unknown) {
  const market = String(value ?? "UNKNOWN");
  return market === "NYC_CORE" ? "NYC" : market;
}

function countyFromAlias(alias: string) {
  const normalized = normalize(alias);
  if (normalized.endsWith(" county")) return titleCase(normalized);
  if (COUNTY_ALIASES.has(normalized)) return `${titleCase(normalized)} County`;
  return null;
}

function configuredLocalMarket(alias: string) {
  const normalized = normalize(alias);
  return SEARCH_V2_LOCAL_MARKETS.find((market) =>
    MARKET_ALIASES[market].some((candidate) => normalize(candidate) === normalized),
  ) ?? null;
}

/**
 * Resolve every place Search V2 considers local from the same shared geo and
 * market taxonomies used by the rest of search. Detailed geo records win; the
 * market alias registry provides coverage for supported cities/counties that
 * do not yet have a coordinate-bearing GEO_TAXONOMY record.
 */
export function resolveExplicitLocalPlace(query: string): ParsedLocalPlace | null {
  const geo = detectGeoIntent(query);
  const marketDetection = detectRequestedMarket(query);
  const matchedAlias = normalize(marketDetection.matchedAlias);
  const matchedMarket = matchedAlias ? configuredLocalMarket(matchedAlias) : null;
  const geoIsLocal = Boolean(geo.raw && geo.state && LOCAL_STATES.has(String(geo.state).toUpperCase()));
  const broadMarketAlias = BROAD_MARKET_ALIASES.has(matchedAlias);

  if (geoIsLocal && !broadMarketAlias) {
    const market = matchedMarket
      ?? configuredLocalMarket(String(geo.raw))
      ?? (geo.borough || geo.city === "New York" ? "NYC_CORE" : null)
      ?? (geo.region === "Long Island" ? "LONG_ISLAND" : null)
      ?? (geo.state === "NJ" ? "NORTHERN_NJ" : null)
      ?? (geo.state === "CT" ? "CONNECTICUT" : null);

    if (market) {
      return [
        normalize(String(geo.raw)),
        geo.city ?? null,
        geo.borough ?? null,
        searchV2MarketName(market),
        geo.county ?? null,
      ];
    }
  }

  if (
    marketDetection.marketIntent !== "explicit"
    || !matchedAlias
    || !matchedMarket
  ) {
    return null;
  }

  const record = normalizeGeoTerm(matchedAlias);
  if (record && LOCAL_STATES.has(String(record.state).toUpperCase()) && !broadMarketAlias) {
    return [
      matchedAlias,
      record.city ?? (record.type === "city" ? record.name : null),
      record.borough ?? (record.type === "borough" ? record.name : null),
      searchV2MarketName(matchedMarket),
      record.county ?? (record.type === "county" ? record.name : null),
    ];
  }

  const county = countyFromAlias(matchedAlias);
  const city = broadMarketAlias || county ? null : marketDetection.locationDisplayName ?? titleCase(matchedAlias);
  return [
    matchedAlias,
    city,
    null,
    searchV2MarketName(matchedMarket),
    county,
  ];
}

export function isKnownLocalPlace(value: string) {
  return resolveExplicitLocalPlace(value) !== null;
}
