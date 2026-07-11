import { describe, expect, it } from "vitest";
import {
  filterAnchoredRestaurantResults,
  isBakeryOnlyRestaurant,
  queryAllowsBakeryResults,
} from "../anchoredRestaurantEligibility";
import type { EnterpriseLocation } from "../types";

function row(
  name: string,
  overrides: Partial<EnterpriseLocation> = {},
): EnterpriseLocation {
  return {
    id: name,
    name,
    location_type: "restaurant",
    ...overrides,
  };
}

describe("anchored restaurant eligibility", () => {
  it("excludes bakery-only businesses from a generic restaurant query", () => {
    expect(
      isBakeryOnlyRestaurant(
        row("J & M BAKERY", { primary_category: "Bakery" }),
        "Restaurant near Gaming City in Astoria",
      ),
    ).toBe(true);
  });

  it("keeps bakery results when the user requests bakery or cafe intent", () => {
    const bakery = row("J & M BAKERY", { primary_category: "Bakery" });

    expect(isBakeryOnlyRestaurant(bakery, "Bakery near Gaming City")).toBe(
      false,
    );
    expect(isBakeryOnlyRestaurant(bakery, "Cafe near Gaming City")).toBe(
      false,
    );
    expect(queryAllowsBakeryResults("Coffee and pastries near Gaming City")).toBe(
      true,
    );
  });

  it("keeps a bakery-branded business with explicit full-meal signals", () => {
    expect(
      isBakeryOnlyRestaurant(
        row("Maria Bakery Restaurant", {
          primary_category: "Dominican restaurant and bakery",
        }),
        "Restaurant near Gaming City",
      ),
    ).toBe(false);
  });

  it("backfills from later eligible candidates after filtering", () => {
    const result = filterAnchoredRestaurantResults(
      [
        row("J & M BAKERY", { primary_category: "Bakery" }),
        row("Restaurant One", { primary_category: "Restaurant" }),
        row("Restaurant Two", { primary_category: "Restaurant" }),
      ],
      "Restaurant near Gaming City",
      2,
    );

    expect(result.excludedBakeryOnlyCount).toBe(1);
    expect(result.results.map((item) => item.name)).toEqual([
      "Restaurant One",
      "Restaurant Two",
    ]);
  });
});
