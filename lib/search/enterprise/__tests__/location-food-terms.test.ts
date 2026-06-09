import { describe, expect, it } from "vitest";
import {
  appendMissingTermsToText,
  buildFoodTermUpdate,
  buildLocationFoodTermPatch,
  mergeTextArrayTerms,
} from "../location-food-terms";

const allUpdateColumns = new Set([
  "search_keywords",
  "semantic_tags",
  "intent_tags",
  "search_document",
  "semantic_search_text",
  "cuisine",
  "cuisine_type",
  "primary_category",
]);

function expectNoWeakSplitTokens(terms: string[]) {
  expect(terms).not.toEqual(
    expect.arrayContaining([
      "plant",
      "based",
      "tex",
      "mex",
      "raw",
      "bar",
      "house",
      "filet",
      "mignon",
      "prime",
      "rib",
      "happy",
      "hour",
      "shop",
      "live",
      "and",
      "grill",
    ]),
  );
}

describe("location food term backfill helpers", () => {
  it("detects wings/chicken", () => {
    const patch = buildLocationFoodTermPatch({
      name: "Queens Hot Chicken",
      description: "Sports lounge with fried chicken and big screens.",
    });

    expect(patch.searchKeywords).toEqual(
      expect.arrayContaining(["wings", "chicken wings", "fried chicken", "bar food"]),
    );
    expect(patch.cuisineTerms).toContain("american");
    expectNoWeakSplitTokens(patch.searchKeywords);
  });

  it("detects vegan and keeps plant based without adding split tokens", () => {
    const patch = buildLocationFoodTermPatch({
      name: "Plant Based Social",
      description: "A vegan restaurant with cocktails.",
    });

    expect(patch.searchKeywords).toEqual(
      expect.arrayContaining(["vegan", "plant based", "vegan restaurant", "cocktails"]),
    );
    expect(patch.searchKeywords).not.toEqual(expect.arrayContaining(["plant", "based"]));
    expectNoWeakSplitTokens(patch.searchKeywords);
  });

  it("detects halal", () => {
    const patch = buildLocationFoodTermPatch({
      search_document: "Late night halal food near Queens",
    });

    expect(patch.searchKeywords).toEqual(
      expect.arrayContaining(["halal", "halal food", "halal restaurant"]),
    );
    expectNoWeakSplitTokens(patch.searchKeywords);
  });

  it("detects cafe/bakery/coffee/dessert", () => {
    const patch = buildLocationFoodTermPatch({
      primary_category: "Bakery",
      description: "Coffee shop with pastry, pastries, and dessert.",
    });

    expect(patch.searchKeywords).toEqual(
      expect.arrayContaining(["cafe", "coffee shop", "coffee", "bakery", "pastries", "dessert", "desserts"]),
    );
    expectNoWeakSplitTokens(patch.searchKeywords);
  });

  it("merges arrays without deleting existing old terms", () => {
    const result = mergeTextArrayTerms(["old term", "WINGS"], ["wings", "chicken wings"]);

    expect(result.merged).toEqual(["old term", "wings", "chicken wings"]);
    expect(result.added).toEqual(["chicken wings"]);
  });

  it("appends full terms only to search documents", () => {
    const result = appendMissingTermsToText("existing vegan", [
      "plant based",
      "plant",
      "based",
      "happy hour",
      "happy",
      "hour",
    ]);

    expect(result.text).toBe("existing vegan plant based happy hour");
    expect(result.text).not.toMatch(/\bplant\s+based\s+plant\b/);
    expect(result.added).toEqual(["plant based", "happy hour"]);
  });

  it("builds a dry-run-safe update preview without mutating input", () => {
    const location = {
      id: "loc_1",
      name: "Halal Burger Cafe",
      search_keywords: ["existing"],
      semantic_tags: ["old semantic"],
      intent_tags: ["old intent"],
      search_document: "existing document halal burger coffee",
      cuisine: null,
      cuisine_type: "",
      primary_category: null,
    };

    const result = buildFoodTermUpdate(location, allUpdateColumns);

    expect(result.changed).toBe(true);
    expect(result.update.search_keywords).toEqual(
      expect.arrayContaining(["existing", "burger", "halal", "coffee"]),
    );
    expect(result.update.semantic_tags).toEqual(expect.arrayContaining(["old semantic", "restaurant"]));
    expect(result.update.intent_tags).toEqual(expect.arrayContaining(["old intent", "halal food"]));
    expect(result.newSearchDocumentPreview).toContain("halal restaurant");
    expect(location.search_keywords).toEqual(["existing"]);
  });
});
