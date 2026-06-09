import { describe, expect, it } from "vitest";
import {
  buildApplySuggestionUpdate,
  calculateGoogleMatchConfidence,
  inferFoodTermsFromGooglePlace,
  type GooglePlace,
} from "./places";

function place(overrides: Partial<GooglePlace>): GooglePlace {
  return {
    id: "places/test",
    displayName: { text: "Test Place" },
    formattedAddress: "123 Main St, Brooklyn, NY",
    primaryType: "restaurant",
    types: ["restaurant"],
    ...overrides,
  };
}

describe("Google Places enrichment food terms", () => {
  it("adds cafe/coffee shop/coffee/pastries/dessert for cafe types", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "cafe", types: ["cafe", "food"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["cafe", "coffee shop"]));
    expect(result.foodTerms).toEqual(expect.arrayContaining(["coffee", "pastries", "dessert"]));
    expect(result.featureTerms).toEqual(expect.arrayContaining(["coffee", "pastries", "dessert"]));
  });

  it("adds bakery/pastries/dessert/coffee for bakery types", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bakery", types: ["bakery", "food"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["bakery"]));
    expect(result.foodTerms).toEqual(expect.arrayContaining(["pastries", "dessert", "coffee"]));
  });

  it("adds bar drink terms but not wings", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bar", types: ["bar", "restaurant"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["bar"]));
    expect(result.featureTerms).toEqual(expect.arrayContaining(["drinks", "cocktails", "beer", "wine"]));
    expect(result.foodTerms).not.toContain("wings");
    expect(result.searchKeywords).not.toContain("wings");
  });

  it("does not add random food terms for generic restaurants", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant", types: ["restaurant", "food"] }), {});

    expect(result.categoryTerms).toEqual(["restaurant"]);
    expect(result.foodTerms).toEqual([]);
  });

  it("only adds vegan when vegan or plant based appears in evidence", () => {
    const plain = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), { search_document: "healthy salads" });
    const vegan = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), { search_document: "plant based vegan restaurant" });

    expect(plain.foodTerms).not.toContain("vegan");
    expect(vegan.foodTerms).toEqual(expect.arrayContaining(["vegan", "plant based"]));
  });

  it("only adds halal when halal appears in evidence", () => {
    const plain = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), { search_document: "middle eastern grill" });
    const halal = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), { search_document: "halal food" });

    expect(plain.foodTerms).not.toContain("halal");
    expect(halal.foodTerms).toEqual(expect.arrayContaining(["halal", "halal food"]));
  });

  it("blocks weak split tokens while keeping full phrases", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), {
      search_document: "plant based tex mex raw bar steak house filet mignon prime rib happy hour coffee shop live music bar and grill chicken wings",
    });

    expect(result.searchKeywords).toEqual(expect.arrayContaining(["plant based", "tex mex", "raw bar", "steak house", "filet mignon", "prime rib", "happy hour", "coffee shop", "live music", "chicken wings"]));
    for (const weak of ["plant", "based", "tex", "mex", "raw", "bar", "house", "filet", "mignon", "prime", "rib", "happy", "hour", "shop", "live", "and", "grill"]) {
      expect(result.searchKeywords).not.toContain(weak);
    }
  });

  it("approve suggestion merges terms without deleting old terms", () => {
    const update = buildApplySuggestionUpdate(
      {
        search_keywords: ["old keyword"],
        semantic_tags: ["old semantic"],
        intent_tags: ["old intent"],
        search_document: "old document",
      },
      {
        suggested_search_keywords: ["coffee"],
        suggested_semantic_tags: ["cafe"],
        suggested_intent_tags: ["coffee shop"],
        suggested_food_terms: ["pastries"],
        suggested_cuisine_terms: [],
        suggested_category_terms: ["cafe"],
        suggested_feature_terms: ["dessert"],
      },
    );

    expect(update.search_keywords).toEqual(["old keyword", "coffee"]);
    expect(update.semantic_tags).toEqual(["old semantic", "cafe"]);
    expect(update.intent_tags).toEqual(["old intent", "coffee shop"]);
    expect(update.search_document).toContain("old document");
    expect(update.search_document).toContain("pastries");
  });

  it("calculates high confidence for strong name, address, area, distance, phone, and website matches", () => {
    const result = calculateGoogleMatchConfidence(
      {
        name: "Test Place",
        address: "123 Main Street",
        city: "Brooklyn",
        latitude: 40,
        longitude: -73,
        phone: "(555) 111-2222",
        website: "https://example.com/menu",
      },
      place({
        displayName: { text: "Test Place" },
        formattedAddress: "123 Main St, Brooklyn, NY",
        location: { latitude: 40.0001, longitude: -73.0001 },
        nationalPhoneNumber: "+1 555-111-2222",
        websiteUri: "https://example.com",
      }),
    );

    expect(result.confidence).toBeGreaterThanOrEqual(75);
  });
});
