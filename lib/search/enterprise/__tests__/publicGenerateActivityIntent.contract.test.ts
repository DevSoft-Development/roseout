import { describe, expect, it } from "vitest";

import "@/lib/search/performance";
import { parseEnterpriseIntent } from "../intent-parser";
import { activitySearchTerms } from "../normalize-intent";
import { createPairingDebug, createSearchPairs } from "../pairing";

const activityQueries = [
  "Romantic Italian dinner with live jazz in Manhattan tonight",
  "Italian dinner with jazz music in Queens",
  "Italian dinner with a jazz performance in Brooklyn",
  "Italian dinner with a jazz club in Manhattan",
  "Italian dinner with karaoke in Queens",
  "Sushi dinner with an escape room in Garden City",
  "Brunch with bowling in Brooklyn",
  "Dinner with a comedy show in Manhattan",
  "Dinner with paint and sip in Queens",
  "Dinner with a museum in Manhattan",
  "Dinner with axe throwing in Westchester",
  "Dinner with pottery in Brooklyn",
  "Dinner with virtual reality in Queens",
  "Dinner with a spa in Manhattan",
  "Dinner with a scenic walk in Long Island",
];

function restaurantFixture() {
  return {
    id: "restaurant-italian",
    name: "Italian Dinner Fixture",
    restaurant_name: "Italian Dinner Fixture",
    location_type: "restaurant",
    cuisine: "Italian",
    cuisine_type: "Italian",
    primary_category: "Italian restaurant",
    city: "New York",
    state: "NY",
    market: "NYC_CORE",
    latitude: 40.758,
    longitude: -73.9855,
    image_url: "https://example.com/restaurant.jpg",
    is_searchable: true,
  } as any;
}

function activityFixture() {
  return {
    id: "activity-jazz",
    name: "Live Jazz Fixture",
    activity_name: "Live Jazz Fixture",
    location_type: "activity",
    activity_type: "live music",
    primary_category: "jazz club",
    tags: ["live jazz", "jazz music", "jazz performance", "jazz club"],
    city: "New York",
    state: "NY",
    market: "NYC_CORE",
    latitude: 40.761,
    longitude: -73.982,
    image_url: "https://example.com/activity.jpg",
    is_searchable: true,
  } as any;
}

describe("public generate search-wide activity contract", () => {
  it.each(activityQueries)(
    "keeps restaurant and activity requirements for %s",
    async (query) => {
      const parsed = await parseEnterpriseIntent(query, {
        useLLM: false,
        useFastPath: true,
        body: { selectedSearchLane: "auto" },
      });

      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(parsed.intent.wantsPairing).toBe(true);
      expect(parsed.intent.primaryDomain).toBe("mixed");
      expect(activitySearchTerms(parsed.intent).length).toBeGreaterThan(0);
      expect(parsed.intent.sameLocationRequired).toBe(false);
    },
  );

  it("evaluates a restaurant and activity pair for the reported live-jazz query", async () => {
    const query =
      "Romantic Italian dinner with live jazz in Manhattan tonight";
    const parsed = await parseEnterpriseIntent(query, {
      useLLM: false,
      useFastPath: true,
      body: { selectedSearchLane: "auto" },
    });
    const debug = createPairingDebug();
    const pairs = createSearchPairs(
      [restaurantFixture()],
      [activityFixture()],
      parsed.intent,
      debug,
    );

    expect(parsed.intent.needsRestaurant).toBe(true);
    expect(parsed.intent.needsActivity).toBe(true);
    expect(parsed.intent.wantsPairing).toBe(true);
    expect(activitySearchTerms(parsed.intent)).toEqual(
      expect.arrayContaining(["live jazz", "jazz club"]),
    );
    expect(debug.pairCandidatesEvaluated).toBeGreaterThan(0);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("keeps same venue as a preference without disabling nearby fallback pairing", async () => {
    const parsed = await parseEnterpriseIntent(
      "Romantic Italian dinner with live jazz in Manhattan tonight",
      {
        useLLM: false,
        useFastPath: true,
        body: { selectedSearchLane: "auto" },
      },
    );

    expect(parsed.intent.sameVenuePreferred).toBe(true);
    expect(parsed.intent.sameLocationRequired).toBe(false);
    expect(parsed.intent.needsActivity).toBe(true);
    expect(parsed.intent.wantsPairing).toBe(true);
  });
});
