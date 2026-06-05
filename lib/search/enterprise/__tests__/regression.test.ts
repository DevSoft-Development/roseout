import { describe, expect, it } from "vitest";
import { classifySearchHealthEvent } from "../searchHealthLogger";
import { names, runFixturePipeline } from "./fixtures";

describe("enterprise search pure fixture regressions", () => {
  it("protects default-market rooftop walking behavior", () => {
    const result = runFixturePipeline("restaurant and rooftop drinks after walking distance");
    expect(result.marketResolution.marketApplied).toBe(true);
    expect(result.marketResolution.market?.id).toBe("nyc_long_island");
    expect(result.pairDisplayLabels.some((label) => Boolean(label?.includes("min walk")))).toBe(true);
    expect(names(result.activities).some((name) => /Rooftop|Sky Lounge/.test(name))).toBe(true);
    expect(names(result.activities)).not.toContain("Winter Garden Theatre");
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it("protects explicit Queens strict walking no-pair classification", () => {
    const result = runFixturePipeline("steak dinner and rooftop drinks 1 minute walk apart in Queens");
    expect(result.marketResolution.marketApplied).toBe(false);
    expect(result.intent.geo.borough).toBe("Queens");
    expect(result.restaurants.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.pairs.length).toBe(0);
    expect(result.noPairsReason).toBe("no_pairs_within_walking_distance");
    expect(classifySearchHealthEvent({ source: "public_create_search", restaurant_count: result.restaurants.length, activity_count: result.activities.length, pair_count: 0, wantsPairing: true, needsActivity: true, distanceMode: "walking", requireWalkablePair: true, no_pairs_reason: result.noPairsReason })).toEqual({ eventType: "no_valid_pairs", severity: "warning", eventLabel: "No valid pairs within walking distance" });
  });

  it("allows theater for seafood theatre strict walking", () => {
    const result = runFixturePipeline("seafood dinner with theatre after 2 minute walk apart");
    expect(names(result.activities).some((name) => /Theatre|Theater/.test(name))).toBe(true);
    expect(names(result.restaurants).some((name) => /Seafood|ELIAS|BLUE FIN|Bernardin/.test(name))).toBe(true);
    const classification = classifySearchHealthEvent({ source: "admin_search_lab", debugMode: true, restaurant_count: result.restaurants.length, activity_count: result.activities.length, pair_count: result.pairs.length, wantsPairing: true, needsActivity: true, distanceMode: "walking", maxPairWalkingMinutes: 2 });
    expect(["low_pair_count", "successful_debug_run"]).toContain(classification.eventType);
  });

  it("prefers lounges/bars/cocktails and suppresses theaters for girls night", () => {
    const result = runFixturePipeline("girls night dinner and drinks");
    expect(names(result.activities)).not.toContain("Winter Garden Theatre");
    expect(names(result.activities).some((name) => /Rooftop|Lounge|Bar|Skylark/.test(name))).toBe(true);
  });

  it("keeps relaxed activities from being dominated by theaters", () => {
    const result = runFixturePipeline("casual dinner and relaxed activity");
    expect(names(result.activities)).toContain("Museum of the Moving Image");
    expect(names(result.activities).slice(0, 3)).not.toContain("Winter Garden Theatre");
  });

  it("prioritizes explicit Queens/local hookah results", () => {
    const result = runFixturePipeline("hookah lounge in Queens");
    expect(result.marketResolution.marketApplied).toBe(false);
    expect(result.intent.geo.borough).toBe("Queens");
    expect(names(result.activities)[0]).toBe("Queens Hookah Lounge");
  });
});
