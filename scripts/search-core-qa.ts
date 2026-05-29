import "dotenv/config";
import { runTheOutHavenSearch } from "../lib/search/searchPipeline";

const queries = [
  "steak dinner in Queens",
  "hookah lounge in Astoria",
  "rooftop dinner with fun outing",
  "seafood restaurant in Brooklyn",
  "brunch and sip and paint",
  "birthday dinner in Manhattan",
  "steak dinner and hookah lounge",
];

function summarizeRecord(record: any) {
  return {
    id: record?.id ?? record?.source_id ?? record?.place_id ?? null,
    name: record?.name ?? record?.restaurant_name ?? record?.activity_name ?? record?.business_name ?? "Unknown",
    type: record?.location_type ?? record?.type ?? record?.source_table ?? null,
    category: record?.primary_category ?? record?.category ?? record?.cuisine ?? record?.activity_type ?? null,
    borough: record?.borough ?? null,
    city: record?.city ?? null,
  };
}

async function main() {
  for (const query of queries) {
    const result = await runTheOutHavenSearch(query, { message: query });
    const finalCards = [
      ...(result.restaurants ?? []).map((record) => ({ section: "restaurant", ...summarizeRecord(record) })),
      ...(result.activities ?? []).map((record) => ({ section: "activity", ...summarizeRecord(record) })),
      ...(result.matched_locations ?? []).map((record) => ({ section: "matched_location", ...summarizeRecord(record) })),
    ];

    console.log(JSON.stringify({
      query,
      detected_intent: {
        primaryDomain: result.intent.primaryDomain,
        wantsRestaurant: result.intent.wantsRestaurant,
        wantsActivity: result.intent.wantsActivity,
        needsRestaurant: result.intent.needsRestaurant,
        needsActivity: result.intent.needsActivity,
        wantsPairing: result.intent.wantsPairing,
        mealFirst: result.intent.mealFirst,
        hookahMode: result.intent.hookahMode,
        foodIntents: result.intent.foodIntents,
        mealFoodIntents: result.intent.mealFoodIntents,
        activityIntents: result.intent.activityIntents,
        cuisines: result.intent.cuisines,
        boroughs: result.intent.boroughs,
        neighborhoods: result.intent.neighborhoods,
        locations: result.intent.locations,
        vibes: result.intent.vibes,
        occasionIntents: result.intent.occasionIntents,
        restaurantSearchInput: result.intent.restaurantSearchInput,
        activitySearchInput: result.intent.activitySearchInput,
        cacheBypassReasons: result.intent.cacheBypassReasons,
      },
      restaurant_matches: (result.restaurants ?? []).slice(0, 10).map(summarizeRecord),
      activity_matches: (result.activities ?? []).slice(0, 10).map(summarizeRecord),
      rejected_records: (result.debug?.rejectedRecords ?? []).slice(0, 25),
      final_cards_returned: finalCards.slice(0, 25),
      counts: result.card_counts,
      debug: {
        rawRestaurantCount: result.debug?.rawRestaurantCount,
        rawActivityCount: result.debug?.rawActivityCount,
        afterGeoFilterRestaurantCount: result.debug?.afterGeoFilterRestaurantCount,
        afterGeoFilterActivityCount: result.debug?.afterGeoFilterActivityCount,
        afterCategoryFilterRestaurantCount: result.debug?.afterCategoryFilterRestaurantCount,
        afterCategoryFilterActivityCount: result.debug?.afterCategoryFilterActivityCount,
        cache: result.debug?.cache_status,
        sourceErrors: result.debug?.sourceErrors,
      },
    }, null, 2));
  }
}

main().catch((error) => {
  console.error("SEARCH_CORE_QA_FAILED", error);
  process.exitCode = 1;
});
