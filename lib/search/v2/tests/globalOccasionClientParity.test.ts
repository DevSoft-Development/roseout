import { describe, expect, it } from "vitest";
import { buildGuidedSearchPrompt } from "../../guided/buildGuidedSearchPrompt";
import { buildSearchPlan } from "../planner/buildSearchPlan";

describe("global Search V2 occasion + client parity", () => {
  it.each([
    ["Date night in NYC", "date_night"],
    ["Girls night in Brooklyn", "girls_night"],
    ["Family outing in Queens", "family_outing"],
  ])("requires a complete paired outing for broad occasion query: %s", async (query, occasion) => {
    const plan = await buildSearchPlan({ input: { query, requestId: `occasion-${occasion}` } });
    expect(plan.occasion).toBe(occasion);
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
  });

  it("builds one canonical guided request string for web and mobile inputs", () => {
    const input = {
      query: "Date night in nyc",
      planType: "outing" as const,
      location: "New York",
      when: "No specific time",
      customDate: "2026-09-19",
      customTime: "",
      preferences: ["Romantic"],
      customMatters: ["live music"],
    };
    const expected = "Plan a restaurant and activity outing. Date night in nyc Location: New York. When: 2026-09-19. Preferences: Romantic, live music. Return the best options, ranked by fit.";
    expect(buildGuidedSearchPrompt(input)).toBe(expected);
    expect(buildGuidedSearchPrompt({ ...input })).toBe(expected);
  });

  it("preserves explicit single-domain choices even for occasion language", async () => {
    const restaurant = await buildSearchPlan({
      input: { query: "Date night in NYC", selectedLane: "restaurant", requestId: "restaurant-only" },
    });
    expect(restaurant.restaurant.required).toBe(true);
    expect(restaurant.activity.required).toBe(false);
    expect(restaurant.pairing.required).toBe(false);

    const activity = await buildSearchPlan({
      input: { query: "Girls night in Brooklyn", selectedLane: "activity", requestId: "activity-only" },
    });
    expect(activity.restaurant.required).toBe(false);
    expect(activity.activity.required).toBe(true);
    expect(activity.pairing.required).toBe(false);
  });
});
