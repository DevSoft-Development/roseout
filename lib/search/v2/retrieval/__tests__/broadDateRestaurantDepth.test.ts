import { describe, expect, it } from "vitest";
import type { SearchPlan } from "../../planner/searchPlanTypes";
import { buildRetrievalRequests } from "../buildRetrievalRequests";

function plan(overrides: Partial<SearchPlan> = {}): SearchPlan {
  return {
    occasion: "date_night",
    restaurant: { required: true, cuisines: [], foods: [], features: [], mealPeriods: [] },
    activity: { required: true, categories: [], features: [] },
    geo: {
      raw: "Brooklyn",
      source: "typed_location",
      city: "New York",
      state: "NY",
      county: "Kings County",
      borough: "Brooklyn",
      neighborhood: null,
      market: "NYC_CORE",
      latitude: 40.6782,
      longitude: -73.9442,
      radiusMiles: 9,
      strictness: "preferred",
    },
    ...overrides,
  } as SearchPlan;
}

describe("broad date restaurant retrieval depth", () => {
  it("adds a canonical date-dining recovery lane for a generic date search", () => {
    const requests = buildRetrievalRequests(plan());
    const restaurantRequests = requests.filter((request) => request.desiredRole === "restaurant");

    expect(restaurantRequests).toHaveLength(2);
    expect(restaurantRequests[0].retrievalTerms).toEqual([]);
    expect(restaurantRequests[1].retrievalTerms).toEqual(expect.arrayContaining([
      "dining",
      "full service",
      "table service",
      "reservations",
      "romantic",
    ]));
  });

  it("does not broaden an explicit pizza date search with a generic date-dining lane", () => {
    const explicit = plan({
      restaurant: { required: true, cuisines: [], foods: ["pizza"], features: [], mealPeriods: [] },
    } as Partial<SearchPlan>);
    const requests = buildRetrievalRequests(explicit);
    const restaurantRequests = requests.filter((request) => request.desiredRole === "restaurant");

    expect(restaurantRequests).toHaveLength(1);
  });
});
