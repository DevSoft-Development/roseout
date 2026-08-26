import { describe, expect, it } from "vitest";
import type { SearchPlan } from "../../planner/searchPlanTypes";
import type { RetrievalRequest } from "../retrievalTypes";
import { profileRetrievalLimit } from "../retrieveCandidates";
import { buildProfileRpcParams } from "../retrieveProfileLocations";

function plan(overrides: Partial<SearchPlan> = {}) {
  return {
    occasion: "date_night",
    restaurant: {
      required: true,
      cuisines: [],
      foods: [],
      features: [],
      mealPeriods: [],
    },
    ...overrides,
  } as unknown as SearchPlan;
}

function request(overrides: Partial<RetrievalRequest> = {}) {
  return {
    desiredRole: "restaurant",
    cuisines: [],
    foods: [],
    categories: [],
    features: [],
    retrievalTerms: [],
    eligibleStorageTypes: ["restaurant"],
    geo: {},
    ...overrides,
  } as unknown as RetrievalRequest;
}

describe("profile candidate scouting", () => {
  it("uses the broad date hint to scout the full 250 lightweight candidates", () => {
    const hint = profileRetrievalLimit(plan(), request());
    expect(hint).toBe(80);
    expect(buildProfileRpcParams(request(), hint).p_limit).toBe(250);
  });

  it("scouts 200 lightweight candidates for normal restaurant searches", () => {
    const explicitPlan = plan({
      restaurant: {
        required: true,
        cuisines: ["pizza"],
        foods: [],
        features: [],
        mealPeriods: [],
      },
    } as Partial<SearchPlan>);
    const hint = profileRetrievalLimit(explicitPlan, request());
    expect(hint).toBe(50);
    expect(buildProfileRpcParams(request(), hint).p_limit).toBe(200);
  });

  it("scouts 200 lightweight candidates for activity searches", () => {
    const activityRequest = request({ desiredRole: "general_activity" });
    const hint = profileRetrievalLimit(plan(), activityRequest);
    expect(hint).toBe(50);
    expect(buildProfileRpcParams(activityRequest, hint).p_limit).toBe(200);
  });
});
