import { describe, expect, it } from "vitest";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

describe("V2 builder and anchor compatibility contract", () => {
  it("exposes individual candidates beside pairs", () => {
    const restaurant = { id: "r1", name: "Restaurant" } as any;
    const activity = { id: "a1", name: "Activity" } as any;
    const response = adaptV2ResponseToCurrentPublicContract({
      version: "public-search-v2",
      success: true,
      requestFulfilled: true,
      partialResults: false,
      requestId: "request-1",
      requestedMode: "paired_outing",
      resolvedMode: "paired_outing",
      primaryDomain: "mixed",
      primary_domain: "mixed",
      displayMode: "pairs",
      searchPlan: { anchor: { requested: false } } as any,
      restaurants: [restaurant],
      activities: [activity],
      sameVenueResults: [],
      pairs: [{ restaurant, activity, distanceMiles: 1, walkingMinutes: 20, score: 90 }],
      builder: { enabled: true, restaurants: [restaurant], activities: [activity] },
      anchor: { requested: false, resolved: false, rawName: null, location: null, context: null },
      counts: { restaurantCards: 1, activityCards: 1, sameVenueCards: 0, pairs: 1, displayedResults: 1, retrievedCandidates: 2, restaurantCandidates: 1, activityCandidates: 1, dualRoleCandidates: 0 } as any,
      fallback: { used: false, reason: null },
      message: "ok",
      timing: {},
      ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "disabled" },
    });

    expect(response.pairs).toHaveLength(1);
    expect(response.restaurants).toHaveLength(1);
    expect(response.activities).toHaveLength(1);
    expect(response.builder.enabled).toBe(true);
  });

  it("preserves a resolved anchor for the create page", () => {
    const location = { id: "anchor-1", name: "Gaming City" } as any;
    const response = adaptV2ResponseToCurrentPublicContract({
      version: "public-search-v2",
      success: true,
      requestFulfilled: true,
      partialResults: false,
      requestId: "request-2",
      requestedMode: "anchored_nearby",
      resolvedMode: "anchored_nearby",
      primaryDomain: "anchor",
      primary_domain: "anchor",
      displayMode: "restaurant_cards",
      searchPlan: { anchor: { requested: true, rawName: "Gaming City" } } as any,
      restaurants: [], activities: [], sameVenueResults: [], pairs: [],
      builder: { enabled: false, restaurants: [], activities: [] },
      anchor: { requested: true, resolved: true, rawName: "Gaming City", location, context: { mode: "anchored_nearby", anchorRequested: true, anchorResolved: true } },
      counts: { restaurantCards: 0, activityCards: 0, sameVenueCards: 0, pairs: 0, displayedResults: 0, retrievedCandidates: 0, restaurantCandidates: 0, activityCandidates: 0, dualRoleCandidates: 0 } as any,
      fallback: { used: false, reason: null }, message: "ok", timing: {},
      ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "disabled" },
    });

    expect(response.anchor_location).toEqual(location);
    expect(response.search_context.mode).toBe("anchored_nearby");
  });
});
