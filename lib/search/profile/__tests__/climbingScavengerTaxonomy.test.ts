import { describe, expect, it } from "vitest";
import { buildLocationSearchProfile } from "../buildLocationSearchProfile";

describe("climbing and scavenger hunt profile taxonomy", () => {
  it("classifies Watson Adventures as a scavenger hunt from its explicit name", () => {
    const profile = buildLocationSearchProfile({
      id: "watson-adventures",
      name: "Watson Adventures Scavenger Hunts",
      locationType: "activity",
      activityType: "birthday",
      primaryCategory: "birthday",
      categories: ["activity", "birthday"],
      cuisines: [],
      foodTerms: [],
      features: [],
    });

    expect(profile.activityCategories).toContain("scavenger_hunt");
    expect(profile.canonicalTerms).toContain("scavenger hunt");
  });

  it("classifies a canonical Gravity Vault record as rock climbing", () => {
    const profile = buildLocationSearchProfile({
      id: "gravity-vault",
      name: "The Gravity Vault - Montclair, NJ",
      locationType: "activity",
      activityType: "rock_climbing",
      primaryCategory: "rock_climbing",
      categories: ["activity", "rock_climbing", "sports_complex", "gym"],
      cuisines: [],
      foodTerms: [],
      features: [],
    });

    expect(profile.activityCategories).toContain("rock_climbing");
    expect(profile.canonicalTerms).toContain("climbing gym");
    expect(profile.activityCategories).not.toContain("yoga");
  });
});
