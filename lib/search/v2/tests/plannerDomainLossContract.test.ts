import { describe, expect, it } from "vitest";
import { detectExplicitDomainSignals, detectPlannerDomainLoss } from "../planner/explicitDomainSignals";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { validateSearchPlan } from "../planner/validateSearchPlan";

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

  it("repairs the known Garden City activity-intent loss before retrieval", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: GARDEN_CITY_QUERY,
        requestId: "planner-domain-loss-regression",
      },
    });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
    expect(plan.mode).toBe("paired_outing");
    expect(plan.parser.reasons.some((reason) => reason.includes("activity intent restored"))).toBe(true);
    expect(detectPlannerDomainLoss(GARDEN_CITY_QUERY, plan).valid).toBe(true);
  });

  it("repairs restaurant intent when the deterministic parser only retains activity", async () => {
    const query = "Italian dinner and live music in Astoria";
    const plan = await buildSearchPlan({ input: { query, requestId: "restaurant-reconciliation" } });

    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
    expect(detectPlannerDomainLoss(query, plan).valid).toBe(true);
  });

  it("retains the validator as a final invariant", () => {
    const invalidPlan = {
      rawQuery: GARDEN_CITY_QUERY,
      restaurant: { required: true },
      activity: { required: false },
      pairing: { required: false, sameVenueRequired: false, maxDistanceMiles: null, requireWalkable: false },
      geo: { radiusMiles: 8 },
      travel: { mode: "unspecified", constraint: "none" },
    } as any;

    expect(() => validateSearchPlan(invalidPlan)).toThrow("SEARCH_PLAN_DROPPED_ACTIVITY_INTENT");
  });

  it("does not require an activity for a restaurant-only request", async () => {
    const plan = await buildSearchPlan({ input: { query: "Italian dinner in Astoria" } });
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.pairing.required).toBe(false);
  });

  it("does not require a restaurant for an activity-only request", async () => {
    const plan = await buildSearchPlan({ input: { query: "Escape room near Garden City" } });
    expect(plan.restaurant.required).toBe(false);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
  });
});
