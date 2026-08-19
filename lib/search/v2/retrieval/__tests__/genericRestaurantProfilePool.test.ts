import { describe, expect, it } from "vitest";
import { buildProfileRpcAttempts } from "../retrieveProfileLocations";
import type { RetrievalRequest } from "../retrievalTypes";

describe("generic restaurant profile retrieval", () => {
  it("still queries canonical restaurant profiles when no cuisine or feature terms are present", () => {
    const request: RetrievalRequest = {
      desiredRole: "restaurant",
      cuisines: [],
      foods: [],
      categories: [],
      features: [],
      retrievalTerms: [],
      eligibleStorageTypes: ["restaurant", "activity", "nightlife"],
      geo: {
        market: "NYC_CORE",
        state: "NY",
        county: "Kings County",
        borough: "Brooklyn",
        city: "New York",
        neighborhood: null,
        latitude: 40.6782,
        longitude: -73.9442,
        radiusMiles: 9,
      },
    };

    const attempts = buildProfileRpcAttempts(request, 60, true);

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]).toMatchObject({
      p_query: "",
      p_categories: [],
      p_domain: "restaurant",
      p_latitude: 40.6782,
      p_longitude: -73.9442,
      p_radius_miles: 9,
      p_limit: 60,
    });
    expect(attempts.some((attempt) => attempt.p_borough === "Brooklyn")).toBe(true);
  });
});
