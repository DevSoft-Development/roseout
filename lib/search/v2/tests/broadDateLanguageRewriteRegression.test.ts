import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { contextualRewrite } from "../planner/contextualLanguageRewrite";
import {
  detectVenueRelationship,
  extractNegativeConstraints,
  extractSubjectivePreferences,
} from "../planner/languageUnderstanding";

function rewrite(query: string) {
  const relationship = detectVenueRelationship(query);
  const negatives = extractNegativeConstraints(query);
  const preferences = extractSubjectivePreferences(query);
  const effectiveQuery = contextualRewrite(
    query,
    relationship,
    negatives,
    preferences,
  );
  return { effectiveQuery, negatives };
}

describe("broad date language rewrite regressions", () => {
  it.each([
    "upscale romantic date night in Brooklyn",
    "quiet romantic date night in Queens",
  ])("does not turn broad date preferences into restaurant-only intent: %s", async (query) => {
    const { effectiveQuery, negatives } = rewrite(query);

    expect(effectiveQuery.toLowerCase()).not.toMatch(/\brestaurant\b/);

    const plan = await buildSearchPlan({
      input: {
        query: effectiveQuery,
        restaurantExclusions: negatives.restaurant,
        activityExclusions: negatives.activity,
      },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(false);
    expect(plan.occasion).toBe("date_night");
  });

  it("keeps a date-night activity exclusion without creating a positive activity-only signal", async () => {
    const { effectiveQuery, negatives } = rewrite("date night, no museums");

    expect(negatives.activity).toContain("museum");
    expect(effectiveQuery.toLowerCase()).toContain("date night");
    expect(effectiveQuery.toLowerCase()).not.toMatch(/\b(?:museum|museums|activity|activities)\b/);

    const plan = await buildSearchPlan({
      input: {
        query: effectiveQuery,
        restaurantExclusions: negatives.restaurant,
        activityExclusions: negatives.activity,
      },
    });

    expect(plan.mode).toBe("paired_outing");
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.activity.exclusions).toContain("museum");
    expect(plan.pairing.required).toBe(false);
  });

  it("still gives a domainless preference-only request a restaurant lane", () => {
    const { effectiveQuery } = rewrite("upscale quiet in Brooklyn");
    expect(effectiveQuery.toLowerCase()).toMatch(/\brestaurant\b/);
  });
});
