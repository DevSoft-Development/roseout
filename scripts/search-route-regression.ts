import assert from "node:assert/strict";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../lib/search/enterprise/normalize-intent";
import { parseEnterpriseIntent, parseEnterpriseIntentFastPath } from "../lib/search/enterprise/intent-parser";

const regressionQueries = [
  "steak dinner",
  "sushi dinner in Queens",
  "rooftop dinner in Long Island City",
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


function createMockSupabase() {
  const restaurant = {
    id: "mock-restaurant",
    name: "Mock Dinner & Drinks",
    restaurant_name: "Mock Dinner & Drinks",
    location_type: "restaurant",
    primary_category: "restaurant",
    cuisine: "seafood american",
    search_document: "restaurant dinner drinks cocktails group night steak seafood rooftop food dining menu",
    semantic_search_text: "restaurant dinner drinks cocktails group night steak seafood rooftop food dining menu",
    image_url: "https://example.com/restaurant.jpg",
    state: "NY",
    latitude: 40.75,
    longitude: -73.98,
  };
  const activity = {
    id: "mock-activity",
    name: "Mock Hookah Lounge",
    activity_name: "Mock Hookah Lounge",
    location_type: "activity",
    primary_category: "hookah lounge rooftop nightlife activity",
    activity_type: "hookah rooftop lounge",
    search_document: "hookah lounge rooftop drinks cocktails activity nightlife",
    semantic_search_text: "hookah lounge rooftop drinks cocktails activity nightlife",
    state: "NY",
    image_url: "https://example.com/activity.jpg",
    latitude: 40.751,
    longitude: -73.981,
  };
  const calls: Array<{ name: string; params: any }> = [];

  return {
    calls,
    client: {
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

  for (const query of [
    "steak dinner and hookah lounge after",
    "sushi dinner and karaoke after",
    "seafood dinner with rooftop after",
  ] as const) {
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

  const rooftopAfter = normalizeIntent("seafood dinner with rooftop after");
  assert.equal(rooftopAfter.searchType, "mixed_outing");
  assert.equal(rooftopAfter.needsRestaurant, true);
  assert.equal(rooftopAfter.needsActivity, true);
  assert.equal(rooftopAfter.wantsPairing, true);
  assert(restaurantSearchTerms(rooftopAfter).includes("seafood"));
  assert(activitySearchTerms(rooftopAfter).includes("rooftop bar"));
  assert(activitySearchTerms(rooftopAfter).includes("rooftop lounge"));

  const rooftopDinnerOnly = normalizeIntent("romantic rooftop dinner in Manhattan");
  assert.equal(rooftopDinnerOnly.needsRestaurant, true);
  assert.equal(rooftopDinnerOnly.needsActivity, false);
  assert.deepEqual(activitySearchTerms(rooftopDinnerOnly), []);

  assert.equal(parseEnterpriseIntentFastPath("tell me something romantic but not too expensive"), null);
  assert.equal(parseEnterpriseIntentFastPath("things to do in queens"), null);


  const { runEnterpriseSearch } = await import("../lib/search/enterprise/index");

  for (const query of ["group dinner and drinks", "group dinner with cocktails"] as const) {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch(query, { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).needsRestaurant, true);
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).needsActivity, false);
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).wantsPairing, false);
    assert.deepEqual(result.debug?.rpcCalls, ["enterprise_search_locations:restaurant"], `${query} should skip activity RPC`);
    assert.equal(result.renderMode, "restaurant_cards", `${query} render mode`);
  }

  {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch("group dinner and drinks after", { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).searchType, "mixed_outing");
    assert.deepEqual(result.debug?.rpcCalls, ["enterprise_search_locations:restaurant", "enterprise_search_locations:activity"]);
    assert.equal(result.renderMode, "mixed_pairs");
  }

  {
    const mock = createMockSupabase();
    const result = await runEnterpriseSearch("seafood dinner with rooftop after", {
      supabase: mock.client,
      betaDebug: true,
      useLLM: true,
    });
    assert.equal(result.debug?.intentParserSource, "fast_path");
    assert.equal(result.debug?.fastPathMatched, true);
    assert.equal((result.debug?.normalizedIntent as any)?.searchType, "mixed_outing");
    assert.deepEqual(result.debug?.rpcCalls, ["enterprise_search_locations:restaurant", "enterprise_search_locations:activity"]);
    assert.equal(result.renderMode, "mixed_pairs");
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
    assert.deepEqual(result.debug?.restaurantTerms, [
      "steak",
      "steakhouse",
      "steak house",
      "ribeye",
      "porterhouse",
      "filet",
      "filet mignon",
      "sirloin",
      "tomahawk",
      "prime rib",
      "churrasco",
      "brazilian steakhouse",
    ]);
    assert.deepEqual(result.debug?.activityTerms, ["hookah", "hookah lounge", "hookah bar", "shisha"]);
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
