import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import {
  contextualRewrite,
  inferPreferenceDefaultLane,
} from "../planner/contextualLanguageRewrite";
import {
  detectVenueRelationship,
  extractNegativeConstraints,
  extractSubjectivePreferences,
} from "../planner/languageUnderstanding";

function rewrite(query: string) {
  const relationship = detectVenueRelationship(query);
  const negatives = extractNegativeConstraints(query);
  const preferences = extractSubjectivePreferences(query);
  const effectiveQuery = contextualRewrite(query, relationship, negatives);
  const preferenceDefaultLane = inferPreferenceDefaultLane(preferences);
  return { effectiveQuery, negatives, preferenceDefaultLane };
}

async function planFor(query: string) {
  const rewritten = rewrite(query);
  const plan = await buildSearchPlan({
    input: {
      query: rewritten.effectiveQuery,
      preferenceDefaultLane: rewritten.preferenceDefaultLane,
      restaurantExclusions: rewritten.negatives.restaurant,
      activityExclusions: rewritten.negatives.activity,
    },
  });
  return { ...rewritten, plan };
}

describe("search-wide language rewrite intent preservation", () => {
  it.each([
    "upscale romantic date night in Brooklyn",
    "quiet romantic date night in Queens",
  ])("keeps broad date preferences mixed without injecting a restaurant token: %s", async (query) => {
    const { effectiveQuery, plan } = await planFor(query);

    expect(effectiveQuery.toLowerCase()).not.toMatch(/\brestaurant\b/);
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
    expect(plan.occasion).toBe("date_night");
  });

  it("keeps a date-night activity exclusion without creating a positive activity-only signal", async () => {
    const { effectiveQuery, negatives, plan } = await planFor("date night, no museums");

    expect(negatives.activity).toContain("museum");
    expect(effectiveQuery.toLowerCase()).toContain("date night");
    expect(effectiveQuery.toLowerCase()).not.toMatch(/\b(?:museum|museums|activity|activities)\b/);
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.exclusions).toContain("museum");
    expect(plan.pairing.required).toBe(false);
  });

  it("preserves an explicit mixed request while carrying an activity exclusion separately", async () => {
    const { effectiveQuery, plan } = await planFor(
      "restaurant and activity but no bowling",
    );

    expect(effectiveQuery.toLowerCase()).toContain("restaurant and activity");
    expect(effectiveQuery.toLowerCase()).not.toContain("bowling");
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.exclusions).toContain("bowling");
  });

  it("preserves an explicit mixed request while carrying a restaurant exclusion separately", async () => {
    const { effectiveQuery, plan } = await planFor(
      "dinner and an activity, no seafood",
    );

    expect(effectiveQuery.toLowerCase()).toContain("dinner and an activity");
    expect(effectiveQuery.toLowerCase()).not.toContain("seafood");
    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.restaurant.exclusions).toContain("seafood");
  });

  it("does not let subjective preferences override an explicit activity request", async () => {
    const { effectiveQuery, preferenceDefaultLane, plan } = await planFor(
      "quiet bowling in Queens",
    );

    expect(preferenceDefaultLane).toBe("restaurant");
    expect(effectiveQuery.toLowerCase()).not.toContain("restaurant");
    expect(plan.mode).toBe("activity_only");
    expect(plan.restaurant.required).toBe(false);
    expect(plan.activity.required).toBe(true);
  });

  it("does not let subjective preferences override an explicit restaurant request", async () => {
    const { effectiveQuery, plan } = await planFor(
      "quiet romantic sushi in Brooklyn",
    );

    expect(effectiveQuery.toLowerCase()).not.toContain("restaurant");
    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
  });

  it("keeps the historical restaurant default for truly domainless preference searches without mutating the query", async () => {
    const { effectiveQuery, preferenceDefaultLane, plan } = await planFor(
      "upscale quiet in Brooklyn",
    );

    expect(preferenceDefaultLane).toBe("restaurant");
    expect(effectiveQuery.toLowerCase()).not.toContain("restaurant");
    expect(plan.mode).toBe("restaurant_only");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(false);
    expect(plan.parser.reasons).toContain(
      "domainless subjective preferences use the default restaurant lane without mutating query text",
    );
  });
});
