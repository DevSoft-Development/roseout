import { describe, expect, it } from "vitest";
import { buildLocationFoodText, scoreCuisineCategoryMatch, scoreSignatureItemMatch } from "../cuisine-matching";

describe("signature item search relevance", () => {
  const restaurant = {
    name: "Harbor Kitchen",
    location_type: "restaurant",
    primary_category: "restaurant",
    cuisine: "american",
    signature_items: [
      "Truffle Lobster Mac and Cheese",
      "Cajun Shrimp Linguine",
      "Braised Short Rib",
    ],
    city: "Queens",
  };

  it("keeps signature items in the searchable food text", () => {
    const text = buildLocationFoodText(restaurant);
    expect(text).toContain("truffle lobster mac and cheese");
    expect(text).toContain("cajun shrimp linguine");
  });

  it("strongly scores an exact signature dish phrase", () => {
    const match = scoreSignatureItemMatch(
      restaurant,
      "restaurant with truffle lobster mac and cheese in Queens",
    );
    expect(match.score).toBeGreaterThanOrEqual(150);
    expect(match.reason).toContain("signature_exact");
  });

  it("moderately scores a meaningful partial dish match", () => {
    const match = scoreSignatureItemMatch(
      restaurant,
      "cajun shrimp dinner in Queens",
    );
    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(match.score).toBeLessThan(180);
    expect(match.reason).toContain("signature_partial");
  });

  it("does not let generic restaurant wording create a signature boost", () => {
    const match = scoreSignatureItemMatch(
      restaurant,
      "american restaurant in Queens",
    );
    expect(match.score).toBe(0);
    expect(match.reason).toBeNull();
  });

  it("adds signature relevance to the existing restaurant scorer without changing cuisine", () => {
    const scored = scoreCuisineCategoryMatch(
      restaurant,
      "truffle lobster mac and cheese in Queens",
      true,
    );
    expect(scored.score).toBeGreaterThanOrEqual(150);
    expect(scored.reasons.some((reason) => reason.startsWith("signature_exact:"))).toBe(true);
    expect(restaurant.cuisine).toBe("american");
  });
});
