import { describe, expect, it } from "vitest";
import type { SearchIntentGraph } from "@/lib/search-framework";
import { RuleBasedSearchV3IntentProvider } from "@/lib/search/v3";
import { shouldApplyDomainFacetSqlFilters } from "@/lib/search/v3/retrieval/supabaseStructuredRetrievalProvider";
import { constraintAppliesToSupportedDomains } from "@/lib/search/v3/eligibility/supabaseHardEligibilityProvider";
import { semanticDomains } from "@/lib/search/v3/semantic/supabaseSemanticRetrievalProvider";

describe("Search V3 multi-domain intent handling", () => {
  it("detects restaurant plus activity without collapsing the intent", async () => {
    const intent = await new RuleBasedSearchV3IntentProvider().parse({
      requestId: "multi-domain-intent",
      query: "Italian dinner and bowling in Queens",
    });

    expect(intent.domains).toEqual(["restaurant", "activity"]);
    expect(intent.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "cuisine", value: "italian" }),
      expect.objectContaining({ key: "meal_period", value: "dinner" }),
      expect.objectContaining({ key: "activity_type", value: "bowling" }),
      expect.objectContaining({ key: "borough", value: "Queens" }),
    ]));
  });

  it("does not AND restaurant and activity facet filters at SQL retrieval time", () => {
    expect(shouldApplyDomainFacetSqlFilters(multiDomainIntent())).toBe(false);
    expect(shouldApplyDomainFacetSqlFilters(singleDomainIntent())).toBe(true);
  });

  it("scopes hard constraints to the candidate domain for multi-domain intent", () => {
    const intent = multiDomainIntent();
    const restaurant = new Set(["restaurant"]);
    const activity = new Set(["activity"]);

    expect(
      constraintAppliesToSupportedDomains("cuisine", restaurant, intent),
    ).toBe(true);
    expect(
      constraintAppliesToSupportedDomains("activity_type", restaurant, intent),
    ).toBe(false);

    expect(
      constraintAppliesToSupportedDomains("cuisine", activity, intent),
    ).toBe(false);
    expect(
      constraintAppliesToSupportedDomains("meal_period", activity, intent),
    ).toBe(false);
    expect(
      constraintAppliesToSupportedDomains("activity_type", activity, intent),
    ).toBe(true);

    expect(
      constraintAppliesToSupportedDomains("borough", restaurant, intent),
    ).toBe(true);
    expect(
      constraintAppliesToSupportedDomains("borough", activity, intent),
    ).toBe(true);
  });

  it("queries both semantic index domains with one multi-domain intent", () => {
    expect(semanticDomains(multiDomainIntent())).toEqual([
      "restaurant",
      "activity",
    ]);
    expect(semanticDomains(singleDomainIntent())).toEqual(["restaurant"]);
  });
});

function multiDomainIntent(): SearchIntentGraph {
  return {
    ...singleDomainIntent(),
    rawQuery: "Italian dinner and bowling in Queens",
    domains: ["restaurant", "activity"],
    constraints: [
      {
        key: "cuisine",
        value: "italian",
        strength: "hard",
        source: "explicit",
        confidence: 1,
      },
      {
        key: "meal_period",
        value: "dinner",
        strength: "hard",
        source: "explicit",
        confidence: 1,
      },
      {
        key: "activity_type",
        value: "bowling",
        strength: "hard",
        source: "explicit",
        confidence: 1,
      },
      {
        key: "borough",
        value: "Queens",
        strength: "hard",
        source: "explicit",
        confidence: 1,
      },
    ],
  };
}

function singleDomainIntent(): SearchIntentGraph {
  return {
    contractVersion: "search-intent-v3-alpha.1",
    rawQuery: "Italian dinner in Queens",
    domains: ["restaurant"],
    primaryDomain: "restaurant",
    constraints: [],
    anchor: null,
    travelMode: "unspecified",
    maxTravelMinutes: null,
    occasion: null,
    partySize: null,
    sequencing: "single",
    ambiguity: { requiresClarification: false, unresolved: [] },
    metadata: {},
  };
}
