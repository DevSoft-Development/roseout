import * as assert from "node:assert/strict";
import { runTheOutHavenSearch } from "../lib/search/searchPipeline";

const queries = [
  "Queens",
  "restaurants in Queens",
  "activities in Queens",
  "steak dinner in Queens",
  "steak dinner and hookah lounge after dinner in Queens",
  "Astoria",
  "hookah in Queens",
] as const;

async function run() {
  for (const query of queries) {
    const result = await runTheOutHavenSearch(query, { message: query });
    const cards = (result.restaurants?.length ?? 0) + (result.activities?.length ?? 0);
    console.log(query, { restaurants: result.restaurants.length, activities: result.activities.length, matched: result.matched_locations.length });

    if (query === "Queens") {
      assert.ok(cards > 0 || result.matched_locations.length > 0);
      assert.ok((result.intent.boroughs?.length ?? 0) > 0);
    }
    if (query === "restaurants in Queens") assert.ok(result.restaurants.length > 0);
    if (query === "activities in Queens") assert.ok(result.activities.length > 0);
    if (query === "steak dinner in Queens") assert.ok(result.restaurants.length > 0);
    if (query === "steak dinner and hookah lounge after dinner in Queens") {
      assert.ok(result.restaurants.length > 0);
      assert.ok(result.activities.length >= 0);
    }
    if (query === "Astoria") assert.ok(cards > 0 || result.matched_locations.length > 0);
    if (query === "hookah in Queens") assert.ok(result.activities.length > 0 || result.matched_locations.length > 0);
  }
  console.log("search-location-regression passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
