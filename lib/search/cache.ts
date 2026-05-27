import type { CanonicalSearchIntent } from "@/lib/search/types";

export const CLEAN_SEARCH_CACHE_VERSION = "clean-search-v2-canonical-intent";

export function shouldBypassSearchCache(intent: CanonicalSearchIntent) {
  const q = intent.normalizedQuery;
  const reasons: string[] = [];
  ["hookah", "lounge", "sip and paint", "paint and sip", "steak dinner", "seafood dinner", "dessert"].forEach((term) => {
    if (q.includes(term)) reasons.push(`query:${term}`);
  });
  if (intent.wantsFood && intent.wantsActivity) reasons.push("food+activity");
  if (intent.wantsFullOuting) reasons.push("full-outing");
  return { bypass: reasons.length > 0, reasons, version: CLEAN_SEARCH_CACHE_VERSION };
}
