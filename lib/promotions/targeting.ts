import { normalizeZip } from "@/lib/geo/geo-area";

export type PromotionGeoContext = {
  market?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  territoryIds?: string[];
};

export type PromotionGeoTargeting = {
  markets?: string[];
  states?: string[];
  counties?: string[];
  cities?: string[];
  boroughs?: string[];
  neighborhoods?: string[];
  zipCodes?: string[];
  territoryIds?: string[];
  excludeMarkets?: string[];
  excludeStates?: string[];
  excludeCounties?: string[];
  excludeCities?: string[];
  excludeBoroughs?: string[];
  excludeNeighborhoods?: string[];
  excludeZipCodes?: string[];
  excludeTerritoryIds?: string[];
  radiusMiles?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  audience_text?: string;
  optimized_by_theouthaven?: boolean;
  [key: string]: unknown;
};

const GEO_ARRAY_KEYS = [
  "markets","states","counties","cities","boroughs","neighborhoods","zipCodes","territoryIds",
  "excludeMarkets","excludeStates","excludeCounties","excludeCities","excludeBoroughs",
  "excludeNeighborhoods","excludeZipCodes","excludeTerritoryIds",
] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}
function normalized(value: unknown) {
  return cleanText(value).toLowerCase().replace(/s+/g, " ");
}
function stringArray(value: unknown, zip = false) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,
]/)
      : [];
  return [...new Set(source.map((item) => zip ? normalizeZip(item) : cleanText(item)).filter(Boolean) as string[])].slice(0, 250);
}
function finiteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizePromotionTargeting(value: unknown, defaults?: { latitude?: unknown; longitude?: unknown }): PromotionGeoTargeting {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: PromotionGeoTargeting = {};
  for (const key of GEO_ARRAY_KEYS) {
    const isZip = key === "zipCodes" || key === "excludeZipCodes";
    const items = stringArray(input[key], isZip);
    if (items.length) result[key] = items;
  }
  const radius = finiteNumber(input.radiusMiles);
  const latitude = finiteNumber(input.latitude ?? defaults?.latitude);
  const longitude = finiteNumber(input.longitude ?? defaults?.longitude);
  if (radius != null && radius > 0 && radius <= 100 && latitude != null && longitude != null) {
    result.radiusMiles = radius;
    result.latitude = latitude;
    result.longitude = longitude;
  }
  const audienceText = cleanText(input.audience_text).slice(0, 500);
  if (audienceText) result.audience_text = audienceText;
  if (input.optimized_by_theouthaven === true) result.optimized_by_theouthaven = true;
  return result;
}

function has(values: string[] | undefined, value: unknown) {
  if (!values?.length || !cleanText(value)) return false;
  const needle = normalized(value);
  return values.some((item) => normalized(item) === needle);
}

function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function promotionGeoMatches(targeting: PromotionGeoTargeting | null | undefined, geo: PromotionGeoContext | null | undefined) {
  const target = targeting ?? {};
  const context = geo ?? {};
  const zip = normalizeZip(context.zipCode);

  if (has(target.excludeMarkets, context.market)) return false;
  if (has(target.excludeStates, context.state)) return false;
  if (has(target.excludeCounties, context.county)) return false;
  if (has(target.excludeCities, context.city)) return false;
  if (has(target.excludeBoroughs, context.borough)) return false;
  if (has(target.excludeNeighborhoods, context.neighborhood)) return false;
  if (zip && target.excludeZipCodes?.includes(zip)) return false;
  if (target.excludeTerritoryIds?.some((id) => context.territoryIds?.includes(id))) return false;

  const includeChecks: boolean[] = [];
  if (target.markets?.length) includeChecks.push(has(target.markets, context.market));
  if (target.states?.length) includeChecks.push(has(target.states, context.state));
  if (target.counties?.length) includeChecks.push(has(target.counties, context.county));
  if (target.cities?.length) includeChecks.push(has(target.cities, context.city));
  if (target.boroughs?.length) includeChecks.push(has(target.boroughs, context.borough));
  if (target.neighborhoods?.length) includeChecks.push(has(target.neighborhoods, context.neighborhood));
  if (target.zipCodes?.length) includeChecks.push(Boolean(zip && target.zipCodes.includes(zip)));
  if (target.territoryIds?.length) includeChecks.push(Boolean(target.territoryIds.some((id) => context.territoryIds?.includes(id))));
  if (target.radiusMiles && target.latitude != null && target.longitude != null && context.latitude != null && context.longitude != null) {
    includeChecks.push(haversineMiles(target.latitude, target.longitude, context.latitude, context.longitude) <= target.radiusMiles);
  }

  // Multiple include dimensions are additive (OR). Exclusions always win.
  return includeChecks.length === 0 || includeChecks.some(Boolean);
}

export function geoContextFromSearchPayload(payload: any): PromotionGeoContext {
  const root = payload?.searchV2 && typeof payload.searchV2 === "object" ? payload.searchV2 : payload;
  const geo = root?.searchPlan?.geo ?? root?.debug?.canonicalGeo ?? root?.canonicalGeo ?? {};
  return {
    market: geo.market ?? geo.resolvedMarket ?? null,
    state: geo.state ?? null,
    county: geo.county ?? null,
    city: geo.city ?? null,
    borough: geo.borough ?? null,
    neighborhood: geo.neighborhood ?? null,
    zipCode: geo.zipCode ?? geo.zip_code ?? geo.postal_code ?? null,
    latitude: finiteNumber(geo.latitude),
    longitude: finiteNumber(geo.longitude),
    territoryIds: Array.isArray(geo.territoryIds) ? geo.territoryIds.map(String) : [],
  };
}
