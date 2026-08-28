import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

const source = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "First Party Rich Venue",
  restaurantName: "First Party Rich Venue",
  locationType: "restaurant",
  primaryCategory: "restaurant",
  features: [
    "outdoor seating",
    "reservations",
    "private dining",
    "group friendly",
    "watch sports",
    "rooftop",
    "waterfront",
    "dog friendly",
    "kid friendly",
    "wheelchair accessible",
    "parking",
    "takeout",
    "delivery",
    "raw bar",
    "omakase",
    "tasting menu",
    "prix fixe",
    "late night",
    "live music",
    "hookah",
  ],
  active: true,
  searchable: true,
  hidden: false,
  isLowLevel: false,
};

describe("first-party rich venue feature taxonomy", () => {
  it("preserves official-site features in canonical search facets", () => {
    const profile = buildLocationSearchProfile(source);

    expect(profile.primaryDomain).toBe("restaurant");
    expect(profile.restaurantCategories).toContain("sports_bar");
    expect(profile.activityCategories).toEqual(expect.arrayContaining(["live_music", "hookah"]));
    expect(profile.mealPeriods).toContain("late_night");
    expect(profile.features).toEqual(expect.arrayContaining([
      "outdoor_seating",
      "reservations",
      "private_dining",
      "group_friendly",
      "big_screens",
      "rooftop",
      "waterfront",
      "pet_friendly",
      "family_friendly",
      "wheelchair_accessible",
      "parking",
      "takeout",
      "delivery",
      "raw_bar",
      "omakase",
      "tasting_menu",
      "prix_fixe",
    ]));
  });

  it("treats first-party feature fields as authoritative taxonomy evidence", () => {
    const profile = buildLocationSearchProfile(source);
    for (const term of ["reservations", "private_dining", "group_friendly", "big_screens", "outdoor_seating"]) {
      expect(profile.classificationSources[term]).toContain("authoritative_location_fields");
    }
  });
});
