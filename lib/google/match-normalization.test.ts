import { describe, expect, it } from "vitest";

import { calculateGoogleMatchConfidence, type GooglePlace } from "./places";

function googlePlace(overrides: Partial<GooglePlace>): GooglePlace {
  return {
    id: "places/test",
    displayName: { text: "Test Place" },
    formattedAddress: "123 Main St, Brooklyn, NY 11201, USA",
    location: { latitude: 40.7, longitude: -73.9 },
    primaryType: "restaurant",
    types: ["restaurant"],
    ...overrides,
  };
}

describe("Google match normalization", () => {
  it("promotes La Bonbonniere above review threshold despite NYC ordinal address formatting", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "LA BONBONNIERE",
        address: "28 8 AVENUE",
        city: "Manhattan",
        state: "NY",
        latitude: 40.7379,
        longitude: -74.0044,
      },
      googlePlace({
        id: "ChIJj1NmZZVZwokRZ7t6RkyDV0o",
        displayName: { text: "La Bonbonniere" },
        formattedAddress: "28 8th Ave, New York, NY 10014, USA",
        location: { latitude: 40.7377793, longitude: -74.004359 },
        primaryType: "diner",
        types: ["diner", "breakfast_restaurant", "hamburger_restaurant", "american_restaurant", "restaurant"],
      }),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.evidence).toMatchObject({
      nameSimilarity: 1,
      addressMatch: true,
      addressConflict: false,
      areaMatch: true,
    });
  });

  it("keeps the wrong Topaze candidate rejected despite shared jerk chicken semantics", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "TOPAZE RESTAURANT & JERK CHICKEN",
        address: "1875 UTICA AVENUE",
        city: "Brooklyn",
        state: "NY",
        latitude: 40.626,
        longitude: -73.927,
      },
      googlePlace({
        id: "ChIJPT5T-JxbwokR3Irwgr9Zp-M",
        displayName: { text: "Peppa's Jerk Chicken" },
        formattedAddress: "791 Prospect Pl, Brooklyn, NY 11216, USA",
        location: { latitude: 40.6744896, longitude: -73.9504026 },
        primaryType: "chicken_restaurant",
        types: ["chicken_restaurant", "caribbean_restaurant", "restaurant"],
      }),
    );

    expect(result.confidence).toBeLessThan(55);
    expect(result.evidence).toMatchObject({
      addressMatch: false,
      addressConflict: true,
      areaMatch: true,
    });
  });
});
