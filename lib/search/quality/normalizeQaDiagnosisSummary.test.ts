import { describe, expect, it } from "vitest";
import { normalizeQaDiagnosisSummary } from "./normalizeQaDiagnosisSummary";

describe("normalizeQaDiagnosisSummary", () => {
  it("uses no-compatible-pair diagnosis as top-level QA truth", () => {
    const normalized = normalizeQaDiagnosisSummary({
      diagnosis: {
        classification: "no_compatible_pair",
        terminalOutcome: "no_compatible_pair",
        requestFulfilled: false,
        partialResults: true,
        renderMode: "partial_mixed",
      },
      result: {
        outcome: null,
        requestFulfilled: true,
        partialResults: false,
        render_mode: "restaurant_cards",
      },
    });

    expect(normalized).toMatchObject({
      diagnosisClassification: "no_compatible_pair",
      outcome: "no_compatible_pair",
      requestFulfilled: false,
      partialResults: true,
      renderMode: "partial_mixed",
      primaryResultType: "partial_mixed",
    });
  });

  it("uses activity-evidence-gap diagnosis as top-level QA truth", () => {
    const normalized = normalizeQaDiagnosisSummary({
      diagnosis: {
        classification: "activity_evidence_gap",
        terminalOutcome: "confirmed_inventory_gap",
        requestFulfilled: false,
        partialResults: true,
        renderMode: "partial_mixed",
      },
      result: {
        outcome: null,
        requestFulfilled: true,
        render_mode: "restaurant_cards",
      },
    });

    expect(normalized).toMatchObject({
      diagnosisClassification: "activity_evidence_gap",
      outcome: "confirmed_inventory_gap",
      requestFulfilled: false,
      partialResults: true,
      renderMode: "partial_mixed",
    });
  });

  it("preserves successful public result fields when there is no diagnosis", () => {
    const normalized = normalizeQaDiagnosisSummary({
      diagnosis: { classification: "none" },
      result: {
        requestFulfilled: true,
        partialResults: false,
        render_mode: "mixed_results",
      },
    });

    expect(normalized).toMatchObject({
      diagnosisClassification: "none",
      outcome: null,
      requestFulfilled: true,
      partialResults: false,
      renderMode: "mixed_results",
    });
  });
});
