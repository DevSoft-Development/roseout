import { describe, expect, it } from "vitest";

import { buildProfileRpcAttempts } from "../retrieveProfileLocations";

describe("buildProfileRpcAttempts locality precedence", () => {
  it("tries an NYC borough before broad city fallback after an exact neighborhood miss", () => {
    const request = {
      desiredRole: "general_activity",
      retrievalTerms: ["bowling"],
      categories: ["bowling"],
      cuisines: [],
      foods: [],
      features: [],
      geo: {
        market: "NYC_CORE",
        state: "NY",
        county: "Queens County",
        borough: "Queens",
        city: "New York",
        neighborhood: "Forest Hills",
        latitude: 40.71,
        longitude: -73.87,
        radiusMiles: 3,
      },
    } as any;

    const attempts = buildProfileRpcAttempts(request, 50, true);
    const localityOrder = attempts.map((attempt) => {
      if (attempt.p_latitude != null) return "radius";
      if (attempt.p_neighborhood) return "neighborhood";
      if (attempt.p_borough) return "borough";
      if (attempt.p_city) return "city";
      if (attempt.p_county) return "county";
      if (attempt.p_market) return "market";
      if (attempt.p_state) return "state";
      return "none";
    });

    expect(localityOrder.slice(0, 4)).toEqual([
      "radius",
      "neighborhood",
      "borough",
      "city",
    ]);
  });
});
