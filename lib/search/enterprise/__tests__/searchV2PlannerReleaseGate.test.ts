import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../../v2/planner/buildSearchPlan";
import { normalizeNaturalLanguageForPlanner } from "../../v2/planner/naturalLanguageNormalization";

describe("Search V2 live release-gate gaps", () => {
  it("opens both discovery lanes for a broad girls-night request without forcing a pair", async () => {
    const plan = await buildSearchPlan({
      input: { query: "girls night with drinks in Brooklyn" },
    });

    expect(plan.occasion).toBe("girls_night");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
  });

  it("opens family-safe restaurant and activity discovery for a broad family outing", async () => {
    const plan = await buildSearchPlan({
      input: { query: "family outing in Queens" },
    });

    expect(plan.occasion).toBe("family_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
    expect(plan.audience.familyFriendly).toBe(true);
    expect(plan.audience.minorsPresent).toBe(true);
  });

  it("does not create an invalid same-venue pair for a rooftop restaurant feature", async () => {
    const plan = await buildSearchPlan({
      input: { query: "seafood rooftop restaurant in Brooklyn same venue" },
    });

    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.cuisines).toContain("seafood");
    expect(plan.restaurant.features).toContain("rooftop");
    expect(plan.activity.required).toBe(false);
    expect(plan.pairing.required).toBe(false);
    expect(plan.pairing.sameVenueRequired).toBe(false);
  });

  it("keeps restaurant-bound hookah on the restaurant lane", async () => {
    const plan = await buildSearchPlan({
      input: { query: "restaurant with hookah in Forest Hills same venue" },
    });

    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.features).toContain("hookah");
    expect(plan.activity.required).toBe(false);
    expect(plan.activity.categories).not.toContain("hookah");
    expect(plan.pairing.required).toBe(false);
  });

  it("keeps restaurant-bound hookah restaurant-only across borough geography", async () => {
    const plan = await buildSearchPlan({
      input: { query: "restaurant with hookah in the Bronx" },
    });

    expect(plan.geo.borough).toBe("Bronx");
    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.features).toContain("hookah");
    expect(plan.activity.required).toBe(false);
    expect(plan.activity.categories).not.toContain("hookah");
    expect(plan.pairing.required).toBe(false);
  });

  it("still treats dinner then hookah as a sequential two-stop outing", async () => {
    const plan = await buildSearchPlan({
      input: { query: "dinner then hookah in Forest Hills" },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.categories).toContain("hookah");
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.sequence).toBe("restaurant_first");
  });

  it("turns cocktails plus a relaxing open-ended request into service and activity lanes", async () => {
    const normalized = normalizeNaturalLanguageForPlanner(
      "quiet cocktails and something relaxing in Brooklyn",
    );

    expect(normalized).toContain("cocktails restaurant");
    expect(normalized).toContain("something relaxing activity");

    const plan = await buildSearchPlan({ input: { query: normalized } });
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
  });
});
