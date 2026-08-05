import { describe, expect, it } from "vitest";
import { evaluateSearchAcceptanceContracts } from "./searchAcceptanceContracts";

const counts = { restaurants: 0, activities: 0, pairs: 0, displayed: 0 };

function baseResult(overrides: Record<string, unknown> = {}) {
  return {
    searchV2: {
      requestFulfilled: false,
      searchPlan: {
        mode: "paired_outing",
        rawQuery: "Dinner and an activity afterward",
        restaurant: { required: true, cuisines: ["italian"], foods: [], features: [] },
        activity: { required: true, categories: ["live_music"] },
        anchor: { requested: false },
      },
      debug: {
        pairingDebug: {
          primaryFailure: "walkability_constraint",
          rejectionCounts: { walkability_constraint: 4 },
          eligibilityContractValid: true,
          finalEligiblePairs: [],
        },
        candidateStages: { rejectedCandidates: [{ rejectedAtStage: "geo" }] },
      },
    },
    ...overrides,
  };
}

describe("evaluateSearchAcceptanceContracts", () => {
  it("passes an expected constraint outcome without claiming fulfillment", () => {
    const result = baseResult({ searchV2: { ...baseResult().searchV2, outcome: "expected_constraint_no_pair" } });
    const matrix = evaluateSearchAcceptanceContracts({ result, counts, errors: [], warnings: [] });
    expect(matrix.testPassed).toBe(true);
    expect(matrix.qa.evidence.requestFulfilled).toBe(false);
    expect(matrix.pairing.passed).toBe(true);
  });

  it("fails when a mixed request loses paired intent", () => {
    const result = baseResult({
      searchV2: {
        ...baseResult().searchV2,
        searchPlan: { ...baseResult().searchV2.searchPlan, mode: "restaurant_only" },
      },
    });
    const matrix = evaluateSearchAcceptanceContracts({ result, counts, errors: [], warnings: [] });
    expect(matrix.intent.passed).toBe(false);
    expect(matrix.testPassed).toBe(false);
  });

  it("fails unresolved generic anchors that do not clarify", () => {
    const result = {
      searchV2: {
        outcome: "anchor_not_found",
        requestFulfilled: false,
        searchPlan: {
          mode: "anchored_nearby",
          rawQuery: "Dinner near a museum",
          restaurant: { required: true, cuisines: [], foods: [], features: [] },
          activity: { required: false, categories: [] },
          anchor: { requested: true, generic: true, entityType: "generic_category" },
        },
        anchorResolution: { status: "not_found" },
        debug: { candidateStages: { rejectedCandidates: [] } },
      },
    };
    const matrix = evaluateSearchAcceptanceContracts({ result, counts, errors: [], warnings: [] });
    expect(matrix.geoAnchor.passed).toBe(false);
    expect(matrix.testPassed).toBe(false);
  });

  it("passes retrieval when a bounded inventory gap is confirmed", () => {
    const result = baseResult({
      searchV2: {
        ...baseResult().searchV2,
        outcome: "expected_constraint_no_pair",
        debug: {
          ...baseResult().searchV2.debug,
          inventoryAudit: { status: "confirmed_gap" },
        },
      },
    });
    const matrix = evaluateSearchAcceptanceContracts({ result, counts, errors: [], warnings: [] });
    expect(matrix.retrieval.passed).toBe(true);
  });

  it("rejects rendered pairs when the eligibility contract is invalid", () => {
    const result = baseResult({
      searchV2: {
        ...baseResult().searchV2,
        requestFulfilled: true,
        debug: {
          ...baseResult().searchV2.debug,
          pairingDebug: {
            ...baseResult().searchV2.debug.pairingDebug,
            eligibilityContractValid: false,
            eligibilityContractViolation: "rendered pair exceeded limit",
          },
        },
      },
    });
    const matrix = evaluateSearchAcceptanceContracts({ result, counts: { restaurants: 1, activities: 1, pairs: 1, displayed: 1 }, errors: [], warnings: [] });
    expect(matrix.pairing.passed).toBe(false);
    expect(matrix.testPassed).toBe(false);
  });
});
