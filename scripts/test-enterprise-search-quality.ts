import assert from "node:assert/strict";
import type { EnterpriseLocation, SearchDomain } from "../lib/search/enterprise/types";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "x".repeat(40);
(globalThis as any).WebSocket ||= class WebSocketStub {};

const worshipTerms = [
  "temple",
  "church",
  "chapel",
  "cathedral",
  "mosque",
  "masjid",
  "synagogue",
  "shul",
  "place of worship",
  "religious",
  "shrine",
  "ministry",
  "parish",
  "congregation",
];

const restaurantBlockedTerms = [
  "theater",
  "theatre",
  "movie theater",
  "cinema",
  "museum",
  "gallery",
  "park",
  "bowling",
  "arcade",
  "escape room",
  "karaoke",
];

const records: EnterpriseLocation[] = [
  { id: "r-steak", name: "Astoria Prime Steak", restaurant_name: "Astoria Prime Steak", location_type: "restaurant", primary_category: "Steakhouse", cuisine: "Steakhouse", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.764, longitude: -73.923, image_url: "https://img.test/steak.jpg", search_document: "steak dinner restaurant birthday dining Astoria" },
  { id: "r-sushi", name: "Queens Sushi", restaurant_name: "Queens Sushi", location_type: "restaurant", primary_category: "Sushi Restaurant", cuisine: "Sushi", borough: "Queens", city: "New York", state: "NY", latitude: 40.75, longitude: -73.92, image_url: "https://img.test/sushi.jpg", search_document: "sushi japanese dinner restaurant" },
  { id: "r-rooftop", name: "Rooftop Table", restaurant_name: "Rooftop Table", location_type: "restaurant", primary_category: "New American Restaurant", cuisine: "American", borough: "Queens", city: "New York", state: "NY", latitude: 40.743, longitude: -73.956, image_url: "https://img.test/rooftop.jpg", search_document: "rooftop dinner terrace skyline view restaurant menu" },
  { id: "r-dinner", name: "Neighborhood Dinner", restaurant_name: "Neighborhood Dinner", location_type: "restaurant", primary_category: "Restaurant", cuisine: "American", borough: "Queens", city: "New York", state: "NY", latitude: 40.752, longitude: -73.93, image_url: "https://img.test/dinner.jpg", search_document: "dinner restaurant dining birthday" },
  { id: "a-bowling", name: "Astoria Bowl", activity_name: "Astoria Bowl", location_type: "activity", primary_category: "Bowling Alley", activity_type: "Bowling", neighborhood: "Astoria", borough: "Queens", city: "New York", state: "NY", latitude: 40.765, longitude: -73.921, image_url: "https://img.test/bowl.jpg", search_document: "bowling alley lanes activity Astoria" },
  { id: "a-karaoke", name: "Queens Karaoke", activity_name: "Queens Karaoke", location_type: "activity", primary_category: "Karaoke", activity_type: "Karaoke", borough: "Queens", city: "New York", state: "NY", latitude: 40.751, longitude: -73.925, image_url: "https://img.test/karaoke.jpg", search_document: "karaoke rooms activity" },
  { id: "a-lounge", name: "Velvet Lounge", activity_name: "Velvet Lounge", location_type: "activity", primary_category: "Lounge", activity_type: "Lounge", borough: "Queens", city: "New York", state: "NY", latitude: 40.752, longitude: -73.928, image_url: "https://img.test/lounge.jpg", search_document: "lounge nightlife cocktails activity" },
  { id: "a-hookah", name: "Cloud Hookah Lounge", activity_name: "Cloud Hookah Lounge", location_type: "activity", primary_category: "Hookah Lounge", activity_type: "Hookah", borough: "Queens", city: "New York", state: "NY", latitude: 40.753, longitude: -73.929, image_url: "https://img.test/hookah.jpg", search_document: "hookah lounge activity" },
  { id: "a-theater", name: "Queens Theater", activity_name: "Queens Theater", location_type: "activity", primary_category: "Theater", activity_type: "Theater", borough: "Queens", city: "New York", state: "NY", latitude: 40.746, longitude: -73.845, image_url: "https://img.test/theater.jpg", search_document: "theater performing arts activity" },
  { id: "a-museum", name: "Queens Museum", activity_name: "Queens Museum", location_type: "activity", primary_category: "Museum", activity_type: "Museum", borough: "Queens", city: "New York", state: "NY", latitude: 40.745, longitude: -73.846, image_url: "https://img.test/museum.jpg", search_document: "museum gallery activity" },
  { id: "w-church", name: "Grace Church", activity_name: "Grace Church", location_type: "place_of_worship", primary_category: "Church", activity_type: "Place of Worship", borough: "Queens", city: "New York", state: "NY", latitude: 40.75, longitude: -73.92, image_url: "https://img.test/church.jpg", search_document: "church place of worship religious congregation" },
  { id: "w-temple", name: "Queens Hindu Temple", activity_name: "Queens Hindu Temple", location_type: "place_of_worship", primary_category: "Hindu Temple", activity_type: "Place of Worship", borough: "Queens", city: "New York", state: "NY", latitude: 40.752, longitude: -73.91, image_url: "https://img.test/temple.jpg", search_document: "temple hindu temple place of worship religious" },
  { id: "a-deck", name: "Sky Observation Deck", activity_name: "Sky Observation Deck", location_type: "activity", primary_category: "Observation Deck", activity_type: "Sightseeing", borough: "Manhattan", city: "New York", state: "NY", latitude: 40.75, longitude: -73.98, image_url: "https://img.test/deck.jpg", search_document: "rooftop view observation deck activity skyline" },
];

function joined(record: EnterpriseLocation) {
  return [record.primary_category, record.name, record.location_type].join(" ").toLowerCase();
}
function hasAny(record: EnterpriseLocation, terms: string[]) {
  const text = joined(record);
  return terms.some((term) => text.includes(term));
}
function clearRestaurant(record: EnterpriseLocation) {
  return Boolean(record.restaurant_name || record.cuisine || record.cuisine_type || /restaurant|dining|cafe|bakery|bistro|steakhouse|gastropub/.test(String(record.primary_category).toLowerCase()));
}
function directlyAsksForWorship(query: string) {
  return /\b(church|temple|mosque|synagogue|place of worship)\b/i.test(query);
}

const mockSupabase = {
  rpc(_name: string, params: { p_domain: SearchDomain; p_allow_places_of_worship?: boolean }) {
    const data = records.filter((record) => {
      if (!params.p_allow_places_of_worship && hasAny(record, worshipTerms)) return false;
      if (params.p_domain === "restaurant") return clearRestaurant(record);
      if (params.p_domain === "activity") return Boolean(record.activity_name || record.activity_type);
      return true;
    });
    return Promise.resolve({ data, error: null });
  },
};

const queries = [
  "birthday dinner with a lounge or activity",
  "steak dinner with bowling in Astoria",
  "hookah lounge after dinner",
  "rooftop dinner",
  "sushi or steak dinner with karaoke",
  "steak dinner with bowling or karaoke after",
  "church near me",
  "temple in Queens",
  "dinner near church",
];

async function main() {
  const { runEnterpriseSearch } = await import("../lib/search/enterprise/index");
  const { normalizeIntent, restaurantSearchTerms, activitySearchTerms } = await import("../lib/search/enterprise/normalize-intent");

  for (const query of queries) {
    const result = await runEnterpriseSearch(query, { supabase: mockSupabase, useLLM: false, displayLimit: 20 });
    const asksForWorship = directlyAsksForWorship(query) && !/^dinner\s+near\s+/i.test(query);

    if (!asksForWorship) {
      assert(!result.restaurants.some((record) => hasAny(record, worshipTerms)), `${query}: restaurants include place of worship`);
      assert(!result.activities.some((record) => hasAny(record, worshipTerms)), `${query}: activities include place of worship`);
    }

    assert(
      !result.restaurants.some((record) => hasAny(record, restaurantBlockedTerms) && !clearRestaurant(record)),
      `${query}: restaurant lane contains activity-only result`,
    );
  }

  let intent = normalizeIntent("birthday dinner with a lounge or activity");
  assert(!restaurantSearchTerms(intent).includes("activity"));
  assert(!restaurantSearchTerms(intent).includes("lounge"));
  assert(activitySearchTerms(intent).includes("lounge"));
  assert(activitySearchTerms(intent).includes("activity"));

  intent = normalizeIntent("sushi or steak dinner with karaoke");
  assert((intent.restaurantIntent.alternativeGroups ?? []).some((group) => group.includes("sushi") && group.includes("steak")));
  assert(activitySearchTerms(intent).includes("karaoke"));

  intent = normalizeIntent("steak dinner with bowling or karaoke after");
  assert(restaurantSearchTerms(intent).includes("steak"));
  assert(restaurantSearchTerms(intent).includes("dinner"));
  assert((intent.activityIntent.alternativeGroups ?? []).some((group) => group.includes("bowling") && group.includes("karaoke")));

  console.log("enterprise-search-quality passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
