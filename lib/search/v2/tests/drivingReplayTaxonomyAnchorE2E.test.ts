import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { deterministicParse } from "../planner/deterministicParser";
import { buildRetrievalRequests } from "../retrieval/buildRetrievalRequests";
import { candidateFrom } from "../retrieval/retrieveCandidates";
import { buildSummary } from "../../../app/api/admin/search-health/batch-run/route";

const request = (query: string) => ({ input: { query, requestId: `test:${query}` } });

describe("search-wide driving constraints", () => {
  it.each([
    ["sushi and an escape room in Garden City, and we would rather not drive more than ten minutes", 10],
    ["burgers and bowling in Rockville Centre within a 15-minute drive", 15],
    ["dinner and karaoke where we do not want to drive over 20 minutes", 20],
  ])("parses first-class driving minutes: %s", async (query, expected) => {
    const plan = await buildSearchPlan(request(query));
    expect(plan.travel.mode).toBe("driving");
    expect(plan.travel.constraint).toBe("hard");
    expect(plan.travel.maxDrivingMinutes).toBe(expected);
    expect(plan.pairing.maxDrivingMinutes).toBe(expected);
    expect(plan.pairing.maxDistanceMiles).toBeGreaterThan(0);
  });

  it("keeps qualitative short drives soft instead of creating an invalid hard plan", async () => {
    const plan = await buildSearchPlan(request("brunch in Forest Hills and a museum within a short drive"));
    expect(plan.travel.mode).toBe("driving");
    expect(plan.travel.constraint).toBe("soft");
    expect(plan.pairing.maxDrivingMinutes).toBeNull();
  });
});

describe("clause-aware taxonomy ownership", () => {
  it("does not assign rooftop bar to the restaurant clause", () => {
    const parsed = deterministicParse({ query: "a seafood restaurant in Long Island City followed by a scenic walk or rooftop bar" });
    expect(parsed.cuisineMatches).toContain("seafood");
    expect(parsed.restaurantFeatures).not.toContain("rooftop");
    expect(parsed.activityFeatures).toContain("rooftop");
    expect(parsed.activityCategories).toContain("lounge");
  });
});

describe("candidate evidence contracts", () => {
  it("does not claim Italian evidence for an Indian restaurant returned by a profile lane", () => {
    const plan = { geo: { source: "explicit", market: "NYC", city: "Astoria", borough: "Queens", neighborhood: null, county: null, state: "NY", latitude: 40.76, longitude: -73.92, radiusMiles: 8, strictness: "strict" } } as any;
    const retrievalRequest = { desiredRole: "restaurant", cuisines: ["italian"], foods: [], categories: [], features: [], retrievalTerms: ["italian", "trattoria"], eligibleStorageTypes: ["restaurant"], geo: plan.geo } as any;
    const candidate = candidateFrom({ id: "indian-1", name: "Red Chilli", cuisine: "indian", primary_category: "indian", latitude: 40.75, longitude: -73.89 }, retrievalRequest, "enterprise_search_profile_locations", plan);
    expect(candidate.matchedRetrievalTerms).toEqual([]);
  });

  it("includes Flushing karaoke recovery vocabulary", async () => {
    const plan = await buildSearchPlan(request("halal dinner in Flushing followed by karaoke"));
    const karaoke = buildRetrievalRequests(plan).find((item) => item.desiredRole === "karaoke_activity");
    expect(karaoke?.retrievalTerms).toEqual(expect.arrayContaining(["karaoke", "ktv", "noraebang", "private karaoke room"]));
  });
});

describe("QA replay expected outcomes", () => {
  it.each([
    ["expected_constraint_no_pair", "not_requested"],
    ["clarification_required", "clarification_required"],
    ["anchor_not_found", "not_found"],
  ])("counts %s as a valid expected outcome", (outcome, anchorStatus) => {
    const summary = buildSummary(0, "test query", "v2", {
      success: false, outcome,
      searchPlan: { mode: "anchored_nearby", restaurant: { required: true }, activity: { required: false }, parser: { source: "deterministic", reasons: [] }, pairing: {} },
      anchorResolution: { status: anchorStatus, requiresClarification: outcome === "clarification_required", resolvedLocationId: null, candidateCount: 2 },
      counts: { restaurantCards: 0, activityCards: 0, pairs: 0, displayedResults: 0 }, timing: { totalMs: 20 },
    }, 20);
    expect(summary.ok).toBe(true);
    expect(summary.expectedOutcome).toBe(true);
    expect(summary.outcome).toBe(outcome);
    expect(summary.suspiciousFlags).not.toContain("no_results");
  });
});
