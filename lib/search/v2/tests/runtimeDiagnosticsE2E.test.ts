import { describe, expect, it } from "vitest";
import { resolveSearchAnchor } from "../../anchors/resolve";
import {
  classifyProductionReplayFailure,
  collectCandidateLossDiagnostics,
} from "../../quality/productionReplayFailureClassifier";
import { createSearchTrace } from "../observability/searchTrace";
import { buildPairs } from "../pairing/buildPairs";

function scored(id: string, latitude: number, longitude: number) {
  return {
    candidate: {
      candidate: {
        location: { id, latitude, longitude, city: "Flushing", state: "NY" },
        geoMatch: { tier: "exact_locality", accepted: true },
      },
    },
    scores: { total: 80, quality: 80 },
  } as any;
}

function pairedResponse(overrides: Record<string, any> = {}) {
  return {
    restaurants: [],
    activities: [],
    pairs: [],
    retrieval: { profileCandidateCount: 0, legacyFallbackUsed: false },
    timing: { totalMs: 500 },
    searchPlan: {
      pairing: { requireWalkable: false, maxWalkingMinutes: null, maxDistanceMiles: null },
      travel: { explicit: false, constraint: "none" },
    },
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      pairingDebug: {
        pairCandidatesEvaluated: 0,
        validPairCountBeforeRender: 0,
        validPairCountAfterConstraints: 0,
        validPairCountAfterDiversification: 0,
        renderEligiblePairCount: 0,
        finalEligiblePairs: [],
        eligibilityContractValid: true,
        rejectedPairs: [],
      },
    },
    ...overrides,
  };
}

function createSupabase(args: { anchors?: any[]; locations?: any[] }) {
  return {
    from(table: string) {
      const data = table === "search_anchors" ? args.anchors ?? [] : args.locations ?? [];
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        limit() { return Promise.resolve({ data, error: null }); },
      };
      return builder;
    },
  };
}

const baseLocation = {
  location_type: "activity",
  activity_type: "museum",
  primary_category: "museum",
  active: true,
  is_searchable: true,
  is_hidden: false,
  deleted_at: null,
  status: "approved",
  latitude: 40.75,
  longitude: -73.98,
};

describe("authoritative runtime diagnostics", () => {
  it("calculates final eligibility after walking constraints and emits exact pair ids", async () => {
    const trace = createSearchTrace("final-pair-ids");
    const plan = {
      rawQuery: "Dinner and karaoke within a 20-minute walk",
      geo: { state: "NY", city: "Flushing" },
      travel: { constraint: "hard" },
      pairing: { requireWalkable: true, maxWalkingMinutes: 20, maxDistanceMiles: 1, sameVenueRequired: false },
    } as any;

    const pairs = await buildPairs({
      plan,
      restaurants: [scored("restaurant-near", 40.75, -73.83), scored("restaurant-far", 40.80, -73.70)],
      activities: [scored("karaoke", 40.751, -73.831)],
      trace,
    });

    expect(pairs).toHaveLength(1);
    expect(trace.pairingDebug?.pairCandidatesEvaluated).toBe(2);
    expect(trace.pairingDebug?.rejectionCounts.walkability_constraint).toBe(1);
    expect(trace.pairingDebug?.renderEligiblePairCount).toBe(1);
    expect(trace.pairingDebug?.finalEligiblePairs).toEqual([
      expect.objectContaining({ restaurantId: "restaurant-near", activityId: "karaoke" }),
    ]);
    expect(trace.pairingDebug?.eligibilityContractValid).toBe(true);
  });

  it("treats 19 pre-render candidates plus 121 walking rejections and no final ids as expected no-pair", () => {
    const rejectedPairs = Array.from({ length: 121 }, () => ({
      reason: "walkability_constraint",
      detail: "requested_walking_limit_exceeded",
    }));
    const response = pairedResponse({
      restaurants: Array.from({ length: 8 }, (_, index) => ({ id: `r-${index}` })),
      activities: Array.from({ length: 7 }, (_, index) => ({ id: `a-${index}` })),
      retrieval: { profileCandidateCount: 29, legacyFallbackUsed: false },
      searchPlan: {
        pairing: { requireWalkable: true, maxWalkingMinutes: 20, maxDistanceMiles: 1 },
        travel: { explicit: true, constraint: "hard" },
      },
      debug: {
        retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
        pairingDebug: {
          pairCandidatesEvaluated: 140,
          validPairCountBeforeRender: 19,
          validPairCountAfterConstraints: 0,
          validPairCountAfterDiversification: 0,
          renderEligiblePairCount: 0,
          finalEligiblePairs: [],
          eligibilityContractValid: true,
          rejectedPairs,
        },
      },
    });

    const result = classifyProductionReplayFailure(pairedResponse(), response, response);
    expect(result.passed).toBe(true);
    expect(result.disposition).toBe("expected_constraint_no_pair");
    expect(result.viablePairOmitted).toBe(false);
  });

  it("preserves stage evidence when 19 Garden City profile candidates disappear", () => {
    const response = pairedResponse({
      retrieval: { profileCandidateCount: 19, legacyFallbackUsed: false },
      debug: {
        retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
        candidateStages: {
          profileCandidates: 19,
          geoEligibleCandidates: 19,
          domainAssignedCandidates: 0,
          taxonomyEligibleCandidates: 0,
          publishableCandidates: 0,
          finalRestaurantCandidates: 0,
          finalActivityCandidates: 0,
          rejectedCandidates: Array.from({ length: 19 }, (_, index) => ({
            locationId: `garden-${index}`,
            rejectedAtStage: "domain_assignment",
            rejectionReason: "no_qualified_requested_role",
          })),
        },
      },
    });

    const diagnostics = collectCandidateLossDiagnostics(response);
    expect(diagnostics.profileCandidates).toBe(19);
    expect(diagnostics.domainAssignedCandidates).toBe(0);
    expect(diagnostics.rejectedCandidates).toHaveLength(19);
    expect(diagnostics.hasStageEvidence).toBe(true);
  });

  it("allows known inventory gap only with a completed confirmed audit", () => {
    const response = pairedResponse({
      retrieval: { profileCandidateCount: 0, legacyFallbackUsed: false },
      debug: {
        retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
        candidateStages: {
          profileCandidates: 0,
          geoEligibleCandidates: 0,
          domainAssignedCandidates: 0,
          taxonomyEligibleCandidates: 0,
          publishableCandidates: 0,
          finalRestaurantCandidates: 0,
          finalActivityCandidates: 0,
          rejectedCandidates: [],
        },
        inventoryAudit: {
          id: "audit-garden-city",
          status: "confirmed_gap",
          supportedMarket: true,
          rawCounts: { profile: 0, legacy: 0, restaurant: 0, activity: 0 },
          evidence: ["canonical and legacy inventory both empty"],
        },
      },
    });

    const result = classifyProductionReplayFailure(pairedResponse(), response, response);
    expect(result.disposition).toBe("known_inventory_gap");
    expect(result.blocksCanary).toBe(false);
    expect(result.retirementEligible).toBe(true);
  });

  it("returns generic ambiguity, missing named anchor, and concrete resolved location ids", async () => {
    const generic: any = await resolveSearchAnchor(createSupabase({
      locations: [
        { ...baseLocation, id: "rink-1", name: "City Ice Rink", activity_type: "skating rink", primary_category: "skating rink", city: "New York" },
        { ...baseLocation, id: "rink-2", name: "Westchester Skating Academy", activity_type: "skating rink", primary_category: "skating rink", city: "Elmsford" },
      ],
    }), "skating rink", null);
    const missing: any = await resolveSearchAnchor(createSupabase({}), "Missing Named Place", "Queens");
    const resolved: any = await resolveSearchAnchor(createSupabase({
      locations: [{ ...baseLocation, id: "gaming-city-id", name: "Gaming City", city: "Astoria", activity_type: "arcade", primary_category: "arcade" }],
    }), "Gaming City", "Astoria");

    expect(generic.status).toBe("ambiguous");
    expect(missing.status).toBe("not_found");
    expect(resolved.status).toBe("resolved");
    expect(resolved.diagnostics.resolvedLocationId).toBe("gaming-city-id");
  });
});
