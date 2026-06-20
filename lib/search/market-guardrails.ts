import type { MarketKey } from "../location-markets";

export type MarketGuardrailResult = {
  ok: boolean;
  reason?: string;
};

const STRICT_MARKET_STATES: Partial<Record<MarketKey, string>> = {
  LONG_ISLAND: "NY",
  NORTHERN_NJ: "NJ",
  WESTCHESTER: "NY",
  BRONX_OUTER: "NY",
  STATEN_ISLAND: "NY",
  NYC_CORE: "NY",
};

export function isExplicitMarket(market?: string | null) {
  return Boolean(market && Object.prototype.hasOwnProperty.call(STRICT_MARKET_STATES, String(market).toUpperCase()));
}

export function isResultAllowedForResolvedMarket(result: unknown, resolvedMarket?: string | null): boolean {
  if (!isExplicitMarket(resolvedMarket)) return true;

  const item = (result ?? {}) as Record<string, unknown>;
  const expectedMarket = String(resolvedMarket).toUpperCase();
  const expectedState = STRICT_MARKET_STATES[expectedMarket as MarketKey];
  const market = String(item.market || "").toUpperCase();
  const state = String(item.state || "").toUpperCase();
  const county = String(item.county || "").toLowerCase();

  if (!market && expectedMarket === "LONG_ISLAND") {
    return (
      state === "NY" &&
      ["nassau", "nassau county", "suffolk", "suffolk county"].includes(county) &&
      item.is_searchable === true
    );
  }

  return market === expectedMarket && (!expectedState || state === expectedState) && item.is_searchable === true;
}

export function getMarketGuardrailRejectionReason(result: unknown, resolvedMarket?: string | null): string | null {
  if (!isExplicitMarket(resolvedMarket)) return null;
  const item = (result ?? {}) as Record<string, unknown>;
  const expectedMarket = String(resolvedMarket).toUpperCase();
  const expectedState = STRICT_MARKET_STATES[expectedMarket as MarketKey];
  const rawMarket = String(item.market || "").toUpperCase();
  const market = rawMarket || "missing";
  const state = String(item.state || "").toUpperCase() || "missing";
  const county = String(item.county || "").toLowerCase();
  if (!rawMarket && expectedMarket === "LONG_ISLAND") {
    if (state !== "NY") return `state ${state} !== NY for missing LONG_ISLAND market fallback`;
    if (!["nassau", "nassau county", "suffolk", "suffolk county"].includes(county)) {
      return `county ${county || "missing"} is not Nassau/Suffolk for missing LONG_ISLAND market fallback`;
    }
    if (item.is_searchable !== true) return "is_searchable is not true";
    return null;
  }
  if (market !== expectedMarket) return `market ${market} !== ${expectedMarket}`;
  if (expectedState && state !== expectedState) return `state ${state} !== ${expectedState}`;
  if (item.is_searchable !== true) return "is_searchable is not true";
  return null;
}

export function isPairAllowedForResolvedMarket(pair: unknown, resolvedMarket?: string | null): boolean {
  if (!isExplicitMarket(resolvedMarket)) return true;
  const item = (pair ?? {}) as Record<string, unknown>;
  return isResultAllowedForResolvedMarket(item.restaurant, resolvedMarket) && isResultAllowedForResolvedMarket(item.activity, resolvedMarket);
}

export type MarketFitBucket = "requested" | "nearby" | "fallback";

export type MarketFitResult = {
  allowed: boolean;
  bucket: MarketFitBucket;
  reason: string;
  label?: string;
};

type MarketFitContext = {
  requestedMarket?: string | null;
  requestedBorough?: string | null;
  requestedCity?: string | null;
  requestedState?: string | null;
  requestedCounty?: string | null;
  requestedNeighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  nearbyRelevanceThreshold?: number;
  fallbackRelevanceThreshold?: number;
  isPhotoSafe?: (item: any) => boolean;
};

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function usable(item: any, context: MarketFitContext): string | null {
  if (item?.deleted_at || item?.archived_at || item?.hidden === true || item?.is_hidden === true) return "hidden_or_not_searchable";
  if (item?.is_searchable === false || item?.active === false) return "hidden_or_not_searchable";
  if (item?.is_low_level === true) return "low_level_suppressed";
  if (["duplicate", "suppressed"].includes(norm(item?.duplicate_status))) return "duplicate_suppressed";
  if (context.isPhotoSafe && !context.isPhotoSafe(item)) return "no_usable_image_url";
  return null;
}

function relevance(item: any) {
  const value = Number(item?.match_score ?? item?.term_score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function classifyMarketFit(item: any, context: MarketFitContext): MarketFitResult {
  const requestedMarket = norm(context.requestedMarket);
  const requestedBorough = norm(context.requestedBorough);
  const requestedCity = norm(context.requestedCity);
  const requestedState = norm(context.requestedState);
  const requestedCounty = norm(context.requestedCounty);
  const requestedNeighborhood = norm(context.requestedNeighborhood);
  const hasRequest = Boolean(requestedMarket || requestedBorough || requestedCity || requestedState || requestedCounty || requestedNeighborhood);
  const unsafe = usable(item, context);
  if (unsafe) return { allowed: false, bucket: "fallback", reason: unsafe };
  if (!hasRequest) return { allowed: true, bucket: "requested", reason: "no_specific_market_requested" };

  const market = norm(item?.market);
  const borough = norm(item?.borough);
  const city = norm(item?.city);
  const state = norm(item?.state);
  const county = norm(item?.county).replace(/ county$/, "");
  const requestedCountyBase = requestedCounty.replace(/ county$/, "");
  const neighborhood = norm(item?.neighborhood);

  const isLongIslandRequest = requestedMarket === "long island" || String(context.requestedMarket || "").toUpperCase() === "LONG_ISLAND";
  const isLongIslandCity = city === "long island city" || neighborhood === "long island city";
  if (isLongIslandRequest && !isLongIslandCity && (market === "long island" || String(item?.market || "").toUpperCase() === "LONG_ISLAND" || ["nassau", "suffolk"].includes(county))) {
    return { allowed: true, bucket: "requested", reason: "requested_long_island_county_match" };
  }
  if (requestedMarket && market === requestedMarket) return { allowed: true, bucket: "requested", reason: "requested_market_match" };
  if (requestedBorough && borough === requestedBorough) return { allowed: true, bucket: "requested", reason: "requested_borough_match" };
  if (requestedCity && city === requestedCity) return { allowed: true, bucket: "requested", reason: "requested_city_match" };
  if (requestedCountyBase && county === requestedCountyBase) return { allowed: true, bucket: "requested", reason: "requested_county_match" };
  if (requestedNeighborhood && neighborhood === requestedNeighborhood) return { allowed: true, bucket: "requested", reason: "requested_neighborhood_match" };
  if (requestedState && !requestedMarket && !requestedBorough && !requestedCity && !requestedCounty && state === requestedState) return { allowed: true, bucket: "requested", reason: "requested_state_match" };

  const radius = Number(context.radiusMiles ?? 25);
  const distance = Number(item?.distance_miles);
  const score = relevance(item);
  const nearbyThreshold = context.nearbyRelevanceThreshold ?? 30;
  if (Number.isFinite(distance) && distance <= radius) {
    if (score >= nearbyThreshold) return { allowed: true, bucket: "nearby", reason: isLongIslandRequest && isLongIslandCity ? "long_island_city_nearby_only" : "nearby_within_radius", label: "Near your requested location" };
    return { allowed: false, bucket: "nearby", reason: "low_relevance_for_nearby" };
  }
  const fallbackThreshold = context.fallbackRelevanceThreshold ?? 70;
  if (score >= fallbackThreshold) return { allowed: true, bucket: "fallback", reason: "fallback_high_relevance", label: "Recommended nearby" };
  return { allowed: false, bucket: "fallback", reason: Number.isFinite(distance) ? "outside_nearby_radius" : "low_relevance_for_nearby" };
}
