import { describe, expect, it } from "vitest";
import { applyFinalRestaurantEligibility } from "../finalRestaurantEligibility";

function restaurant(overrides: Record<string, unknown>) {
  return {
    id: "r1",
    name: "Restaurant",
    location_type: "restaurant",
    has_photos: true,
    photo_status: "has_photo",
    main_image: "https://example.com/photo.jpg",
    rating: 4.5,
    review_count: 100,
    ...overrides,
  };
}

function activity() {
  return {
    id: "a1",
    name: "Comedy Club",
    location_type: "activity",
    has_photos: true,
    photo_status: "has_photo",
    main_image: "https://example.com/activity.jpg",
  };
}

function baseResult(restaurants: any[], pairs: any[] = []) {
  return {
    success: true,
    restaurants,
    activities: [activity()],
    matched_locations: [],
    matchedLocations: [],
    pairs,
    cards: [...pairs, ...restaurants, activity()],
    builder: { restaurants: [...restaurants], activities: [activity()] },
    builder_restaurants: [...restaurants],
    card_counts: { restaurants: restaurants.length, activities: 1, pairs: pairs.length, cards: pairs.length + restaurants.length + 1 },
    cardCounts: { restaurants: restaurants.length, activities: 1, pairs: pairs.length, cards: pairs.length + restaurants.length + 1 },
    debug: {},
  } as any;
}

describe("final restaurant eligibility", () => {
  it("rejects low-level-review restaurants from normal discovery searches", () => {
    const storefront = restaurant({
      id: "dosa-hutt",
      name: "DOSA HUTT",
      primary_category: "indian",
      quality_status: "low_level_review",
      google_types: ["indian_restaurant", "restaurant", "food"],
    });
    const dinner = restaurant({
      id: "dinner",
      name: "Dinner House",
      primary_category: "american",
      quality_status: "publish_ready",
      reservable: true,
    });

    const filtered = applyFinalRestaurantEligibility(baseResult([storefront, dinner]), "Queens dinner", new Date("2026-10-02T12:00:00Z"));
    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
  });

  it("rejects explicitly seasonal restaurants outside their month range", () => {
    const patio = restaurant({
      id: "patio",
      name: "THE PATIO GRILL (June-August only)",
      restaurant_name: "THE PATIO GRILL (June-August only)",
      primary_category: "american",
      quality_status: "publish_ready",
    });
    const dinner = restaurant({
      id: "dinner",
      name: "Dinner House",
      primary_category: "american",
      quality_status: "publish_ready",
      reservable: true,
    });

    const filtered = applyFinalRestaurantEligibility(baseResult([patio, dinner]), "Queens dinner", new Date("2026-10-02T12:00:00Z"));
    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
  });

  it("keeps explicitly seasonal restaurants during their active months", () => {
    const patio = restaurant({
      id: "patio",
      name: "THE PATIO GRILL (June-August only)",
      restaurant_name: "THE PATIO GRILL (June-August only)",
      primary_category: "american",
      quality_status: "publish_ready",
    });

    const filtered = applyFinalRestaurantEligibility(baseResult([patio]), "Queens dinner", new Date("2026-07-15T12:00:00Z"));
    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["patio"]);
  });

  it("removes delis from normal dinner results and from generated pairs", () => {
    const deli = restaurant({ id: "deli", name: "George's Deli", primary_category: "deli" });
    const dinner = restaurant({ id: "dinner", name: "Kokomo Restaurant & Lounge", primary_category: "caribbean", reservable: true });
    const result = baseResult([deli, dinner], [
      { restaurant: deli, activity: activity(), restaurant_location_id: "deli" },
      { restaurant: dinner, activity: activity(), restaurant_location_id: "dinner" },
    ]);

    const filtered = applyFinalRestaurantEligibility(result, "dinner and comedy show");

    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
    expect(filtered.pairs).toHaveLength(1);
    expect((filtered.pairs[0] as any).restaurant.id).toBe("dinner");
    expect((filtered as any).builder.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
  });

  it("removes Yardies-shaped weak generic restaurants from normal outings", () => {
    const yardies = restaurant({
      id: "yardies",
      name: "Yardies Jerk - Saint Albans",
      primary_category: "caribbean",
      rating: 4.0,
      review_count: 1095,
      google_types: ["restaurant", "food", "point_of_interest", "establishment"],
      reservable: false,
      dine_in: false,
      takeout: true,
    });

    const filtered = applyFinalRestaurantEligibility(baseResult([yardies]), "caribbean dinner and comedy");
    expect(filtered.restaurants).toEqual([]);
  });

  it("keeps deli and quick-service candidates when the user explicitly asks for them", () => {
    const deli = restaurant({ id: "deli", name: "George's Deli", primary_category: "deli" });
    const filtered = applyFinalRestaurantEligibility(baseResult([deli]), "quick bite at a deli near me");
    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["deli"]);
  });

  it("does not suppress a full-service restaurant merely because it offers takeout", () => {
    const fullService = restaurant({
      id: "full-service",
      name: "Dinner House",
      google_types: ["restaurant", "meal_takeaway"],
      dine_in: true,
      takeout: true,
      reservable: true,
    });
    const filtered = applyFinalRestaurantEligibility(baseResult([fullService]), "dinner near me");
    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["full-service"]);
  });

  it("sanitizes the nested searchV2 payload used by the guided create UI", () => {
    const deli = restaurant({ id: "deli", name: "George's Deli", primary_category: "deli" });
    const dinner = restaurant({ id: "dinner", name: "Kokomo Restaurant & Lounge", primary_category: "caribbean", reservable: true });
    const deliPair = { restaurant: deli, activity: activity(), restaurant_location_id: "deli" };
    const dinnerPair = { restaurant: dinner, activity: activity(), restaurant_location_id: "dinner" };
    const topLevel = baseResult([deli, dinner], [deliPair, dinnerPair]);
    topLevel.searchV2 = baseResult([deli, dinner], [deliPair, dinnerPair]);

    const filtered = applyFinalRestaurantEligibility(topLevel, "dinner and comedy show") as any;

    expect(filtered.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
    expect(filtered.searchV2.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
    expect(filtered.searchV2.pairs).toHaveLength(1);
    expect(filtered.searchV2.pairs[0].restaurant.id).toBe("dinner");
    expect(filtered.searchV2.cards.some((item: any) => item?.id === "deli" || item?.restaurant?.id === "deli")).toBe(false);
    expect(filtered.searchV2.builder.restaurants.map((item: any) => item.id)).toEqual(["dinner"]);
  });
});
