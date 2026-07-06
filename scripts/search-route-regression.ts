import assert from "node:assert/strict";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../lib/search/enterprise/normalize-intent";
import { parseEnterpriseIntent, parseEnterpriseIntentFastPath } from "../lib/search/enterprise/intent-parser";

const regressionQueries = [
  "steak dinner",
  "sushi dinner in Queens",
  "rooftop dinner in Long Island City",
  "Seafood dinner with rooftop after",
  "steak dinner with bowling in Astoria",
  "hookah lounge after steak dinner",
  "Italian restaurant near me",
] as const;

const rawSystemErrors = [
  "string did not match",
  "expected pattern",
  "invalid url",
  "unexpected token <",
  "failed to fetch",
];

function assertNoRawSystemError(value: unknown) {
  const lower = JSON.stringify(value).toLowerCase();
  for (const rawError of rawSystemErrors) {
    assert.equal(
      lower.includes(rawError),
      false,
      `response exposed low-level system error: ${rawError}`,
    );
  }
}


function createMockSupabase(options: { includeLongIslandRows?: boolean } = {}) {
  const market = options.includeLongIslandRows ? "LONG_ISLAND" : undefined;
  const county = options.includeLongIslandRows ? "Nassau" : undefined;
  const city = options.includeLongIslandRows ? "Garden City" : "New York";

  const restaurant = {
    id: "mock-restaurant",
    name: "Mock Dinner & Drinks",
    restaurant_name: "Mock Dinner & Drinks",
    location_type: "restaurant",
    primary_category: "restaurant",
    cuisine: "american",
    search_document: "restaurant dinner drinks cocktails group night steak rooftop food dining menu hookah date night bowling long island",
    semantic_search_text: "restaurant dinner drinks cocktails group night steak rooftop food dining menu hookah date night bowling long island",
    image_url: "https://example.com/restaurant.jpg",
    state: "NY",
    city,
    county,
    market,
    has_photos: true,
    photo_status: "approved",
    rating: 4.7,
    review_count: 125,
    quality_score: 85,
    theouthaven_score: 90,
    public_visibility_tier: "standard",
    curation_tier: "standard",
    source_quality_status: "enriched",
    duplicate_status: "unique",
    is_low_level: false,
    active: true,
    is_hidden: false,
    status: "active",
    data_status: "clean",
    is_searchable: true,
    latitude: options.includeLongIslandRows ? 40.7268 : 40.75,
    longitude: options.includeLongIslandRows ? -73.6343 : -73.98,
  };
  const activity = {
    id: "mock-activity",
    name: "Mock Hookah Lounge",
    activity_name: "Mock Hookah Lounge",
    location_type: "activity",
    primary_category: "hookah lounge rooftop nightlife activity",
    activity_type: "hookah rooftop lounge",
    search_document: "hookah lounge rooftop drinks cocktails activity nightlife date night bowling long island",
    semantic_search_text: "hookah lounge rooftop drinks cocktails activity nightlife date night bowling long island",
    state: "NY",
    city,
    county,
    market,
    has_photos: true,
    photo_status: "approved",
    rating: 4.7,
    review_count: 125,
    quality_score: 85,
    theouthaven_score: 90,
    is_searchable: true,
    image_url: "https://example.com/activity.jpg",
    latitude: options.includeLongIslandRows ? 40.729 : 40.751,
    longitude: options.includeLongIslandRows ? -73.63 : -73.981,
  };
  const calls: Array<{ name: string; params: any }> = [];

  return {
    calls,
    client: {
      from: () => ({ select(){return this}, eq(){return this}, in(){return this}, or(){return this}, is(){return this}, not(){return this}, limit(){return this}, maybeSingle: async()=>({data:null,error:null}), single: async()=>({data:null,error:null}), then(resolve: any){ return resolve({ data: [], error: null }); } }),
      rpc: async (name: string, params: any) => {
        calls.push({ name, params });
        if (params.p_domain === "restaurant") return { data: [restaurant], error: null };
        if (params.p_domain === "activity") return { data: [activity], error: null };
        return { data: [], error: null };
      },
    },
  };
}

async function main() {
  (globalThis as any).WebSocket = (await import("next/dist/compiled/ws")).default ?? (await import("next/dist/compiled/ws"));

  const steakDinner = normalizeIntent("steak dinner");
  assert.equal(steakDinner.needsRestaurant, true);
  assert.equal(steakDinner.needsActivity, false);
  assert.equal(steakDinner.wantsPairing, false);
  assert(restaurantSearchTerms(steakDinner).includes("steak"));
  assert(!restaurantSearchTerms(steakDinner).includes("dinner"));
  assert.deepEqual(activitySearchTerms(steakDinner), []);

  for (const query of regressionQueries) {
    assert.doesNotThrow(() => normalizeIntent(query), `${query} parser threw`);
  }

  for (const connector of ["after", "before", "then", "with"] as const) {
    assert.doesNotThrow(
      () => normalizeIntent(`steak dinner ${connector} bowling in Astoria`),
      `${connector} connector crashed parser`,
    );
  }

  for (const query of ["steak dinner and hookah lounge after", "sushi dinner and karaoke after"] as const) {
    const fastPathIntent = parseEnterpriseIntentFastPath(query);
    assert(fastPathIntent, `${query} should match enterprise fast path`);
    assert.equal(fastPathIntent.searchType, "mixed_outing");
    assert.equal(fastPathIntent.needsRestaurant, true);
    assert.equal(fastPathIntent.needsActivity, true);

    const parsed = await parseEnterpriseIntent(query, { useLLM: true });
    assert.equal(parsed.intentParserSource, "fast_path", `${query} parser source`);
    assert.equal(parsed.fastPathMatched, true, `${query} fast path flag`);
    assert.equal(parsed.usedLlm, false, `${query} should skip LLM`);
  }

  assert.equal(parseEnterpriseIntentFastPath("tell me something romantic but not too expensive"), null);
  assert.equal(parseEnterpriseIntentFastPath("things to do in queens"), null);

  for (const query of [
    "affordable date in Manhattan with food and something unique under $100 total",
    "last-minute plans near me tonight with dinner and drinks after",
    "hookah lounge with food near Queens and a rooftop or lounge vibe after",
    "late-night dinner near me with something open after midnight",
    "outdoor activity in Brooklyn followed by a cozy restaurant nearby",
  ] as const) {
    const fastPathIntent = parseEnterpriseIntentFastPath(query);
    assert(fastPathIntent, `${query} should match enterprise mixed fast path`);
    assert.equal(fastPathIntent.searchType, "mixed_outing", `${query} search type`);
    assert.equal(fastPathIntent.needsRestaurant, true, `${query} needs restaurant`);
    assert.equal(fastPathIntent.needsActivity, true, `${query} needs activity`);

    const parsed = await parseEnterpriseIntent(query, { useLLM: true });
    assert.equal(parsed.intentParserSource, "fast_path", `${query} parser source`);
    assert.equal(parsed.fastPathMatched, true, `${query} fast path flag`);
    assert.equal(parsed.usedLlm, false, `${query} should skip LLM`);
  }

  for (const query of [
    "fun friend outing in Long Island with no clubs and easy parking",
    "things to do with easy parking",
    "activity in Long Island with no clubs",
    "friend outing with no clubs",
  ] as const) {
    const fastPathIntent = parseEnterpriseIntentFastPath(query);
    assert(fastPathIntent, `${query} should match activity fast path`);
    assert.equal(fastPathIntent.searchType, "activity", `${query} search type`);
    assert.equal(fastPathIntent.needsRestaurant, false, `${query} needs restaurant`);
    assert.equal(fastPathIntent.needsActivity, true, `${query} needs activity`);
    const parsed = await parseEnterpriseIntent(query, { useLLM: true });
    assert.equal(parsed.intentParserSource, "fast_path", `${query} parser source`);
    assert.equal(parsed.fastPathMatched, true, `${query} fast path flag`);
    assert.equal(parsed.usedLlm, false, `${query} should skip LLM`);
  }

  {
    const intent = normalizeIntent("Seafood dinner with rooftop after");

    assert.equal(intent.searchType, "mixed_outing");
    assert.equal(intent.needsRestaurant, true);
    assert.equal(intent.needsActivity, true);
    assert.equal(intent.wantsPairing, true);

    assert(intent.restaurantIntent.foodTerms.includes("seafood"));
    assert(!intent.restaurantIntent.foodTerms.includes("rooftop"));
    assert(!intent.restaurantIntent.featureTerms.includes("rooftop"));

    assert(intent.activityIntent.activityTerms.includes("rooftop"));
    assert(intent.activityIntent.activityTerms.includes("rooftop bar"));
    assert(intent.activityIntent.activityTerms.includes("rooftop lounge"));
  }

  {
    const intent = normalizeIntent("rooftop dinner in Long Island City");

    assert.equal(intent.needsRestaurant, true);
    assert.equal(intent.needsActivity, false);
    assert(intent.restaurantIntent.featureTerms.includes("rooftop"));
  }

  {
    const parsed = await parseEnterpriseIntent("Seafood dinner with rooftop after", { useLLM: true });

    assert.equal(parsed.intentParserSource, "fast_path");
    assert.equal(parsed.fastPathMatched, true);
    assert.equal(parsed.usedLlm, false);
    assert.equal(parsed.intent.searchType, "mixed_outing");
    assert(parsed.intent.activityIntent.activityTerms.includes("rooftop"));
    assert(!parsed.intent.restaurantIntent.foodTerms.includes("rooftop"));
  }


  {
    const sportsWatchCases = [
      "I want wings and a bar where I can watch the Knicks game, not a restaurant plus a separate activity.",
      "Give me a sports bar with wings and TVs for the Knicks game, all at the same place.",
      "I want a bar and grill with chicken wings where we can watch basketball, not just a lounge.",
      "Find wings and a sports bar to watch the game in one place.",
    ] as const;

    for (const query of sportsWatchCases) {
      const parsed = await parseEnterpriseIntent(query, { useLLM: true });
      assert.equal(parsed.intent.primaryDomain, "restaurant", `${query} primaryDomain`);
      assert.equal(parsed.intent.needsRestaurant, true, `${query} needsRestaurant`);
      assert.equal(parsed.intent.needsActivity, false, `${query} needsActivity`);
      assert.equal(parsed.intent.wantsPairing, false, `${query} wantsPairing`);
      assert.equal((parsed.intent as any).pairRequested ?? false, false, `${query} pairRequested`);
      assert.equal((parsed.intent as any).fallbackPairAllowed ?? false, false, `${query} fallbackPairAllowed`);
      assert.equal((parsed.intent as any).sameVenuePreferred, true, `${query} sameVenuePreferred`);
      assert(["restaurant", "same_location_combo"].includes(parsed.intent.searchType), `${query} searchType`);
      const restaurantTerms = restaurantSearchTerms(parsed.intent);
      assert(restaurantTerms.includes("wings"), `${query} restaurant terms include wings`);
      assert(restaurantTerms.some((term) => ["sports bar", "bar and grill", "game watch", "tv", "tvs", "screens"].includes(term)), `${query} restaurant terms include sports-watch venue terms`);
      assert.deepEqual(activitySearchTerms(parsed.intent), [], `${query} activity terms are not final display terms`);
    }

    const activityOnlySportsBar = await parseEnterpriseIntent("Find a sports bar nearby.", { useLLM: true });
    assert.equal(activityOnlySportsBar.intent.wantsPairing, false);
    assert.equal((activityOnlySportsBar.intent as any).pairRequested ?? false, false);

    const mixedOuting = await parseEnterpriseIntent("Find dinner and bowling nearby.", { useLLM: true });
    assert.equal(mixedOuting.intent.searchType, "mixed_outing");
    assert.equal(mixedOuting.intent.needsRestaurant, true);
    assert.equal(mixedOuting.intent.needsActivity, true);
    assert.equal(mixedOuting.intent.wantsPairing, true);
  }

  const { runEnterpriseSearch } = await import("../lib/search/enterprise/index");


  for (const query of ["group dinner and drinks", "group dinner with cocktails"] as const) {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch(query, { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).needsRestaurant, true);
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).needsActivity, false);
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).wantsPairing, false);
    assert.deepEqual((result.debug?.rpcCalls as string[])?.filter((call) => call.includes(":activity")), [], `${query} should skip activity RPC`);
    assert(["restaurant_cards", "combo_location_cards"].includes(result.renderMode ?? ""), `${query} render mode`);
  }

  {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch("group dinner and drinks after", { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).searchType, "mixed_outing");
    assert.deepEqual((result.debug?.rpcCalls as string[])?.slice(0, 2), ["enterprise_search_locations:restaurant", "enterprise_search_locations:activity"]);
    assert(["mixed_pairs", "pair_cards"].includes(result.renderMode ?? ""));
  }


  {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch("restaurant and rooftop drinks after walking distance", { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.defaultMarketApplied, true, "no-geo query should apply default market");
    assert.equal(result.debug?.defaultMarketId, "nyc_long_island");
    assert.equal(result.debug?.defaultMarketLabel, "NYC + Long Island");
    assert.equal((result.debug?.effectiveGeo as any)?.geoStrictness, "default_market");
    assert.equal(result.debug?.rpcGeoLatitude, 40.758);
    assert.equal(result.debug?.rpcGeoLongitude, -73.9855);
    assert.equal(result.debug?.rpcRadiusMiles, 45);
    assert.equal((result.debug?.originalGeo as any)?.geoStrictness, "none");
    assert.equal((result.debug?.originalGeo as any)?.latitude, null);
    assert.equal((result.debug?.effectiveGeo as any)?.defaultMarketId, "nyc_long_island");
    const restaurantCall = mock.calls.find((call) => call.params.p_domain === "restaurant");
    const activityCall = mock.calls.find((call) => call.params.p_domain === "activity");
    for (const call of [restaurantCall, activityCall]) {
      assert(call, "expected restaurant and activity RPC calls");
      assert.equal(call.params.p_latitude, 40.758);
      assert.equal(call.params.p_longitude, -73.9855);
      assert.equal(call.params.p_radius_miles, 45);
      assert.equal(call.params.p_state, "NY");
    }
  }

  for (const query of [
    "restaurant and rooftop drinks in Brooklyn walking distance",
    "restaurant and rooftop drinks in Long Island walking distance",
    "rooftop drinks near Hoboken",
    "dinner in Miami",
  ] as const) {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch(query, { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.defaultMarketApplied, false, `${query} should not apply default market`);
    assert.equal(result.debug?.marketReason, "explicit_geo", `${query} should keep explicit geo`);
  }

  {
    const intent = normalizeIntent("steak dinner then hookah");
    assert.equal(intent.searchType, "mixed_outing");
    assert.equal(intent.needsRestaurant, true);
    assert.equal(intent.needsActivity, true);
  }

  {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch("steak dinner and hookah lounge after", { supabase: mock.client, betaDebug: true, useLLM: true });
    assert.equal(result.debug?.intentParserSource, "fast_path");
    assert.equal(result.debug?.fastPathMatched, true);
    assert.equal((result.debug?.performance as any)?.llm_ms, 0);
    for (const term of ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "brazilian steakhouse", "churrasco"]) assert((result.debug?.restaurantTerms as string[]).includes(term));
    assert.deepEqual(result.debug?.activityTerms, ["hookah", "hookah lounge", "hookah bar", "shisha"]);
  }



  {
    const { isResultAllowedForResolvedMarket } = await import("../lib/search/market-guardrails");
    assert.equal(
      isResultAllowedForResolvedMarket(
        { market: "LONG_ISLAND", state: "NY", county: "Nassau", is_searchable: true },
        "LONG_ISLAND",
      ),
      true,
      "explicit Long Island market row should pass guardrail",
    );
    assert.equal(
      isResultAllowedForResolvedMarket(
        { state: "NY", county: "Suffolk County", is_searchable: true },
        "LONG_ISLAND",
      ),
      true,
      "missing-market Nassau/Suffolk fallback should prevent total LI outage",
    );
    assert.equal(
      isResultAllowedForResolvedMarket(
        { market: "NYC_CORE", state: "NY", county: "Queens", is_searchable: true },
        "LONG_ISLAND",
      ),
      false,
      "NYC_CORE rows should not pass explicit Long Island searches",
    );
  }

  for (const query of [
    "hookah and drinks in long island",
    "date night in long island",
    "restaurants in long island",
    "bowling in long island",
  ] as const) {
    const intent = normalizeIntent(query);
    assert.equal(intent.geo.resolvedMarket, "LONG_ISLAND", `${query} should resolve to LONG_ISLAND`);
    assert.equal(intent.geo.explicitMarketRequested, true, `${query} should be an explicit market search`);
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = "not a valid supabase url";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.OPENAI_API_KEY = "";

  const { POST } = await import("../app/api/generate/route");

  for (const query of regressionQueries) {
    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: query }),
      }),
    );

    assert.equal(response.status, 200, `${query} route did not return safe 200`);
    const rawText = await response.text();
    assert.doesNotThrow(() => JSON.parse(rawText), `${query} response was not JSON`);
    const data = JSON.parse(rawText);
    assertNoRawSystemError({
      error: data.error,
      reply: data.reply,
      user_message: data.user_message,
    });

    if (query === "steak dinner") {
      assert.notEqual(data.render_mode, "activity_cards");
      assert.equal(Array.isArray(data.activities), true);
    }
  }
}

main()
  .then(() => {
    console.log("search-route-regression passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
