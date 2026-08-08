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
  it("uses cafe type for cafe terms without inventing unsupported amenities", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "cafe", types: ["cafe", "food"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["cafe", "coffee shop"]));
    expect(result.foodTerms).toEqual(expect.arrayContaining(["coffee", "pastries", "dessert"]));
    expect(result.featureTerms).toContain("coffee");
    expect(result.featureTerms).not.toContain("dessert");
    expect(result.featureTerms).not.toContain("pastries");
  });

  it("uses bakery type for bakery terms with only conservative implied features", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bakery", types: ["bakery", "food"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["bakery"]));
    expect(result.foodTerms).toEqual(expect.arrayContaining(["pastries", "dessert", "coffee"]));
    expect(result.featureTerms).toContain("pastries");
    expect(result.featureTerms).not.toContain("coffee");
    expect(result.featureTerms).not.toContain("dessert");
  });

  it("uses bar type without inventing specific drink inventory", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bar", types: ["bar", "restaurant"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["bar"]));
    expect(result.featureTerms).toContain("drinks");
    expect(result.featureTerms).not.toContain("cocktails");
    expect(result.featureTerms).not.toContain("beer");
    expect(result.featureTerms).not.toContain("wine");
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

  it("only proposes the feature Google explicitly evidenced for the Portofino pattern", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "Portofino Ristorante" },
        primaryType: "restaurant",
        types: ["restaurant", "pizza_restaurant", "italian_restaurant", "food"],
        editorialSummary: {
          text: "Formal setting for an Italian menu with nightly live music, plus a Sunday brunch buffet.",
        },
      }),
      {
        name: "PORTOFINO",
        cuisine: "italian",
        primary_category: "italian",
      },
    );

    expect(result.featureTerms).toContain("live music");
    for (const unsupported of [
      "games",
      "arcade",
      "pool",
      "billiards",
      "karaoke",
      "mimosas",
      "bottomless mimosas",
      "wine",
    ]) {
      expect(result.featureTerms).not.toContain(unsupported);
      expect(result.searchKeywords).not.toContain(unsupported);
    }
    expect(result.evidence.featureEvidenceMode).toBe("google_explicit_or_type_implied");
  });

  it("does not turn local-only feature text into Google feature evidence", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({ primaryType: "restaurant", types: ["restaurant", "food"] }),
      { search_document: "live music karaoke pool bottomless mimosas" },
    );

    expect(result.featureTerms).toEqual([]);
    expect(result.searchKeywords).not.toContain("live music");
    expect(result.searchKeywords).not.toContain("karaoke");
    expect(result.searchKeywords).not.toContain("pool");
    expect(result.searchKeywords).not.toContain("bottomless mimosas");
  });

  it("blocks weak split tokens while keeping full food phrases", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant" }), {
      search_document: "plant based tex mex raw bar steak house filet mignon prime rib happy hour coffee shop bar and grill chicken wings",
    });

    expect(result.searchKeywords).toEqual(expect.arrayContaining(["plant based", "tex mex", "raw bar", "steak house", "filet mignon", "prime rib", "coffee shop", "chicken wings"]));
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
