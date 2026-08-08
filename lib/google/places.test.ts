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

describe("Google Places enrichment direct evidence", () => {
  it("uses cafe type as a category without inventing food inventory", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "cafe", types: ["cafe", "food"] }), {});

    expect(result.categoryTerms).toContain("cafe");
    expect(result.foodTerms).toEqual([]);
    expect(result.featureTerms).toEqual([]);
    expect(result.searchKeywords).not.toContain("pastries");
    expect(result.searchKeywords).not.toContain("dessert");
  });

  it("uses bakery type as a category without inventing cafe, coffee, or pastries", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bakery", types: ["bakery", "food"] }), {});

    expect(result.categoryTerms).toEqual(["bakery"]);
    expect(result.foodTerms).toEqual([]);
    expect(result.featureTerms).toEqual([]);
    expect(result.searchKeywords).not.toContain("cafe");
    expect(result.searchKeywords).not.toContain("coffee");
    expect(result.searchKeywords).not.toContain("pastries");
  });

  it("uses bar type as a category without inventing drink inventory", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "bar", types: ["bar", "restaurant"] }), {});

    expect(result.categoryTerms).toEqual(expect.arrayContaining(["bar", "restaurant"]));
    expect(result.featureTerms).toEqual([]);
    expect(result.searchKeywords).not.toContain("cocktails");
    expect(result.searchKeywords).not.toContain("beer");
    expect(result.searchKeywords).not.toContain("wine");
  });

  it("does not add random food terms for generic restaurants", () => {
    const result = inferFoodTermsFromGooglePlace(place({ primaryType: "restaurant", types: ["restaurant", "food"] }), {});

    expect(result.categoryTerms).toEqual(["restaurant"]);
    expect(result.foodTerms).toEqual([]);
  });

  it("ignores local-only vegan and halal text because it is not Google evidence", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({ primaryType: "restaurant", types: ["restaurant", "food"] }),
      { search_document: "plant based vegan halal restaurant" },
    );

    expect(result.foodTerms).not.toContain("vegan");
    expect(result.foodTerms).not.toContain("halal");
    expect(result.searchKeywords).not.toContain("vegan");
    expect(result.searchKeywords).not.toContain("halal");
  });

  it("accepts explicit vegan and halal Google text", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        primaryType: "restaurant",
        types: ["restaurant", "food"],
        editorialSummary: { text: "A vegan restaurant serving halal dishes." },
      }),
      {},
    );

    expect(result.foodTerms).toEqual(expect.arrayContaining(["vegan", "halal"]));
  });

  it("derives cuisine from explicit Google cuisine types", () => {
    const peruvian = inferFoodTermsFromGooglePlace(
      place({ primaryType: "peruvian_restaurant", types: ["peruvian_restaurant", "restaurant", "food"] }),
      {},
    );
    const italian = inferFoodTermsFromGooglePlace(
      place({ primaryType: "italian_restaurant", types: ["italian_restaurant", "restaurant", "food"] }),
      {},
    );

    expect(peruvian.cuisineTerms).toContain("peruvian");
    expect(peruvian.categoryTerms).toEqual(expect.arrayContaining(["restaurant", "peruvian restaurant"]));
    expect(italian.cuisineTerms).toContain("italian");
    expect(italian.categoryTerms).toEqual(expect.arrayContaining(["restaurant", "italian restaurant"]));
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

    expect(result.cuisineTerms).toContain("italian");
    expect(result.foodTerms).toEqual(expect.arrayContaining(["pizza", "brunch"]));
    expect(result.featureTerms).toEqual(["live music"]);
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
      expect(result.searchKeywords).not.toContain(unsupported);
    }
    expect(result.evidence.evidenceMode).toBe("google_direct_evidence_only");
    expect(result.evidence.featureEvidenceMode).toBe("google_explicit_text_only");
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

  it("keeps Hudson Hound evidence narrow instead of expanding into cafe and bakery bundles", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "Hudson Hound" },
        primaryType: "irish_restaurant",
        types: [
          "irish_restaurant",
          "bar_and_grill",
          "cocktail_bar",
          "irish_pub",
          "pub",
          "dessert_restaurant",
          "bar",
          "american_restaurant",
          "restaurant",
          "food",
        ],
        editorialSummary: {
          text: "This homey pub with a fireplace & tin ceiling boasts a cut-above-the-usual American-Irish menu.",
        },
      }),
      { search_document: "coffee pastries cake cafe bakery" },
    );

    expect(result.cuisineTerms).toEqual(expect.arrayContaining(["irish", "american"]));
    expect(result.categoryTerms).toEqual(
      expect.arrayContaining(["restaurant", "irish restaurant", "american restaurant", "pub", "bar", "bar and grill", "cocktail bar", "dessert restaurant"]),
    );
    expect(result.featureTerms).toEqual(["fireplace"]);
    for (const unsupported of ["cafe", "bakery", "coffee", "pastries", "pastry", "cake", "dessert", "desserts"]) {
      expect(result.foodTerms).not.toContain(unsupported);
      expect(result.searchKeywords).not.toContain(unsupported);
    }
  });

  it("keeps full explicit phrases without split-token pollution", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        primaryType: "restaurant",
        editorialSummary: { text: "Chicken wings with happy hour cocktails and live music." },
      }),
      {},
    );

    expect(result.foodTerms).toContain("chicken wings");
    expect(result.featureTerms).toEqual(expect.arrayContaining(["happy hour", "cocktails", "live music"]));
    for (const weak of ["happy", "hour", "live", "chicken", "wings"]) {
      if (weak === "chicken" || weak === "wings") continue;
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
