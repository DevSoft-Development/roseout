import { describe, expect, it } from "vitest";
import type { SearchPlan } from "../../planner/searchPlanTypes";
import type { RetrievalRequest } from "../retrievalTypes";
import { profileRetrievalLimit } from "../retrieveCandidates";

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

describe("broad date profile retrieval limits", () => {
  it("keeps a larger generic date pool without returning 150 full location rows", () => {
    expect(profileRetrievalLimit(plan(), request())).toBe(80);
  });

  it("keeps the date-dining recovery lane bounded at 50", () => {
    expect(profileRetrievalLimit(plan(), request({ retrievalTerms: ["full service", "romantic"] }))).toBe(50);
  });

  it("keeps explicit restaurant searches at 50", () => {
    expect(profileRetrievalLimit(plan({
      restaurant: {
        required: true,
        cuisines: ["pizza"],
        foods: [],
        features: [],
        mealPeriods: [],
      },
    } as Partial<SearchPlan>), request())).toBe(50);
  });

  it("keeps activity retrieval at 50", () => {
    expect(profileRetrievalLimit(plan(), request({ desiredRole: "general_activity" }))).toBe(50);
  });
});
