import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { detectVenueRelationship } from "../planner/languageUnderstanding";

const plan = (query: string) => buildSearchPlan({ input: { query, selectedLane: "auto" } as any });

const controlWords = new Set([
  "show",
  "pair",
  "paired",
  "pairing",
  "complete",
  "something",
  "afterward",
  "afterwards",
  "nice",
  "lively",
  "vibe",
]);

function expectNoControlFoodTerms(foods: readonly string[]) {
  for (const food of foods) {
    const tokens = String(food).toLowerCase().split(/\s+/).filter(Boolean);
    expect(tokens.some((token) => controlWords.has(token))).toBe(false);
  }
}

describe("Search V2 production intent intelligence", () => {
  it("keeps dinner plus comedy as a paired outing without treating show as food", async () => {
    const result = await plan("Plan a restaurant and activity outing. dinner and comedy show near me. Return the best options, ranked by fit.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain("comedy");
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("preserves the activity lane in open-ended date-night language", async () => {
    const result = await plan("Plan a date night with a nice restaurant and something fun to do after near me.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("keeps Caribbean as restaurant intent and pair as control language", async () => {
    const result = await plan("Find me a Caribbean restaurant for dinner and pair it with an activity nearby.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.cuisines).toContain("caribbean");
    expect(result.activity.required).toBe(true);
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("keeps bowling in the activity lane instead of complete in the food lane", async () => {
    const result = await plan("I want dinner and bowling tonight. Show me the best complete outing options near me.");
    expect(result.mode).toBe("paired_outing");
    expect(result.activity.categories).toContain("bowling");
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("keeps Queens dinner plus comedy as a paired outing", async () => {
    const result = await plan("Plan dinner and a comedy show in Queens. Prioritize sit-down restaurants suitable for a night out.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expect(result.activity.categories).toContain("comedy");
    expect(result.geo.borough).toBe("Queens");
    expect(result.restaurant.foods).toEqual([]);
  });

  it("keeps rooftop dinner restaurant-only when rooftop modifies the restaurant", async () => {
    const result = await plan("rooftop dinner in Brooklyn");
    expect(result.mode).toBe("restaurant_only");
    expect(result.restaurant.required).toBe(true);
    expect(result.restaurant.features).toContain("rooftop");
    expect(result.activity.required).toBe(false);
    expect(result.activity.categories).not.toContain("rooftop");
  });

  it("keeps seafood rooftop restaurant restaurant-only", async () => {
    const result = await plan("seafood rooftop restaurant in Queens");
    expect(result.mode).toBe("restaurant_only");
    expect(result.restaurant.cuisines).toContain("seafood");
    expect(result.restaurant.features).toContain("rooftop");
    expect(result.activity.required).toBe(false);
    expect(result.activity.categories).not.toContain("rooftop");
  });

  it("still treats explicit rooftop drinks after dinner as a second stop", async () => {
    const result = await plan("dinner in Manhattan then rooftop drinks");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
  });

  it("does not invent same-venue intent for girls night", async () => {
    const query = "Find me a restaurant and activity for girls night with drinks and a lively vibe.";
    const relationship = detectVenueRelationship(query);
    const result = await plan(query);
    expect(relationship.type).not.toBe("same_venue_required");
    expect(result.mode).toBe("paired_outing");
    expect(result.pairing.sameVenueRequired).toBe(false);
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
  });

  it("preserves romantic dinner plus an activity afterward", async () => {
    const result = await plan("Plan a romantic dinner and an activity afterward in Brooklyn.");
    expect(result.mode).toBe("paired_outing");
    expect(result.activity.required).toBe(true);
    expect(result.geo.borough).toBe("Brooklyn");
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("preserves the activity lane for a steakhouse plus something fun", async () => {
    const result = await plan("Find a steakhouse and something fun to do nearby. I want a full night-out experience.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expectNoControlFoodTerms(result.restaurant.foods);
  });

  it("keeps an explicit deli quick-bite request restaurant-only", async () => {
    const result = await plan("Find me a quick bite at a deli near me.");
    expect(result.mode).toBe("restaurant_only");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(false);
  });

  it("keeps takeout plus something to do afterward as a paired outing", async () => {
    const result = await plan("I want takeout or fast casual food and something nearby to do afterward.");
    expect(result.mode).toBe("paired_outing");
    expect(result.restaurant.required).toBe(true);
    expect(result.activity.required).toBe(true);
    expectNoControlFoodTerms(result.restaurant.foods);
  });
});
