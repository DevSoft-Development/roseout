import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../retrieval/retrieveCandidates";
import { assignCandidateRoles } from "../roles/assignCandidateRoles";
import { scoreCandidates } from "../scoring/scoreCandidates";
import { buildPairs } from "../pairing/buildPairs";
import { activities } from "../taxonomy";

const pairedCases = [
  ["Casual dinner and an arcade in Queens", "arcade_activity", "arcade"],
  ["Dinner and bowling in Astoria within a 20-minute walk", "bowling_activity", "bowling"],
  ["Italian dinner with live music nearby in Manhattan", "live_music_activity", "live_music"],
  ["Seafood dinner with a comedy show after in Brooklyn", "comedy_activity", "comedy"],
  ["Dinner and a theater show in Brooklyn", "theater_activity", "theater"],
] as const;

describe("canonical profile evidence", () => {
  it("assigns exact activity roles in the canonical taxonomy", () => {
    expect(activities.arcade.eligibleRoles).toEqual(["arcade_activity"]);
    expect(activities.bowling.eligibleRoles).toEqual(["bowling_activity"]);
    expect(activities.live_music.eligibleRoles).toEqual(["live_music_activity"]);
    expect(activities.comedy.eligibleRoles).toEqual(["comedy_activity"]);
    expect(activities.theater.eligibleRoles).toEqual(["theater_activity"]);
  });

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

  for (const [query, expectedRole, category] of pairedCases) {
    it(`builds a final pair from canonical profile evidence: ${expectedRole}`, async () => {
      const plan = await buildSearchPlan({ input: { query } });
      const requests = buildRetrievalRequests(plan);
      const restaurantRequest = requests.find((request) => request.desiredRole === "restaurant");
      const activityRequest = requests.find((request) => request.desiredRole === expectedRole);

      expect(plan.pairing.required).toBe(true);
      expect(plan.activity.categories).toContain(category);
      expect(restaurantRequest).toBeDefined();
      expect(activityRequest).toBeDefined();

      const restaurant = candidateFrom(
        {
          id: `restaurant-${category}`,
          name: "Dinner Place",
          location_type: "restaurant",
          latitude: 40.75,
          longitude: -73.98,
          rating: 4.5,
          review_count: 200,
        },
        restaurantRequest!,
        "enterprise_search_profile_locations",
      );
      const activity = candidateFrom(
        {
          id: `activity-${category}`,
          name: "Venue Without Category In Raw Row",
          location_type: "activity",
          latitude: 40.751,
          longitude: -73.981,
          rating: 4.4,
          review_count: 150,
        },
        activityRequest!,
        "enterprise_search_profile_locations",
      );

      const qualified = assignCandidateRoles({ plan, candidates: [restaurant, activity] });
      const activityQualified = qualified.find((item) => item.candidate.location.id === `activity-${category}`);
      expect(activityQualified?.roles.some((role) => role.role === expectedRole)).toBe(true);
      expect(activityQualified?.roles.find((role) => role.role === expectedRole)?.evidence[0]?.field).toBe("canonical_profile");

      const scored = await scoreCandidates({ plan, candidates: qualified });
      expect(scored.restaurants.length).toBeGreaterThan(0);
      expect(scored.activities.some((item) => item.selectedRole === expectedRole)).toBe(true);

      const pairs = await buildPairs({
        plan,
        restaurants: scored.restaurants,
        activities: scored.activities,
      });
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]?.activity.selectedRole).toBe(expectedRole);
      expect(pairs[0]?.restaurant.selectedRole === "restaurant" || pairs[0]?.restaurant.selectedRole.endsWith("_restaurant")).toBe(true);
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
