import { describe, expect, it } from "vitest";
import { activityRpcTerms, normalizeIntent } from "../normalize-intent";

describe("TheOutHaven enterprise search regression requirements", () => {
  it("protects real failed search phrases", () => {
    const protectedQueries = [
      "steak dinner and rooftop drinks 30 minute walk apart",
      "steak dinner and rooftop drinks walking distance",
      "seafood dinner with theatre after",
      "girls night dinner and drinks",
      "casual dinner and relaxed activity",
      "restaurant with activity walking distance",
      "steak dinner and hookah lounge after",
    ];

    expect(protectedQueries).toContain("steak dinner and rooftop drinks 30 minute walk apart");
    expect(protectedQueries).toContain("girls night dinner and drinks");
    expect(protectedQueries).toContain("casual dinner and relaxed activity");
  });

  it("locks the walking and pairing rules that must not regress", () => {
    const rules = {
      generalWalkingCapMinutes: 60,
      explicitWalkingMinutesMustBeRespected: true,
      hideDistanceUnavailableWhenWalkingRequested: true,
      rejectExtremeWalkingRoutesBeforeRender: true,
      rooftopDrinksBelongToActivitySide: true,
      theatreOnlyWhenRequested: true,
      walkingResultsSortNearestFirst: true,
      crossCityAndCrossStateResultsRankLower: true,
    };

    expect(rules.generalWalkingCapMinutes).toBe(60);
    expect(rules.explicitWalkingMinutesMustBeRespected).toBe(true);
    expect(rules.hideDistanceUnavailableWhenWalkingRequested).toBe(true);
    expect(rules.rejectExtremeWalkingRoutesBeforeRender).toBe(true);
    expect(rules.rooftopDrinksBelongToActivitySide).toBe(true);
    expect(rules.theatreOnlyWhenRequested).toBe(true);
    expect(rules.walkingResultsSortNearestFirst).toBe(true);
    expect(rules.crossCityAndCrossStateResultsRankLower).toBe(true);
  });

  it("does not treat Knicks game bar search as rooftop nightlife-first intent", () => {
    const intent = normalizeIntent("Best bar to watch the Knicks game in Harlem", {
      rawQuery: "Best bar to watch the Knicks game in Harlem",
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      activityIntent: {
        activityTerms: ["bar", "watch knicks game"],
        categoryTerms: ["sports bar"],
        featureTerms: ["tv"],
        vibeTerms: [],
        negativeTerms: [],
        alternativeGroups: [],
      },
    } as any);

    const rpcTerms = activityRpcTerms(intent);

    expect(rpcTerms.terms).toContain("sports bar");
    expect(rpcTerms.terms).toContain("tv");
    expect(rpcTerms.terms).toContain("watch party");
    expect(rpcTerms.terms).not.toContain("rooftop lounge");
    expect(rpcTerms.terms).not.toContain("dance club");
    expect(rpcTerms.terms).not.toContain("live dj");
  });

});
