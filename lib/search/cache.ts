import type { CanonicalSearchIntent } from "./types";

export const CLEAN_SEARCH_CACHE_VERSION = "clean-search-v1-no-legacy-intent";

export function shouldBypassSearchCache(intent: CanonicalSearchIntent) {
  const q = intent.normalizedQuery;
  const reasons: string[] = [];
  ["hookah", "lounge", "sip and paint", "paint and sip", "steak dinner", "seafood dinner", "dessert"].forEach((t) => q.includes(t) && reasons.push(`keyword:${t}`));
  if (intent.wantsFood && intent.wantsActivity) reasons.push("food+activity");
  if (intent.wantsFullOuting) reasons.push("full-outing");
  return { bypass: reasons.length > 0, reasons, cacheVersion: CLEAN_SEARCH_CACHE_VERSION };
}
