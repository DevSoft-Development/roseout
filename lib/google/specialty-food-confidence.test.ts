import { describe, expect, it } from "vitest";

import { applySpecialtyFoodConfidence } from "./specialty-food-confidence";
import type { GooglePlace } from "./places";

function suggestion(foodTerms: string[], explicitFoodEvidence: string[] = []) {
  return {
    foodTerms,
    cuisineTerms: ["italian"],
    categoryTerms: ["restaurant", "seafood restaurant"],
    featureTerms: [],
    searchKeywords: [...foodTerms, "italian", "restaurant", "seafood restaurant"],
    semanticTags: [...foodTerms, "italian", "restaurant", "seafood restaurant"],
    intentTags: [...foodTerms, "italian", "restaurant", "seafood restaurant"],
    evidence: { explicitFoodEvidence },
  };
}

describe("Google specialty food confidence hierarchy", () => {
  it("does not promote Olive Garden to seafood from an unsupported secondary specialty type", () => {
    const place: GooglePlace = {
      id: "olive-garden",
      displayName: { text: "Olive Garden Italian Restaurant" },
      primaryType: "italian_restaurant",
      types: ["italian_restaurant", "seafood_restaurant", "restaurant"],
      editorialSummary: {
        text: "Lively, family-friendly chain featuring Italian standards such as pastas & salads.",
      },
    };

    const result = applySpecialtyFoodConfidence(place, suggestion(["seafood"]));

    expect(result.foodTerms).not.toContain("seafood");
    expect(result.searchKeywords).not.toContain("seafood");
    expect(result.categoryTerms).toContain("seafood restaurant");
    expect(result.evidence).toMatchObject({
      specialtyFoodEvidenceMode: "primary_or_explicit_secondary",
      rejectedSecondarySpecialtyTypes: ["seafood_restaurant"],
    });
  });

  it("keeps El Pollo Peruano chicken when Google text explicitly supports the secondary specialty", () => {
    const place: GooglePlace = {
      id: "el-pollo-peruano",
      displayName: { text: "El Pollo Peruano" },
      primaryType: "peruvian_restaurant",
      types: ["peruvian_restaurant", "chicken_restaurant", "restaurant"],
      editorialSummary: { text: "Compact Peruvian restaurant specializing in roasted chicken." },
    };

    const result = applySpecialtyFoodConfidence(
      place,
      suggestion(["chicken"], ["chicken"]),
    );

    expect(result.foodTerms).toContain("chicken");
    expect(result.evidence).toMatchObject({
      acceptedSpecialtyTypes: ["chicken_restaurant"],
      explicitSecondarySpecialtyEvidence: ["chicken"],
    });
  });

  it("keeps a primary pizza specialty even when editorial text is absent", () => {
    const place: GooglePlace = {
      id: "pizza-place",
      displayName: { text: "Neighborhood Slice" },
      primaryType: "pizza_restaurant",
      types: ["pizza_restaurant", "restaurant"],
    };

    const result = applySpecialtyFoodConfidence(place, suggestion(["pizza"]));

    expect(result.foodTerms).toContain("pizza");
    expect(result.evidence).toMatchObject({
      acceptedSpecialtyTypes: ["pizza_restaurant"],
      rejectedSecondarySpecialtyTypes: [],
    });
  });

  it("removes unsupported secondary pizza evidence while preserving the category", () => {
    const place: GooglePlace = {
      id: "portofino",
      displayName: { text: "Portofino Ristorante" },
      primaryType: "restaurant",
      types: ["restaurant", "pizza_restaurant", "italian_restaurant"],
      editorialSummary: {
        text: "Formal setting for an Italian menu with nightly live music, plus a Sunday brunch buffet.",
      },
    };

    const result = applySpecialtyFoodConfidence(place, {
      ...suggestion(["pizza", "brunch"], ["brunch"]),
      categoryTerms: ["restaurant", "pizza restaurant", "italian restaurant"],
    });

    expect(result.foodTerms).toEqual(["brunch"]);
    expect(result.categoryTerms).toContain("pizza restaurant");
    expect(result.evidence).toMatchObject({
      rejectedSecondarySpecialtyTypes: ["pizza_restaurant"],
    });
  });
});
