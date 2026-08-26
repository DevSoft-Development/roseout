import { describe, expect, it } from "vitest";
import { extractNegativeConstraints } from "../planner/languageUnderstanding";
import { removeExcludedTaxonomyTerms } from "../planner/negativeIntentInvariant";

function safeQuery(query: string) {
  const negatives = extractNegativeConstraints(query);
  return {
    negatives,
    effective: removeExcludedTaxonomyTerms(query, [...negatives.restaurant, ...negatives.activity]),
  };
}

describe("negative intent invariant", () => {
  it("removes every excluded activity from Oxford-comma or lists", () => {
    const result = safeQuery("Sushi in Queens, then something fun nearby afterward, but no arcades, bowling, or karaoke.");

    expect(result.negatives.activity).toEqual(expect.arrayContaining(["arcade", "bowling", "karaoke"]));
    expect(result.effective).not.toMatch(/\barcades?\b/i);
    expect(result.effective).not.toMatch(/\bbowling\b/i);
    expect(result.effective).not.toMatch(/\bkaraoke\b/i);
    expect(result.effective).toMatch(/\bsushi\b/i);
  });

  it("removes every excluded activity from Oxford-comma and lists", () => {
    const result = safeQuery("Dinner and something fun, but no museums, arcades, and bowling.");

    expect(result.negatives.activity).toEqual(expect.arrayContaining(["museum", "arcade", "bowling"]));
    expect(result.effective).not.toMatch(/\bmuseums?\b/i);
    expect(result.effective).not.toMatch(/\barcades?\b/i);
    expect(result.effective).not.toMatch(/\bbowling\b/i);
  });

  it("keeps positive terms that were not excluded", () => {
    const result = safeQuery("Sushi then mini golf, but no karaoke or bowling");

    expect(result.effective).toMatch(/\bsushi\b/i);
    expect(result.effective).toMatch(/\bmini golf\b/i);
    expect(result.effective).not.toMatch(/\bkaraoke\b/i);
    expect(result.effective).not.toMatch(/\bbowling\b/i);
  });

  it("applies the same invariant to restaurant exclusions", () => {
    const result = safeQuery("Find dinner, but no seafood, sushi, or steakhouse");

    expect(result.negatives.restaurant).toEqual(expect.arrayContaining(["seafood", "sushi", "steakhouse"]));
    expect(result.effective).not.toMatch(/\bseafood\b/i);
    expect(result.effective).not.toMatch(/\bsushi\b/i);
    expect(result.effective).not.toMatch(/\bsteakhouse\b/i);
    expect(result.effective).toMatch(/\bdinner\b/i);
  });
});
