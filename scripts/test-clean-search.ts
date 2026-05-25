import * as assert from "node:assert/strict";
import { runTheOutHavenSearch } from "../lib/search/searchPipeline";

const queries = [
  "Steak dinner and hookah lounge after dinner in Queens",
  "Steak dinner and sip and paint",
  "Seafood dinner and hookah in Queens",
  "Brunch and bowling in Brooklyn",
  "Dessert after dinner",
  "Hookah lounge in Queens",
  "Restaurant with hookah in Queens",
] as const;

async function run() {
for (const query of queries) {
  const result = await runTheOutHavenSearch(query, { message: query });
  const intent = result.intent;

  const summary = {
    query,
    isOffTopic: intent.isOffTopic,
    mealFoodIntents: intent.mealFoodIntents,
    addOnFoodIntents: intent.addOnFoodIntents,
    activityIntents: intent.activityIntents,
    restaurantSearchInput: intent.restaurantSearchInput,
    activitySearchInput: intent.activitySearchInput,
    wantsRestaurant: intent.wantsRestaurant,
    wantsActivity: intent.wantsActivity,
    wantsFullOuting: intent.wantsFullOuting,
    render_mode: result.render_mode,
    card_counts: result.card_counts,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (query === "Steak dinner and hookah lounge after dinner in Queens") {
    assert.equal(intent.isOffTopic, false);
    assert.ok(intent.mealFoodIntents.includes("steak"));
    assert.ok(intent.activityIntents.includes("hookah"));
    assert.equal((intent.restaurantSearchInput ?? "").includes("hookah"), false);
    assert.equal((intent.activitySearchInput ?? "").includes("hookah"), true);
    assert.equal(intent.wantsFullOuting, true);
  }

  if (query === "Steak dinner and sip and paint") {
    assert.equal(intent.isOffTopic, false);
    assert.ok(intent.mealFoodIntents.includes("steak"));
    assert.ok(
      intent.activityIntents.includes("paint_and_sip") ||
        intent.activityIntents.includes("sip_and_paint")
    );
    assert.equal(/sip|paint/.test(intent.restaurantSearchInput ?? ""), false);
    assert.equal(/sip|paint/.test(intent.activitySearchInput ?? ""), true);
    assert.notEqual(result.reply, "I can help with restaurants, activities, nightlife, brunch, and date ideas.");
  }

  if (query === "Dessert after dinner") {
    assert.ok(intent.addOnFoodIntents.includes("dessert"));
    assert.equal(intent.activityIntents.includes("dessert"), false);
    const activityText = result.activities
      .map((activity) => `${activity.name ?? ""} ${activity.category ?? ""}`.toLowerCase())
      .join(" ");
    assert.equal(/candle making|dance studio/.test(activityText), false);
  }
}

console.log("clean-search test suite passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
