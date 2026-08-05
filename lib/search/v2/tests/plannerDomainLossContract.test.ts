import { describe, expect, it } from "vitest";
import { detectExplicitDomainSignals, detectPlannerDomainLoss } from "../planner/explicitDomainSignals";
import { buildSearchPlan } from "../planner/buildSearchPlan";

const GARDEN_CITY_QUERY = "My friends and I want sushi in Garden City and an escape room afterward for a group of six, and we would rather not drive more than ten minutes between locations.";

describe("explicit domain intent contract", () => {
  it("detects restaurant and activity intent in the production regression query", () => {
    const signals = detectExplicitDomainSignals(GARDEN_CITY_QUERY);

    expect(signals.restaurant).toBe(true);
    expect(signals.activity).toBe(true);
    expect(signals.restaurantEvidence).toContain("cuisine");
    expect(signals.activityEvidence).toContain("escape_room");
  });

  it("detects a planner that silently drops activity intent", () => {
    const contract = detectPlannerDomainLoss(GARDEN_CITY_QUERY, {
      restaurant: { required: true },
      activity: { required: false },
    });

    expect(contract.valid).toBe(false);
    expect(contract.lostRestaurant).toBe(false);
    expect(contract.lostActivity).toBe(true);
  });

  it("detects a planner that silently drops restaurant intent", () => {
    const contract = detectPlannerDomainLoss("Italian dinner and live music in Astoria", {
      restaurant: { required: false },
      activity: { required: true },
    });

    expect(contract.valid).toBe(false);
    expect(contract.lostRestaurant).toBe(true);
    expect(contract.lostActivity).toBe(false);
  });

  it("blocks the known Garden City intent-loss plan before retrieval", async () => {
    await expect(buildSearchPlan({
      input: {
        query: GARDEN_CITY_QUERY,
        requestId: "planner-domain-loss-regression",
      },
    })).rejects.toThrow("SEARCH_PLAN_DROPPED_ACTIVITY_INTENT");
  });

  it("does not require an activity for a restaurant-only request", () => {
    const signals = detectExplicitDomainSignals("Italian dinner in Astoria");
    expect(signals.restaurant).toBe(true);
    expect(signals.activity).toBe(false);
  });

  it("does not require a restaurant for an activity-only request", () => {
    const signals = detectExplicitDomainSignals("Escape room near Garden City");
    expect(signals.restaurant).toBe(false);
    expect(signals.activity).toBe(true);
  });
});
