import assert from "node:assert/strict";
import { normalizeIntent, restaurantSearchTerms, activitySearchTerms } from "../lib/search/enterprise/normalize-intent";

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
    cuisine: "american",
    search_document: "restaurant dinner drinks cocktails girls night steak rooftop food dining menu",
    semantic_search_text: "restaurant dinner drinks cocktails girls night steak rooftop food dining menu",
    image_url: "https://example.com/restaurant.jpg",
    latitude: 40.75,
    longitude: -73.98,
  };
  const activity = {
    id: "mock-activity",
    name: "Mock Hookah Lounge",
    activity_name: "Mock Hookah Lounge",
    location_type: "activity",
    primary_category: "hookah lounge nightlife activity",
    activity_type: "hookah lounge",
    search_document: "hookah lounge drinks cocktails activity nightlife",
    semantic_search_text: "hookah lounge drinks cocktails activity nightlife",
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
  assert(restaurantSearchTerms(steakDinner).includes("dinner"));
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


  const { runEnterpriseSearch } = await import("../lib/search/enterprise/index");

  for (const query of ["girls night dinner and drinks", "girls night dinner with cocktails"] as const) {
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
    const result = await runEnterpriseSearch("girls night dinner and drinks after", { supabase: mock.client, betaDebug: true, useLLM: false });
    assert.equal(result.debug?.normalizedIntent && (result.debug.normalizedIntent as any).searchType, "mixed_outing");
    assert.deepEqual(result.debug?.rpcCalls, ["enterprise_search_locations:restaurant", "enterprise_search_locations:activity"]);
    assert.equal(result.renderMode, "mixed_pairs");
  }

  {
    const intent = normalizeIntent("steak dinner then hookah");
    assert.equal(intent.searchType, "mixed_outing");
    assert.equal(intent.needsRestaurant, true);
    assert.equal(intent.needsActivity, true);
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
