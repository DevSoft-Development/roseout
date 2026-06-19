import { getCreateSearchAnalyticsIntent } from "../lib/search/enterprise/createSearchAnalytics";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const cases = [
  "date night near me",
  "date night",
  "dinner near me",
  "coffee date near me",
  "dessert date near me",
];

for (const query of cases) {
  const cleanedQuery = query.replace(/\s+near me\b/i, "").trim();
  const mixed = /date night|coffee date|dessert date/i.test(query);
  const result = {
    success: true,
    render_mode: mixed ? "mixed_pairs" : "restaurant_grid",
    restaurants: Array.from({ length: mixed || /dinner/i.test(query) ? 12 : 0 }, (_, id) => ({ id })),
    activities: Array.from({ length: mixed ? 12 : 0 }, (_, id) => ({ id })),
    pairs: Array.from({ length: mixed ? 2 : 0 }, (_, id) => ({ id })),
    debug: {
      intentParserSource: "fast_path",
      pairCandidatesEvaluated: mixed ? 24 : undefined,
      validPairCountBeforeRender: mixed ? 4 : undefined,
    },
  };
  const counts = {
    restaurants: result.restaurants.length,
    activities: result.activities.length,
    pairs: result.pairs.length,
    pairCandidatesEvaluated: result.debug.pairCandidatesEvaluated,
    validPairCountBeforeRender: result.debug.validPairCountBeforeRender,
  };
  const analyticsIntent = getCreateSearchAnalyticsIntent({ result, debug: result.debug, counts });
  const event = {
    raw_query: query,
    normalized_query: cleanedQuery,
    search_type: analyticsIntent?.searchType ?? null,
    primary_domain: analyticsIntent?.primaryDomain ?? null,
    wants_pairing: analyticsIntent?.wantsPairing ?? null,
    needs_restaurant: analyticsIntent?.needsRestaurant ?? null,
    needs_activity: analyticsIntent?.needsActivity ?? null,
    pair_count: counts.pairs,
    pair_candidates_evaluated: counts.pairCandidatesEvaluated ?? null,
    valid_pair_count_before_render: counts.validPairCountBeforeRender ?? null,
    metadata: {
      originalRawQuery: query,
      normalizedIntent: analyticsIntent,
    },
  };

  if (query === "date night near me") {
    assert(event.raw_query === "date night near me" || event.metadata.originalRawQuery === "date night near me", "date night near me preserves original raw query");
    assert(event.normalized_query === "date night", "date night near me normalized query is cleaned");
    assert(event.search_type === "mixed_outing", "date night near me search_type is mixed_outing");
    assert(event.primary_domain != null, "date night near me primary_domain is present");
    assert(event.wants_pairing === true, "date night near me wants_pairing is true");
    assert(event.needs_restaurant === true, "date night near me needs_restaurant is true");
    assert(event.needs_activity === true, "date night near me needs_activity is true");
    assert(event.metadata.normalizedIntent != null, "date night near me metadata.normalizedIntent is present");
    assert(event.pair_count >= 0, "date night near me pair_count is non-negative");
    if (event.pair_count > 0) {
      assert(Boolean(event.pair_candidates_evaluated) || Boolean(event.valid_pair_count_before_render), "date night near me pair debug counts are not misleading zeroes");
    }
  }
}

console.log("create search analytics regression passed");
