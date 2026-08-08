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

  it("accepts Starbucks brand expansion when location evidence is strong", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "STARBUCKS",
        address: "540 COLUMBUS AVENUE",
        city: "Manhattan",
        state: "NY",
        latitude: 40.78682,
        longitude: -73.9722,
      },
      googlePlace({
        displayName: { text: "Starbucks Coffee Company" },
        formattedAddress: "540 Columbus Ave, New York, NY 10024, USA",
        location: { latitude: 40.786702, longitude: -73.972251 },
        primaryType: "coffee_shop",
        types: ["coffee_shop", "cafe", "restaurant"],
      }),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.evidence).toMatchObject({
      brandNameContainment: true,
      addressMatch: true,
      addressConflict: false,
      areaMatch: true,
    });
  });

  it("treats alphanumeric storefront suffixes as the same base address", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "GOLDEN KRUST CARIBBEAN BAKERY & GRILL",
        address: "1014 NOSTRAND AVENUE",
        city: "Brooklyn",
        state: "NY",
        latitude: 40.6638,
        longitude: -73.9511,
      },
      googlePlace({
        displayName: { text: "Golden Krust Caribbean Restaurant" },
        formattedAddress: "1014A Nostrand Ave, Brooklyn, NY 11225, USA",
        location: { latitude: 40.6636752, longitude: -73.951134 },
        primaryType: "caribbean_restaurant",
        types: ["caribbean_restaurant", "bakery", "restaurant"],
      }),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.evidence).toMatchObject({
      addressMatch: true,
      addressConflict: false,
      areaMatch: true,
    });
  });

  it("allows a close adjacent storefront only with an exact strong name and same street", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "PIZZA WAGON",
        address: "8606 5 AVENUE",
        city: "Brooklyn",
        state: "NY",
        latitude: 40.62148,
        longitude: -74.02645,
      },
      googlePlace({
        displayName: { text: "Pizza Wagon" },
        formattedAddress: "8610 5th Ave, Brooklyn, NY 11209, USA",
        location: { latitude: 40.6213271, longitude: -74.0265881 },
        primaryType: "pizza_restaurant",
        types: ["pizza_restaurant", "italian_restaurant", "restaurant"],
      }),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(55);
    expect(result.evidence).toMatchObject({
      addressMatch: false,
      addressConflict: false,
      sameStreet: true,
      adjacentStorefrontTolerance: true,
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
      brandNameContainment: false,
      addressMatch: false,
      addressConflict: true,
      adjacentStorefrontTolerance: false,
      areaMatch: true,
    });
  });
});
