import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildSearchPlan } from "../planner/buildSearchPlan";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

const qaQueries = [
  "Romantic Italian dinner with live jazz in Manhattan tonight",
  "Upscale seafood dinner with live music near Times Square",
  "Cozy French restaurant with a jazz performance in Brooklyn",
  "A romantic dinner spot with live piano music and cocktails in Queens",
  "I’m planning a special date tonight and need an elegant Italian restaurant in Manhattan that either has live jazz at the same venue or can be paired with a nearby jazz club",
  "Mediterranean dinner with hookah in Manhattan",
  "Romantic Turkish restaurant with shisha and cocktails in Queens",
  "Lebanese dinner with a hookah lounge nearby in Brooklyn",
  "Late-night dinner followed by hookah near the Lower East Side",
  "Find a stylish Mediterranean restaurant for dinner and a real hookah lounge nearby, but do not give me a generic bar or nightclub that does not actually offer hookah",
  "Bottomless brunch then bowling in Brooklyn",
  "Cute brunch spot with an arcade nearby in Queens",
  "Birthday brunch followed by paint and sip in Manhattan",
  "Caribbean brunch and a relaxed activity in the Bronx",
  "My friends and I want a fun brunch that feels lively but not too loud, followed by an easy activity nearby where we can keep talking and taking pictures",
  "Italian dinner then karaoke in Manhattan",
  "Romantic pasta dinner with a comedy show nearby",
  "Italian restaurant followed by a rooftop lounge in Brooklyn",
  "Pizza dinner and an arcade near Astoria",
  "Find an authentic Italian dinner in Manhattan and pair it with a live entertainment activity that is close enough to make the night feel convenient",
] as const;

function responseFixture() {
  const restaurant = { id: "restaurant-one", name: "Restaurant" } as any;
  const activity = { id: "activity-one", name: "Activity" } as any;
  return {
    version: "public-search-v2",
    success: true,
    requestFulfilled: true,
    partialResults: false,
    requestId: "search-wide-regression",
    requestedMode: "paired_outing",
    resolvedMode: "paired_outing",
    primaryDomain: "mixed",
    primary_domain: "mixed",
    displayMode: "pairs",
    searchPlan: {},
    restaurants: [restaurant],
    activities: [activity],
    sameVenueResults: [],
    pairs: [{ restaurant, activity, distanceMiles: 0.2, walkingMinutes: 4, score: 90, geoTier: "exact_locality", isFallbackPair: false, matchReasons: [], whyMatched: "", why_it_matched: "" }],
    builder: { enabled: true, restaurants: [restaurant], activities: [activity], selectedRestaurantId: null, selectedActivityId: null },
    anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
    anchorResolution: { status: "not_requested", requested: false, rawName: null, resolvedLocationId: null, requiresClarification: false, candidateCount: 0, candidates: [], diagnostics: null },
    outcome: undefined,
    geoResolution: null,
    counts: { restaurantCandidates: 1, activityCandidates: 1, dualRoleCandidates: 0, restaurantCards: 1, activityCards: 1, builderRestaurantCards: 1, builderActivityCards: 1, uniquePairRestaurants: 1, uniquePairActivities: 1, sameVenueCards: 0, pairs: 1, displayedResults: 3 },
    fallback: { used: false, reason: null },
    retrieval: { profileCandidateCount: 2, legacyCandidateCount: 0, servedSource: "canonical_profile", fallbackDomains: [], legacyFallbackUsed: false },
    message: "We found options matching your outing.",
    timing: {},
    ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "ML disabled" },
    debug: {
      candidateStages: { finalRestaurantCandidates: 1, finalActivityCandidates: 1 },
      pairingDebug: { pairCandidatesEvaluated: 1, validPairCountBeforeRender: 1 },
    },
  } as any;
}

describe("native V2 search-wide mixed-result contracts", () => {
  it("keeps the complete production QA regression set", () => {
    expect(qaQueries).toHaveLength(20);
    expect(new Set(qaQueries).size).toBe(20);
  });

  it.each(qaQueries)("requires both domains for mixed query: %s", async (query) => {
    const plan = await buildSearchPlan({ input: { query, requestId: `qa-${query}` } });
    expect(plan.restaurant.required).toBe(true);
    expect(plan.activity.required).toBe(true);
    expect(plan.pairing.required).toBe(true);
  });

  it("treats same venue with an explicit nearby alternative as a preference", async () => {
    const query = qaQueries[4];
    const plan = await buildSearchPlan({ input: { query, requestId: "same-venue-preference" } });
    expect(plan.pairing.sameVenuePreferred).toBe(true);
  });

  it("publishes pairs plus standalone lanes as mixed results with telemetry", () => {
    const result = adaptV2ResponseToCurrentPublicContract(responseFixture());
    expect(result.renderMode).toBe("mixed_results");
    expect(result.restaurants).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.pairs).toHaveLength(1);
    expect(result.cards).toHaveLength(3);
    expect(result.rawActivityCandidateCount).toBeGreaterThan(0);
    expect(result.pairCandidatesEvaluated).toBeGreaterThan(0);
    expect(result.requestFulfilled).toBe(true);
  });

  it("preserves domain lanes before validation instead of replacing them with pairs", () => {
    const fallback = fs.readFileSync(path.join(process.cwd(), "lib/search/v2/fallback/resolveFallback.ts"), "utf8");
    const validation = fs.readFileSync(path.join(process.cwd(), "lib/search/v2/validation/validateSearchResult.ts"), "utf8");
    expect(fallback).toContain("domain_lanes_preserved");
    expect(fallback).not.toContain("showStandaloneCandidates");
    expect(validation).toContain("recomputeFulfillment");
    expect(validation).toContain("result.restaurants.length");
    expect(validation).toContain("result.activities.length");
    expect(validation).toContain("result.pairs.length");
  });
});
