import { describe, expect, it } from "vitest";

import { inferFoodTermsFromGooglePlace, type GooglePlace } from "./places";

function place(overrides: Partial<GooglePlace>): GooglePlace {
  return {
    id: "test-place",
    displayName: { text: "Test Place" },
    types: [],
    ...overrides,
  };
}

describe("Google cuisine confidence hierarchy", () => {
  it("keeps Olive Garden Italian without accepting unsupported Mediterranean secondary cuisine", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "Olive Garden Italian Restaurant" },
        primaryType: "italian_restaurant",
        types: [
          "italian_restaurant",
          "mediterranean_restaurant",
          "seafood_restaurant",
          "bar",
          "restaurant",
        ],
        editorialSummary: {
          text: "Lively, family-friendly chain featuring Italian standards such as pastas & salads.",
        },
      }),
      {},
    );

    expect(result.cuisineTerms).toContain("italian");
    expect(result.cuisineTerms).not.toContain("mediterranean");
    expect(result.evidence).toMatchObject({
      cuisineEvidenceMode: "primary_or_explicit_secondary",
      acceptedCuisineTypes: ["italian_restaurant"],
      rejectedSecondaryCuisineTypes: ["mediterranean_restaurant"],
    });
  });

  it("keeps Hudson Hound Irish and accepts explicitly supported American secondary cuisine", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "Hudson Hound" },
        primaryType: "irish_restaurant",
        types: ["irish_restaurant", "american_restaurant", "pub", "restaurant"],
        editorialSummary: {
          text: "This homey pub with a fireplace boasts a cut-above-the-usual American-Irish menu.",
        },
      }),
      {},
    );

    expect(result.cuisineTerms).toEqual(expect.arrayContaining(["irish", "american"]));
    expect(result.evidence).toMatchObject({
      acceptedCuisineTypes: expect.arrayContaining(["irish_restaurant", "american_restaurant"]),
      explicitSecondaryCuisineEvidence: ["american"],
    });
  });

  it("accepts Portofino Italian when its primary type is generic restaurant but Google text is explicit", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "Portofino Ristorante" },
        primaryType: "restaurant",
        types: ["restaurant", "pizza_restaurant", "italian_restaurant"],
        editorialSummary: {
          text: "Formal setting for an Italian menu with nightly live music, plus a Sunday brunch buffet.",
        },
      }),
      {},
    );

    expect(result.cuisineTerms).toContain("italian");
    expect(result.evidence).toMatchObject({
      explicitSecondaryCuisineEvidence: ["italian"],
    });
  });

  it("accepts El Pollo Peruano primary Peruvian cuisine", () => {
    const result = inferFoodTermsFromGooglePlace(
      place({
        displayName: { text: "El Pollo Peruano" },
        primaryType: "peruvian_restaurant",
        types: ["peruvian_restaurant", "chicken_restaurant", "restaurant"],
        editorialSummary: {
          text: "Compact Peruvian restaurant specializing in roasted chicken.",
        },
      }),
      {},
    );

    expect(result.cuisineTerms).toEqual(["peruvian"]);
    expect(result.categoryTerms).toEqual(
      expect.arrayContaining(["restaurant", "peruvian restaurant", "chicken restaurant"]),
    );
  });
});
