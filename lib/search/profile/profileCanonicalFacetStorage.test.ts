import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/search/profile/buildLocationSearchProfile.ts", "utf8");

describe("location search profile facet storage", () => {
  it("stores only canonical taxonomy IDs in validated facets", () => {
    expect(source).toContain('cuisines: byFacet("cuisine")');
    expect(source).toContain('foods: byFacet("food")');
    expect(source).toContain('features: byFacet("feature")');
    expect(source).not.toContain("cuisines: sorted([...clean.cuisines");
    expect(source).not.toContain("foods: sorted([...clean.foodTerms");
    expect(source).not.toContain("features: sorted([...clean.features");
  });

  it("keeps sanitized source values as matching evidence rather than stored facet IDs", () => {
    expect(source).toContain("const clean = sanitizedSource(source)");
    expect(source).toContain("...clean.categories");
    expect(source).toContain("...clean.cuisines");
    expect(source).toContain("...clean.foodTerms");
    expect(source).toContain("...clean.features");
  });
});
