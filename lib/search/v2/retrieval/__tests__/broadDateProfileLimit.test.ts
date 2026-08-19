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
  it("expands the generic broad date restaurant lane to 150", () => {
    expect(profileRetrievalLimit(plan(), request())).toBe(150);
  });

  it("keeps the date-dining recovery lane bounded at 60", () => {
    expect(profileRetrievalLimit(plan(), request({ retrievalTerms: ["full service", "romantic"] }))).toBe(60);
  });

  it("keeps explicit restaurant searches at 60", () => {
    expect(profileRetrievalLimit(plan({
      restaurant: {
        required: true,
        cuisines: ["pizza"],
        foods: [],
        features: [],
        mealPeriods: [],
      },
    } as Partial<SearchPlan>), request())).toBe(60);
  });

  it("keeps activity retrieval at 60", () => {
    expect(profileRetrievalLimit(plan(), request({ desiredRole: "general_activity" }))).toBe(60);
  });
});
