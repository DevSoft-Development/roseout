import { describe, expect, it } from "vitest";
import { acceptableOutcome, classifySearchFailure, evaluateEngineCorrectness } from "./searchReliability";

describe("search reliability platform", () => {
  it("separates honest hard-distance no-pair outcomes from engine failures", () => {
    const failureClass = classifySearchFailure({
      responseContractValid: true,
      parserConfidence: 0.96,
      knownInventoryRequired: false,
      retrievedCandidateCount: 5,
      restaurantRequired: true,
      activityRequired: true,
      restaurantCandidateCount: 2,
      activityCandidateCount: 3,
      evaluatedPairs: 6,
      rejectedForDistance: 6,
      rejectedForGeography: 0,
      hardDistance: true,
      displayedResults: 5,
    });
    expect(failureClass).toBe("HARD_DISTANCE_NO_PAIR");
    expect(acceptableOutcome({ engineCorrect: true, fulfilled: false, knownInventoryRequired: false, failureClass })).toBe(true);
  });

  it("classifies canonical profile gaps independently from missing inventory", () => {
    expect(classifySearchFailure({
      responseContractValid: true,
      knownInventoryRequired: true,
      retrievedCandidateCount: 0,
      profileCandidateCount: 0,
      legacyCandidateCount: 5,
    })).toBe("PROFILE_CLASSIFICATION_GAP");
  });

  it("requires known inventory to be recalled", () => {
    expect(classifySearchFailure({
      responseContractValid: true,
      knownInventoryRequired: true,
      retrievedCandidateCount: 0,
      profileCandidateCount: 0,
      legacyCandidateCount: 0,
    })).toBe("RETRIEVAL_RECALL_FAILURE");
  });

  it("fails engine correctness for any hard constraint violation", () => {
    expect(evaluateEngineCorrectness({
      responseContractValid: true,
      wrongDomainCount: 0,
      geographyLeakageCount: 0,
      hardConstraintViolations: 1,
      parserCorrect: true,
    })).toBe(false);
  });
});
