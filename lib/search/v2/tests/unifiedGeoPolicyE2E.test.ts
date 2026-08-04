import { describe, expect, it } from "vitest";
import { classifyCandidateGeo } from "../geo/geoPolicy";
import { candidateFrom } from "../retrieval/retrieveCandidates";
import { buildPairs } from "../pairing/buildPairs";
import { resolveFallback } from "../fallback/resolveFallback";
import { buildPublicSearchResponse } from "../response/buildPublicSearchResponse";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    version: "search-plan-v1",
    requestId: "geo-e2e",
    rawQuery: "Halal dinner and karaoke in Flushing",
    mode: "paired_outing",
    restaurant: { required: true, cuisines: ["halal"], foods: [], mealPeriods: ["dinner"], features: [], exclusions: [] },
    activity: { required: true, categories: ["karaoke"], features: [], exclusions: [] },
    geo: { source: "explicit", market: "NYC", city: "New York", borough: "Queens", neighborhood: "Flushing", county: "Queens County", state: "NY", latitude: 40.73, longitude: -73.895, radiusMiles: 3, strictness: "strict" },
    anchor: { requested: false, rawName: null, locationId: null, name: null, latitude: null, longitude: null },
    travel: { mode: "unspecified", constraint: "none", explicit: false },
    pairing: { required: true, sameVenuePreferred: false, sameVenueRequired: false, sequence: "any", maxDistanceMiles: null, maxWalkingMinutes: null, requireWalkable: false },
    audience: { familyFriendly: false, minorsPresent: false, adultOnlyRequested: false },
    occasion: null,
    partySize: null,
    plannedFor: null,
    fallback: { allowNearbyPair: true, allowPartial: true, allowBroaderGeo: true, maximumRadiusMiles: 45 },
    confidence: { overall: 0.96, mode: 0.95, restaurant: 0.95, activity: 0.95, geo: 0.95 },
    parser: { source: "deterministic", reasons: ["canonical centroid resolved for Flushing"] },
    ...overrides,
  } as any;
}

function request(desiredRole: "restaurant" | "karaoke_activity") {
  return {
    desiredRole,
    cuisines: desiredRole === "restaurant" ? ["halal"] : [],
    foods: [],
    categories: desiredRole === "karaoke_activity" ? ["karaoke"] : [],
    features: [],
    retrievalTerms: desiredRole === "restaurant" ? ["halal"] : ["karaoke"],
    eligibleStorageTypes: [],
    geo: plan().geo,
  } as any;
}

function scored(retrieved: any, role: string) {
  return {
    candidate: { candidate: retrieved, eligibleRoles: [role], rejectedRoles: [], reasons: [] },
    selectedRole: role,
    scores: { intentMatch: 100, roleConfidence: 100, geoFit: 100, quality: 90, featureMatch: 50, popularity: 80, audienceFit: 100, mlBoost: 0, penalties: 0, total: 90 },
    reasons: [`qualified as ${role}`, `matched requested ${role} terms`],
    ml: { enabled: false, modelVersion: null, phase1Score: null, phase1Boost: 0, phase2Score: null, phase2Boost: 0, pairScore: null, pairBoost: 0, baseRank: null, finalRank: null, rankDelta: null },
  } as any;
}

function trace() {
  return {
    requestId: "geo-e2e",
    decisions: [],
    retrievalCalls: [],
    retrieval: { configuredMode: "off", servedSource: "legacy", profileVersion: 4, canaryBucket: null, canaryPercent: null, profileCandidateCount: 0, legacyCandidateCount: 0, legacyFallbackUsed: false, fallbackDomains: [] },
    counts: { retrieved: 0, pairsBuilt: 0, pairsValid: 0, displayed: 0 },
    fallback: { used: false, reason: null },
    timing: {},
    ml: { enabled: false, modelVersion: null, rankingVariant: null, phase1Enabled: false, phase2Enabled: false, rolloutBucket: null },
  } as any;
}

describe("unified geographic policy end to end", () => {
  it("does not call Astoria an exact Flushing match", () => {
    const result = classifyCandidateGeo(plan(), { id: "astoria", city: "Astoria", neighborhood: "Astoria", borough: "Queens", state: "NY", latitude: 40.76, longitude: -73.92 } as any);
    expect(result.tier).not.toBe("exact_locality");
    expect(result.candidateLocality).toBe("Astoria");
  });

  it("serves exact pairs before nearby pairs and preserves the tier in the response", async () => {
    const p = plan();
    const restaurantExact = scored(candidateFrom({ id: "r-flushing", name: "Flushing Halal", city: "New York", neighborhood: "Flushing", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.73, longitude: -73.895 }, request("restaurant"), "enterprise_search_locations", p, "neighborhood"), "restaurant");
    const activityExact = scored(candidateFrom({ id: "a-flushing", name: "Flushing Karaoke", city: "New York", neighborhood: "Flushing", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.731, longitude: -73.894 }, request("karaoke_activity"), "enterprise_search_locations", p, "neighborhood"), "karaoke_activity");
    const activityNearby = scored(candidateFrom({ id: "a-astoria", name: "Astoria Karaoke", city: "Astoria", neighborhood: "Astoria", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.76, longitude: -73.92 }, request("karaoke_activity"), "enterprise_search_locations", p, "radius"), "karaoke_activity");
    const t = trace();
    const pairs = await buildPairs({ plan: p, restaurants: [restaurantExact], activities: [activityNearby, activityExact], trace: t });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.activity.candidate.candidate.location.id).toBe("a-flushing");
    expect(pairs[0]?.geoTier).toBe("exact_locality");

    const resolved = await resolveFallback({ plan: p, scored: { restaurants: [restaurantExact], activities: [activityNearby, activityExact] }, pairs, retrievedCount: 3, trace: t });
    const response = buildPublicSearchResponse({ plan: p, result: resolved, trace: t });
    expect(response.success).toBe(true);
    expect(response.geoResolution?.servedTier).toBe("exact_locality");
    expect(response.pairs[0]?.geoTier).toBe("exact_locality");
    expect(response.pairs[0]?.whyMatched).toContain("requested locality");
  });

  it("labels nearby fallback instead of claiming the same requested geography", async () => {
    const p = plan();
    const restaurant = scored(candidateFrom({ id: "r-elmhurst", name: "Elmhurst Halal", city: "Elmhurst", neighborhood: "Elmhurst", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.735, longitude: -73.88 }, request("restaurant"), "enterprise_search_locations", p, "radius"), "restaurant");
    const activity = scored(candidateFrom({ id: "a-astoria", name: "Astoria Karaoke", city: "Astoria", neighborhood: "Astoria", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.75, longitude: -73.91 }, request("karaoke_activity"), "enterprise_search_locations", p, "radius"), "karaoke_activity");
    const t = trace();
    const pairs = await buildPairs({ plan: p, restaurants: [restaurant], activities: [activity], trace: t });
    expect(pairs[0]?.geoTier).toBe("nearby_radius");
    expect(pairs[0]?.reasons.join(" ")).toContain("outside the exact locality");
    expect(pairs[0]?.reasons.join(" ")).not.toContain("same requested geography");
  });

  it("keeps a mixed zero-pair search unsuccessful", async () => {
    const p = plan();
    const restaurant = scored(candidateFrom({ id: "r-bayside", name: "Bayside Korean BBQ", city: "New York", neighborhood: "Bayside", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.76, longitude: -73.77 }, request("restaurant"), "enterprise_search_locations", p, "radius"), "restaurant");
    const t = trace();
    const resolved = await resolveFallback({ plan: p, scored: { restaurants: [restaurant], activities: [] }, pairs: [], retrievedCount: 1, trace: t });
    const response = buildPublicSearchResponse({ plan: p, result: resolved, trace: t });
    expect(response.success).toBe(false);
    expect(response.requestFulfilled).toBe(false);
    expect(response.displayMode).toBe("partial_mixed");
  });
});
