import type { SearchQualityContext } from "./types";

const asList = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export function buildSearchQualityContext(input: {
  query: string;
  intent?: Record<string, any> | null;
  result?: Record<string, any> | null;
  timing?: Record<string, any> | null;
}): SearchQualityContext {
  const result = input.result ?? {};
  const intent = input.intent ?? result.debug?.normalizedIntent ?? result.debug?.intent ?? {};
  const restaurants = asList(result.restaurants);
  const activities = asList(result.activities);
  const pairs = asList(result.pairs);
  const matched = asList(result.matched_locations ?? result.matchedLocations);
  const results = matched.length ? matched : [...restaurants, ...activities];
  const audience = intent.audience ?? result.debug?.audienceIntent ?? null;

  return {
    query: String(input.query ?? ""),
    intent,
    result,
    results,
    restaurants,
    activities,
    pairs,
    topResults: results.slice(0, 5),
    resultCount: results.length || restaurants.length + activities.length + pairs.length,
    expectedAudience: audience?.type ?? null,
    detectedAudience: result.debug?.audienceIntent?.type ?? audience?.type ?? null,
    requestedDomain: intent.primaryDomain ?? intent.primary_domain ?? null,
    actualPrimaryDomain: result.debug?.primaryDomain ?? result.primary_domain ?? null,
    requestedGeo: intent.geo ?? {},
    performance: {
      totalMs: Number(input.timing?.total_ms ?? result.debug?.total_ms ?? 0) || null,
      intentMs: Number(input.timing?.intent_ms ?? 0) || null,
      rpcMs: Number(input.timing?.rpc_ms ?? 0) || null,
      rankingMs: Number(input.timing?.ranking_ms ?? 0) || null,
    },
  };
}
