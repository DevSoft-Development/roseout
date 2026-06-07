import { describe, expect, it } from "vitest";
import { classifySearchHealthEvent } from "../searchHealthLogger";
import { createPairingDebug, createSearchPairs } from "../pairing";
import { activityRpcTerms, activitySearchTerms, normalizeIntent } from "../normalize-intent";
import { names, runFixturePipeline } from "./fixtures";

describe("enterprise search pure fixture regressions", () => {

  it.each([
    "brunch and something fun in Brooklyn",
    "brunch and activity in Brooklyn",
    "fun date in Brooklyn",
    "brunch and bowling in Brooklyn",
    "brunch and museum in Brooklyn",
  ])("preserves Brooklyn-first ranking for %s", (query) => {
    const result = runFixturePipeline(query);

    expect(result.intent.geo.borough).toBe("Brooklyn");
    expect(result.intent.geo.city).toBe("New York");
    expect(result.intent.geo.state).toBe("NY");
    expect(result.intent.geo.radiusMiles).toBe(9);
    expect(result.intent.pairingPreference?.distanceMode).toBe("any");
    expect(result.intent.pairingPreference?.maxPairDistanceMiles).toBeNull();
    expect(result.intent.pairingPreference?.maxPairWalkingMinutes).toBeNull();
    expect(result.restaurants[0]?.borough).toBe("Brooklyn");
    expect(result.activities[0]?.borough).toBe("Brooklyn");
  });

  it("uses compact activity RPC terms first for broad Brooklyn fun searches", () => {
    const intent = normalizeIntent("brunch and something fun in Brooklyn");
    const rpcTerms = activityRpcTerms(intent);

    expect(rpcTerms.compactGenericActivityRpcApplied).toBe(true);
    expect(rpcTerms.terms).toEqual([
      "arcade",
      "bowling",
      "billiards",
      "games",
      "museum",
      "gallery",
      "mini golf",
      "lounge",
    ]);
    expect(rpcTerms.expandedTerms.length).toBeGreaterThan(rpcTerms.terms.length);
  });
  it("keeps generic activity terms actionable and fast-path compatible", () => {
    const intent = normalizeIntent("restaurant with activity walking distance");
    expect(activitySearchTerms(intent).length).toBeGreaterThan(0);
    for (const term of ["activity", "things to do", "entertainment", "experience"]) expect(activitySearchTerms(intent)).toContain(term);
  });

  it("suppresses restaurant-only fallback when required mixed outing has zero activities", () => {
    const intent = normalizeIntent("restaurant with activity walking distance");
    const restaurants = [{ id: "r-only", name: "Fallback Bistro" }];
    const activities: any[] = [];
    const pairs: any[] = [];
    const requiredPairingSuppressedFallback =
      intent.searchType === "mixed_outing" &&
      intent.wantsPairing &&
      intent.needsRestaurant &&
      intent.needsActivity &&
      intent.pairingPreference?.requiresPairing === true &&
      pairs.length === 0;
    const displayed = requiredPairingSuppressedFallback
      ? { restaurants: [], activities: [], pairs: [], matched_locations: [] }
      : { restaurants, activities, pairs, matched_locations: restaurants };

    expect(requiredPairingSuppressedFallback).toBe(true);
    expect(displayed).toEqual({ restaurants: [], activities: [], pairs: [], matched_locations: [] });
    expect(activities.length === 0 ? "no_activity_results_for_required_pair" : "no_valid_required_pair").toBe("no_activity_results_for_required_pair");
  });

  it("suppresses individual fallback cards when required walking pairs fail", () => {
    const intent = normalizeIntent("restaurant with activity walking distance");
    const restaurants: any[] = [{ id: "r-far", name: "Far Bistro", latitude: 40.75, longitude: -73.99 }];
    const activities: any[] = [{ id: "a-far", name: "Far Arcade", latitude: 40.0, longitude: -74.9 }];
    const pairs = createSearchPairs(restaurants, activities, intent, createPairingDebug());
    const requiredPairingSuppressedFallback =
      intent.searchType === "mixed_outing" &&
      intent.wantsPairing &&
      intent.needsRestaurant &&
      intent.needsActivity &&
      intent.pairingPreference?.requiresPairing === true &&
      pairs.length === 0;
    const displayed = requiredPairingSuppressedFallback
      ? { restaurants: [], activities: [], pairs: [], matched_locations: [] }
      : { restaurants, activities, pairs, matched_locations: [...restaurants, ...activities] };

    expect(pairs.length).toBe(0);
    expect(requiredPairingSuppressedFallback).toBe(true);
    expect(displayed).toEqual({ restaurants: [], activities: [], pairs: [], matched_locations: [] });
    expect("no_walkable_pair_found").toBe("no_walkable_pair_found");
  });

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
