import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../roles/assignCandidateRoles";

const pairedCases = [
  ["Casual dinner and an arcade in Queens", "arcade_activity"],
  ["Dinner and bowling in Astoria within a 20-minute walk", "bowling_activity"],
  ["Italian dinner with live music nearby in Manhattan", "live_music_activity"],
  ["Seafood dinner with a comedy show after in Brooklyn", "comedy_activity"],
  ["Dinner and a theater show in Brooklyn", "theater_activity"],
] as const;

describe("canonical profile evidence", () => {
  it("preserves SQL-qualified terms when the raw location row omits the category", async () => {
    const plan = await buildSearchPlan({ input: { query: "Casual dinner and an arcade in Queens" } });
    const activityRequest = buildRetrievalRequests(plan).find((request) => request.desiredRole === "arcade_activity");
    expect(activityRequest).toBeDefined();

    const candidate = candidateFrom(
      { id: "activity-1", name: "Indoor Fun Center", location_type: "activity" },
      activityRequest!,
      "enterprise_search_profile_locations",
    );

    expect(candidate.matchedRetrievalTerms).toEqual(activityRequest!.retrievalTerms);
    expect(candidate.requestedRoles).toContain("arcade_activity");
    expect(candidate.retrievalSources).toContain("enterprise_search_profile_locations");
  });

  for (const [query, expectedRole] of pairedCases) {
    it(`qualifies both paired lanes from canonical profile evidence: ${expectedRole}`, async () => {
      const plan = await buildSearchPlan({ input: { query } });
      const requests = buildRetrievalRequests(plan);
      const restaurantRequest = requests.find((request) => request.desiredRole === "restaurant");
      const activityRequest = requests.find((request) => request.desiredRole === expectedRole);

      expect(plan.pairing.required).toBe(true);
      expect(restaurantRequest).toBeDefined();
      expect(activityRequest).toBeDefined();

      const restaurant = candidateFrom(
        { id: "restaurant-1", name: "Dinner Place", location_type: "restaurant" },
        restaurantRequest!,
        "enterprise_search_profile_locations",
      );
      const activity = candidateFrom(
        { id: "activity-1", name: "Venue Without Category In Raw Row", location_type: "activity" },
        activityRequest!,
        "enterprise_search_profile_locations",
      );

      const qualified = assignCandidateRoles({ plan, candidates: [restaurant, activity] });
      const restaurantRoles = qualified.find((item) => item.candidate.location.id === "restaurant-1")?.roles ?? [];
      const activityRoles = qualified.find((item) => item.candidate.location.id === "activity-1")?.roles ?? [];

      expect(restaurantRoles.some((role) => role.role === "restaurant" || role.role.endsWith("_restaurant"))).toBe(true);
      expect(activityRoles.some((role) => role.role === expectedRole)).toBe(true);
      expect(activityRoles.find((role) => role.role === expectedRole)?.evidence[0]?.field).toBe("canonical_profile");
    });
  }
});

describe("restaurant planner regressions", () => {
  it("routes Bar with wings NYC to a restaurant retrieval lane", async () => {
    const plan = await buildSearchPlan({ input: { query: "Bar with wings NYC" } });
    const requests = buildRetrievalRequests(plan);

    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.foods).toContain("wings");
    expect(requests.some((request) => request.desiredRole === "restaurant")).toBe(true);
  });
});
