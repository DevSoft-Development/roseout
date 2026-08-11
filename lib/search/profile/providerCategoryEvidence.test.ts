import { describe, expect, it } from "vitest";
import { filterProviderCategoryTypes } from "./providerCategoryEvidence";

describe("filterProviderCategoryTypes", () => {
  it("drops secondary yoga_studio evidence from a non-yoga sports venue", () => {
    expect(
      filterProviderCategoryTypes({
        name: "The Gravity Vault - Montclair, NJ",
        activityType: "birthday",
        primaryCategory: "birthday",
        googleTypes: [
          "yoga_studio",
          "fitness_center",
          "gym",
          "sports_school",
          "sports_complex",
          "sports_activity_location",
          "point_of_interest",
          "establishment",
        ],
      }),
    ).not.toContain("yoga_studio");
  });

  it("preserves yoga_studio when the canonical identity is explicitly yoga", () => {
    expect(
      filterProviderCategoryTypes({
        name: "Harbor Yoga Studio",
        activityType: "yoga",
        primaryCategory: "wellness",
        googleTypes: ["yoga_studio", "fitness_center", "health"],
      }),
    ).toContain("yoga_studio");
  });

  it("leaves unrelated provider types untouched", () => {
    expect(
      filterProviderCategoryTypes({
        name: "The Shed",
        activityType: "cultural",
        googleTypes: ["point_of_interest", "establishment"],
      }),
    ).toEqual(["point_of_interest", "establishment"]);
  });
});
