import { describe, expect, it } from "vitest";
import { filterWeakMealPeriodFeatures } from "../mealPeriodEvidence";

describe("meal period evidence precedence", () => {
  it("keeps weak meal keywords before Google meal service has been checked", () => {
    expect(filterWeakMealPeriodFeatures(
      ["dinner", "date night", "brunch"],
      [],
      null,
    )).toEqual(["dinner", "date night", "brunch"]);
  });

  it("drops weak meal periods that Google did not confirm after a completed check", () => {
    expect(filterWeakMealPeriodFeatures(
      ["dinner", "date night", "breakfast", "outdoor seating"],
      ["breakfast"],
      "2026-08-09T02:21:20.000Z",
    )).toEqual(["date night", "breakfast", "outdoor seating"]);
  });

  it("keeps a weak meal keyword when Google independently confirms that period", () => {
    expect(filterWeakMealPeriodFeatures(
      ["dinner", "restaurant"],
      ["dinner"],
      "2026-08-09T02:21:20.000Z",
    )).toEqual(["dinner", "restaurant"]);
  });
});
