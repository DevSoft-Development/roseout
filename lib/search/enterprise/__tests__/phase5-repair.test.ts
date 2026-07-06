import { describe, expect, it } from "vitest";
import { filterResultsBySearchDomain } from "../../domainFilters";
import { detectDuplicateSearchLocations } from "../../duplicateLocations";
import { shapePublicSearchCard } from "../../resultCards";
import { scoreActivityQuality } from "../ranking";
import type { EnterpriseLocation, SearchIntent } from "../types";

const baseIntent: SearchIntent = {
  rawQuery: "brunch and activity nearby",
  searchType: "mixed_outing",
  primaryDomain: "mixed",
  needsRestaurant: true,
  needsActivity: true,
  wantsPairing: true,
  pairingIntent: "nearby_pair",
  pairingPreference: { requiresPairing: true, distanceMode: "nearby", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  restaurantIntent: { mealTerms: ["brunch"], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  activityIntent: { activityTerms: ["activity"], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
  geo: { aliases: [], geoStrictness: "default_market" },
  vibe: [],
  strictness: "medium",
};

describe("Phase 5 repair helpers", () => {
  it("keeps activity records out of final restaurant-domain results", () => {
    const restaurant = { id: "r1", name: "Chicken Lunch", location_type: "restaurant", cuisine: "chicken" } as EnterpriseLocation;
    const nightlife = { id: "a1", name: "Night Lounge", location_type: "activity", activity_type: "nightlife", google_types: ["restaurant"] } as any;
    const filtered = filterResultsBySearchDomain({ restaurants: [restaurant, nightlife], activities: [], intent: { ...baseIntent, searchType: "restaurant", primaryDomain: "restaurant", needsActivity: false, wantsPairing: false } });
    expect(filtered.restaurants).toEqual([restaurant]);
  });

  it("rejects invalid pair sides and same-record pairs", () => {
    const restaurant = { id: "r1", name: "Taco Spot", location_type: "restaurant", cuisine: "mexican" } as EnterpriseLocation;
    const activity = { id: "a1", name: "Bowling", location_type: "activity", activity_type: "bowling" } as EnterpriseLocation;
    const bad = { id: "a2", name: "Club", location_type: "activity", activity_type: "nightlife" } as EnterpriseLocation;
    const filtered = filterResultsBySearchDomain({ restaurants: [], activities: [], pairs: [{ restaurant, activity, score: 1 } as any, { restaurant: bad, activity, score: 1 } as any, { restaurant, activity: restaurant, score: 1 } as any], intent: baseIntent });
    expect(filtered.pairs).toHaveLength(1);
  });

  it("does not add sports-watch reasons or penalties to non-sports activity scoring", () => {
    const activity = { id: "a1", name: "Sports-ish Bowling", location_type: "activity", activity_type: "bowling", primary_category: "sports bar", description: "TVs and screens", rating: 4.7, review_count: 500, images: ["https://cdn.example.com/bowling.jpg"] } as EnterpriseLocation;
    scoreActivityQuality(activity, baseIntent);
    const reasons = ((activity as any).activityQualityReasons ?? []).join(" ");
    const penalties = ((activity as any).activityQualityPenalties ?? []).join(" ");
    expect(reasons).not.toMatch(/sports\/game-watch fit|bar\/pub fit for sports-watch query/);
    expect(penalties).not.toMatch(/missing sports bar\/TV\/game-watch signal/);
  });

  it("keeps sports-watch scoring for explicit sports viewing queries", () => {
    const activity = { id: "sports", name: "Harlem Sports Bar", location_type: "activity", activity_type: "sports bar", primary_category: "sports bar", description: "sports bar with TVs, big screens, live NBA games, Knicks watch party", rating: 4.7, review_count: 500, images: ["https://cdn.example.com/sports.jpg"] } as EnterpriseLocation;
    scoreActivityQuality(activity, { ...baseIntent, rawQuery: "best bar to watch the Knicks game in Harlem", activityIntent: { ...baseIntent.activityIntent, activityTerms: ["sports bar", "watch knicks game"], categoryTerms: ["sports bar"] } });
    expect(((activity as any).activityQualityReasons ?? []).join(" ")).toMatch(/sports\/game-watch fit|bar\/pub fit for sports-watch query/);
  });

  it("reports no duplicate-location health issues for unique results", () => {
    const result = detectDuplicateSearchLocations({
      restaurants: [{ id: "r1", name: "Cafe A", address: "1 Main St" }],
      activities: [{ id: "a1", name: "Bowling A", address: "2 Main St" }],
      pairs: [],
    });
    expect(result).toEqual({ duplicateLocationShown: false, duplicateLocationCount: 0, duplicateLocationErrors: [], duplicateLocationWarnings: [], duplicateLocationKeys: [] });
  });

  it("reports duplicate ids in restaurants and activities", () => {
    const restaurants = [{ id: "dup", name: "A" }, { id: "dup", name: "A copy" }];
    const activities = [{ id: "act", name: "B" }, { id: "act", name: "B copy" }];
    const result = detectDuplicateSearchLocations({ restaurants, activities, pairs: [] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(result.duplicateLocationErrors.join(" ")).toMatch(/Duplicate restaurants id shown: dup/);
    expect(result.duplicateLocationErrors.join(" ")).toMatch(/Duplicate activities id shown: act/);
    expect(result.duplicateLocationKeys).toEqual(expect.arrayContaining(["restaurants:id:dup", "activities:id:act"]));
  });

  it("reports repeated pairs and same-location pair sides", () => {
    const restaurant = { id: "r1", name: "A" };
    const activity = { id: "a1", name: "B" };
    const result = detectDuplicateSearchLocations({ pairs: [{ restaurant, activity }, { restaurant, activity }, { restaurant, activity: restaurant }] });
    expect(result.duplicateLocationShown).toBe(true);
    expect(result.duplicateLocationErrors.join(" ")).toMatch(/Duplicate pair shown/);
    expect(result.duplicateLocationErrors.join(" ")).toMatch(/Same location shown on both sides/);
  });

  it("warns for same name and address with different ids but not same brand at different addresses", () => {
    const result = detectDuplicateSearchLocations({ restaurants: [
      { id: "1", name: "Brand", address: "1 Main St", city: "NYC" },
      { id: "2", name: "Brand", address: "1 Main St", city: "NYC" },
      { id: "3", name: "Brand", address: "2 Main St", city: "NYC" },
    ] });
    expect(result.duplicateLocationWarnings).toHaveLength(1);
    expect(result.duplicateLocationWarnings[0]).toMatch(/same name and address/i);
  });

  it("dedupes public card images and excludes main from gallery", () => {
    const one = shapePublicSearchCard({ id: "1", name: "One", image_url: "https://cdn.example.com/one.jpg", main_image: "https://cdn.example.com/one.jpg", images: ["https://cdn.example.com/one.jpg"], gallery_images: ["https://cdn.example.com/one.jpg"] });
    expect(one.image_url).toBe("https://cdn.example.com/one.jpg");
    expect(one.main_image).toBe("https://cdn.example.com/one.jpg");
    expect(one.images).toEqual(["https://cdn.example.com/one.jpg"]);
    expect(one.gallery_images).toEqual([]);

    const multi = shapePublicSearchCard({ id: "2", name: "Two", main_image: "https://cdn.example.com/main.jpg", images: ["https://cdn.example.com/main.jpg", "https://cdn.example.com/side.jpg", "https://cdn.example.com/side.jpg"], gallery_images: ["https://cdn.example.com/main.jpg", "https://cdn.example.com/third.jpg"] });
    expect(multi.images).toEqual(["https://cdn.example.com/main.jpg", "https://cdn.example.com/side.jpg", "https://cdn.example.com/third.jpg"]);
    expect(multi.gallery_images).toEqual(["https://cdn.example.com/side.jpg", "https://cdn.example.com/third.jpg"]);
  });
});
