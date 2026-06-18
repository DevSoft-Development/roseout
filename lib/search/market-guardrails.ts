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

  return market === expectedMarket && (!expectedState || state === expectedState) && item.is_searchable === true;
}

export function getMarketGuardrailRejectionReason(result: unknown, resolvedMarket?: string | null): string | null {
  if (!isExplicitMarket(resolvedMarket)) return null;
  const item = (result ?? {}) as Record<string, unknown>;
  const expectedMarket = String(resolvedMarket).toUpperCase();
  const expectedState = STRICT_MARKET_STATES[expectedMarket as MarketKey];
  const market = String(item.market || "").toUpperCase() || "missing";
  const state = String(item.state || "").toUpperCase() || "missing";
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
