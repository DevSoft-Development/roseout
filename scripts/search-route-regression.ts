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

async function main() {
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
