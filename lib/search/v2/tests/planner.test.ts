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
    expect(plan.geo.strictness).toBe("strict");
  });

  it("preserves casual dining and relaxed activity intent", async () => {
    const plan = await buildSearchPlan({ input: { query: "casual dinner and relaxed activity" } });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.features).toContain("casual");
    expect(plan.activity.categories).toContain("relaxed_activity");
    expect(plan.pairing.required).toBe(true);
  });

  it("treats lounge after dinner as a second venue", async () => {
    const plan = await buildSearchPlan({ input: { query: "girls night dinner with a lounge after" } });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.activity.categories).toContain("lounge");
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.sequence).toBe("restaurant_first");
    expect(plan.pairing.sameVenuePreferred).toBe(false);
  });

  it("treats walking distance live music as a walkable paired outing", async () => {
    const plan = await buildSearchPlan({ input: { query: "Italian dinner within walking distance of live music" } });
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.cuisines).toContain("italian");
    expect(plan.activity.categories).toContain("live_music");
    expect(plan.pairing.required).toBe(true);
    expect(plan.pairing.requireWalkable).toBe(true);
    expect(plan.pairing.maxWalkingMinutes).toBe(30);
    expect(plan.pairing.sameVenuePreferred).toBe(false);
  });
});
