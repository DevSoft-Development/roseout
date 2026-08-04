import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyProductionReplayFailure,
  collectCandidateLossDiagnostics,
  collectPairingDiagnostics,
} from "../../quality/productionReplayFailureClassifier";

function pairedResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: false,
    requestFulfilled: false,
    counts: { pairs: 0, restaurant: 8, activity: 7, sameVenue: 0, uniqueResults: 15 },
    restaurants: Array.from({ length: 8 }, (_, index) => ({ id: `r-${index}` })),
    activities: Array.from({ length: 7 }, (_, index) => ({ id: `a-${index}` })),
    pairs: [],
    retrieval: { profileCandidateCount: 15, legacyFallbackUsed: false },
    timing: { totalMs: 500 },
    searchPlan: {
      pairing: { requireWalkable: true, maxWalkingMinutes: 20, maxDistanceMiles: 1 },
      travel: { explicit: true, constraint: "hard" },
    },
    debug: {
      retrievalCalls: [{ domain: "restaurant" }, { domain: "activity" }],
      pairingDebug: {
        pairCandidatesEvaluated: 140,
        validPairCountBeforeRender: 19,
        validPairCountAfterConstraints: 19,
        validPairCountAfterDiversification: 8,
        renderEligiblePairCount: 0,
        finalEligiblePairs: [],
        eligibilityContractValid: true,
        eligibilityContractViolation: null,
        rejectedPairs: Array.from({ length: 121 }, (_, index) => ({
          restaurantId: `r-${index % 8}`,
          activityId: `a-${index % 7}`,
          reason: "walkability_constraint",
          detail: "requested_walking_limit_exceeded",
          walkingMinutes: 21 + (index % 40),
          distanceMiles: 1.01 + index / 100,
        })),
      },
      candidateStages: {
        profileCandidates: 15,
        geoEligibleCandidates: 15,
        domainAssignedCandidates: 15,
        taxonomyEligibleCandidates: 15,
        publishableCandidates: 15,
        finalRestaurantCandidates: 8,
        finalActivityCandidates: 7,
        rejectedCandidates: [],
      },
      inventoryAudit: { id: "audit-1", status: "inconclusive", supportedMarket: true },
    },
    ...overrides,
  };
}

describe("completed runtime replay contracts", () => {
  it("uses the final public pair count instead of pre-render diversified pairs", () => {
    const diagnostics = collectPairingDiagnostics(pairedResponse());

    expect(diagnostics.validPairCountAfterConstraints).toBe(19);
    expect(diagnostics.validPairCountAfterDiversification).toBe(8);
    expect(diagnostics.finalEligiblePairCount).toBe(0);
    expect(diagnostics.finalEligiblePairs).toEqual([]);
    expect(diagnostics.eligibilityContractValid).toBe(true);
  });

  it("turns 19 pre-render pairs and 121 walking rejections into a non-blocking constraint outcome when no pair survives rendering", () => {
    const legacy = pairedResponse();
    const canonical = pairedResponse();
    const strict = pairedResponse();

    const comparison = classifyProductionReplayFailure(legacy, canonical, strict);

    expect(comparison.disposition).toBe("expected_constraint_no_pair");
    expect(comparison.blocksCanary).toBe(false);
    expect(comparison.viablePairOmitted).toBe(false);
  });

  it("blocks canary when final pair count and pair IDs disagree", () => {
    const mismatch = pairedResponse({
      debug: {
        ...pairedResponse().debug,
        pairingDebug: {
          ...(pairedResponse().debug as any).pairingDebug,
          renderEligiblePairCount: 1,
          finalEligiblePairs: [],
          eligibilityContractValid: true,
        },
      },
    });

    const comparison = classifyProductionReplayFailure(mismatch, mismatch, mismatch);

    expect(comparison.pairingContractViolation).toBe(true);
    expect(comparison.reasons).toContain("pairing_diagnostics_contract_violation");
    expect(comparison.blocksCanary).toBe(true);
  });

  it("attributes all 19 Garden City candidates at the geo stage", () => {
    const response = pairedResponse({
      counts: { pairs: 0, restaurant: 0, activity: 0, sameVenue: 0, uniqueResults: 0 },
      restaurants: [],
      activities: [],
      retrieval: { profileCandidateCount: 19, legacyFallbackUsed: false },
      debug: {
        ...(pairedResponse().debug as any),
        candidateStages: {
          profileCandidates: 19,
          geoEligibleCandidates: 0,
          domainAssignedCandidates: 0,
          taxonomyEligibleCandidates: 0,
          publishableCandidates: 0,
          finalRestaurantCandidates: 0,
          finalActivityCandidates: 0,
          rejectedCandidates: Array.from({ length: 19 }, (_, index) => ({
            locationId: `garden-city-${index}`,
            rejectedAtStage: "geo",
            rejectionReason: "city_mismatch",
          })),
        },
      },
    });

    const diagnostics = collectCandidateLossDiagnostics(response);

    expect(diagnostics.profileCandidates).toBe(19);
    expect(diagnostics.geoEligibleCandidates).toBe(0);
    expect(diagnostics.rejectedCandidates).toHaveLength(19);
    expect(diagnostics.rejectionReasonCounts.city_mismatch).toBe(19);
    expect(diagnostics.inventoryGapConfirmed).toBe(false);
  });

  it("keeps the producer wiring that preserves pre-geo candidates and finalizes pair eligibility at rendering", () => {
    const root = process.cwd();
    const retrievalTypes = fs.readFileSync(path.join(root, "lib/search/v2/retrieval/retrievalTypes.ts"), "utf8");
    const retrieval = fs.readFileSync(path.join(root, "lib/search/v2/retrieval/retrieveCandidates.ts"), "utf8");
    const searchIndex = fs.readFileSync(path.join(root, "lib/search/v2/index.ts"), "utf8");
    const responseBuilder = fs.readFileSync(path.join(root, "lib/search/v2/response/buildPublicSearchResponse.ts"), "utf8");

    expect(retrievalTypes).toContain("allCandidates: RetrievedCandidate[]");
    expect(retrieval).toContain("return { candidates, allCandidates, requests, callsUsed: budget.used }");
    expect(searchIndex).toContain("retrieved.allCandidates");
    expect(responseBuilder).toContain("trace.pairingDebug.renderEligiblePairCount = pairs.length");
    expect(responseBuilder).toContain("trace.pairingDebug.finalEligiblePairs = pairs.map");
  });
});
