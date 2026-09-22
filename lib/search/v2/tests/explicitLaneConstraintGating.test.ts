import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { scoreCandidates } from "../scoring/scoreCandidates";
import type { RoleQualifiedCandidate } from "../roles/roleTypes";

function candidate(args: {
  id: string;
  name: string;
  role: "restaurant" | "hookah_activity";
  locationType: "restaurant" | "activity";
  features?: string[];
  activityCategories?: string[];
  matchedTerms?: string[];
}): RoleQualifiedCandidate {
  return {
    candidate: {
      location: {
        id: args.id,
        name: args.name,
        location_type: args.locationType,
        features: args.features ?? [],
        activity_categories: args.activityCategories ?? [],
        rating: 4.5,
        review_count: 250,
        latitude: 40.73,
        longitude: -73.82,
      } as any,
      retrievalSources: ["enterprise_search_profile_locations"],
      matchedRetrievalTerms: args.matchedTerms ?? [],
      requestedRoles: [args.role],
      distanceMiles: 1,
      geoMatch: { tier: "exact_locality" } as any,
      retrievalGeoLevel: "borough" as any,
    },
    roles: [{
      role: args.role,
      confidence: 0.95,
      evidence: [{ field: "canonical_profile", value: args.role, strength: "authoritative" }],
    }],
  };
}

describe("explicit lane constraint gating", () => {
  it("keeps rooftop on the dinner lane and hookah on the activity lane", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "Rooftop dinner and hookah after in Queens",
        selectedLane: "auto",
      },
    });

    expect(plan.restaurant.features).toContain("rooftop");
    expect(plan.activity.categories).toContain("hookah");
    expect(plan.activity.features).not.toContain("rooftop");
    expect(plan.pairing.sequence).toBe("restaurant_first");
  });

  it("does not let generic restaurants or unrelated activities survive explicit lane constraints", async () => {
    const plan = await buildSearchPlan({
      input: {
        query: "Rooftop dinner and hookah after in Queens",
        selectedLane: "auto",
      },
    });

    const scored = await scoreCandidates({
      plan,
      candidates: [
        candidate({
          id: "restaurant-rooftop",
          name: "Skyline Rooftop",
          role: "restaurant",
          locationType: "restaurant",
          features: ["rooftop", "dinner"],
          matchedTerms: ["rooftop"],
        }),
        candidate({
          id: "restaurant-pizza",
          name: "Generic Pizzeria",
          role: "restaurant",
          locationType: "restaurant",
          features: ["pizza", "takeout"],
          matchedTerms: ["restaurant"],
        }),
        candidate({
          id: "activity-hookah",
          name: "Queens Hookah Lounge",
          role: "hookah_activity",
          locationType: "activity",
          activityCategories: ["hookah"],
          matchedTerms: ["hookah", "hookah lounge"],
        }),
        candidate({
          id: "activity-billiards",
          name: "The Billiard Company",
          role: "hookah_activity",
          locationType: "activity",
          activityCategories: ["billiards"],
          matchedTerms: ["billiards"],
        }),
      ],
    });

    expect(scored.restaurants.map((item) => item.candidate.candidate.location.name)).toEqual(["Skyline Rooftop"]);
    expect(scored.activities.map((item) => item.candidate.candidate.location.name)).toEqual(["Queens Hookah Lounge"]);
  });
});
