import type { CanonicalSearchIntent } from "./types";

export const CLEAN_SEARCH_CACHE_VERSION = "clean-search-v4-canonical-intent-no-empty";

export function shouldBypassSearchCache(intent: CanonicalSearchIntent) {
  const q = intent.normalizedQuery;
  const reasons: string[] = [];
  [
    "hookah", "lounge", "sip and paint", "paint and sip", "steak dinner", "seafood dinner", "dessert",
    "queens", "brooklyn", "manhattan", "bronx", "staten island", "astoria", "long island city", "lic", "nyc", "new york", "nj",
    "long island", "nassau", "suffolk", "hamptons", "freeport", "huntington", "hempstead", "long beach", "garden city",
  ].forEach((term) => {
    if (q.includes(term)) reasons.push(`query:${term}`);
  });
  if (intent.geoIntent) reasons.push(`geo:${intent.geoIntent.geoType}`);
  if (intent.wantsFood && intent.wantsActivity) reasons.push("food+activity");
  if (intent.wantsFullOuting) reasons.push("full-outing");
  if (intent.needsRestaurant || intent.needsActivity) reasons.push("avoid-empty-card-reuse");
  return { bypass: reasons.length > 0, reasons, version: CLEAN_SEARCH_CACHE_VERSION, cacheEmptyResponses: false };
}
