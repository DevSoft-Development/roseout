import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("Search Core V2 planner", () => {
  it("treats group dinner and drinks as restaurant dining with cocktail features", async () => {
    const plan = await buildSearchPlan({ input: { query: "group dinner and drinks" } });
    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.restaurant.features).toContain("cocktails");
    expect(plan.activity.required).toBe(false);
    expect(plan.pairing.required).toBe(false);
  });

  it("still treats an explicit activity after dinner as a paired outing", async () => {
    const plan = await buildSearchPlan({ input: { query: "dinner and karaoke after" } });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.activity.categories).toContain("karaoke");
    expect(plan.pairing.required).toBe(true);
  });

  it("treats steak dinner with bowling as two nearby venues, not same venue", async () => {
    const plan = await buildSearchPlan({ input: { query: "steak dinner with bowling in Astoria" } });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.foods).toContain("steak");
    expect(plan.activity.categories).toContain("bowling");
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.sameVenuePreferred).toBe(false);
    expect(plan.geo.city).toBe("Astoria");
    expect(plan.geo.market).toBe("NYC");
  });
});
