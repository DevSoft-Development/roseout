import { describe, expect, it } from "vitest";
import { scoreDateSuitability } from "../dateSuitability";

describe("Search V2 date suitability ranking", () => {
  it("strongly boosts full-service date-night restaurant evidence", () => {
    const result = scoreDateSuitability(
      "romantic intimate full-service restaurant with table service, reservations, cocktails, and a prix fixe dinner menu",
    );

    expect(result.adjustment).toBeGreaterThanOrEqual(18);
    expect(result.fit).toBe("strong");
  });

  it("softly demotes counter-service and takeout-first restaurants without excluding them", () => {
    const result = scoreDateSuitability(
      "fast-casual counter service restaurant focused on takeout, grab-and-go, and quick service",
    );

    expect(result.adjustment).toBeLessThanOrEqual(-20);
    expect(result.fit).toBe("poor");
  });

  it.each([
    "TONY'S PIZZA II pizzeria Brooklyn pizza shop",
    "neighborhood deli and sandwich shop",
    "bakery and bagel shop",
    "food truck serving tacos",
    "smoothie shop and juice bar",
    "ice cream shop and dessert counter",
    "coffee shop with counter ordering",
    "bodega and convenience market",
    "burger joint with quick counter service",
  ])("softly demotes quick-service concept evidence with no sit-down date evidence: %s", (text) => {
    const result = scoreDateSuitability(text);

    expect(result.adjustment).toBeLessThanOrEqual(-18);
    expect(result.negativeSignals).toContain("quick-service concept evidence without sit-down date evidence");
  });

  it("does not penalize a full-service concept merely because its category can also be casual", () => {
    const result = scoreDateSuitability(
      "wood-fired pizzeria with full-service table service, reservations, intimate dining, cocktails, and wine",
    );

    expect(result.adjustment).toBeGreaterThanOrEqual(7);
    expect(result.negativeSignals).not.toContain("quick-service concept evidence without sit-down date evidence");
  });

  it("keeps unknown restaurant service style neutral", () => {
    const result = scoreDateSuitability("Caribbean restaurant serving roti and curries in Brooklyn");

    expect(result.adjustment).toBe(0);
    expect(result.fit).toBe("neutral");
  });

  it("does not over-penalize a full-service restaurant merely because takeout is available", () => {
    const result = scoreDateSuitability(
      "full-service sit-down restaurant with table service and reservations; takeout is also available",
    );

    expect(result.adjustment).toBeGreaterThanOrEqual(0);
    expect(result.positiveSignals).toContain("sit-down/full-service evidence");
  });
});
