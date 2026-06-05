import { describe, expect, it } from "vitest";
import { toDisplayLabel } from "../../../displayLabel";

describe("visible label cleanup", () => {
  it("title-cases raw visible labels", () => {
    expect(toDisplayLabel("Fine_dining")).toBe("Fine Dining");
    expect(toDisplayLabel("fine_dining")).toBe("Fine Dining");
    expect(toDisplayLabel("rooftop_bar")).toBe("Rooftop Bar");
    expect(toDisplayLabel("cocktail-lounge")).toBe("Cocktail Lounge");
  });
});
