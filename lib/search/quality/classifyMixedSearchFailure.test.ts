import { describe, expect, it } from "vitest";
import { classifyMixedSearchFailure } from "./classifyMixedSearchFailure";

const failingProductionPrompts = [
  "Romantic Turkish restaurant with shisha and cocktails in Queens",
  "Lebanese dinner with a hookah lounge nearby in Brooklyn",
  "Find a stylish Mediterranean restaurant for dinner and a real hookah lounge nearby, but do not give me a generic bar or nightclub that does not actually offer hookah",
  "Italian restaurant followed by a rooftop lounge in Brooklyn",
] as const;

describe("mixed search failure classification", () => {
  it("keeps the four production failures under permanent regression coverage", () => {
    expect(failingProductionPrompts).toHaveLength(4);
  });

  it("classifies retrieved hookah candidates that fail verification as an activity evidence gap", () => {
    const diagnosis = classifyMixedSearchFailure({
      mixedRequired: true,
      restaurantCount: 20,
      activityCount: 0,
      pairCount: 0,
      rawActivityCandidateCount: 107,
      activityRejectedCount: 107,
    });

    expect(diagnosis).toMatchObject({
      classification: "activity_evidence_gap",
      terminalOutcome: "confirmed_inventory_gap",
      requestFulfilled: false,
      partialResults: true,
      renderMode: "partial_mixed",
      inventoryIssue: false,
      evidenceIssue: true,
    });
  });

  it("classifies a true empty activity lane as verified inventory gap", () => {
    const diagnosis = classifyMixedSearchFailure({
      mixedRequired: true,
      restaurantCount: 16,
      activityCount: 0,
      pairCount: 0,
      rawActivityCandidateCount: 0,
    });

    expect(diagnosis).toMatchObject({
      classification: "verified_activity_inventory_gap",
      terminalOutcome: "confirmed_inventory_gap",
      requestFulfilled: false,
      inventoryIssue: true,
    });
  });

  it("classifies populated standalone lanes with zero pairs as compatibility failure", () => {
    const diagnosis = classifyMixedSearchFailure({
      mixedRequired: true,
      restaurantCount: 20,
      activityCount: 15,
      pairCount: 0,
      rawRestaurantCandidateCount: 20,
      rawActivityCandidateCount: 55,
    });

    expect(diagnosis).toMatchObject({
      classification: "no_compatible_pair",
      terminalOutcome: "no_compatible_pair",
      requestFulfilled: false,
      partialResults: true,
      renderMode: "partial_mixed",
      pairingIssue: true,
    });
  });

  it("separates distance and geography rejection from inventory shortage", () => {
    const diagnosis = classifyMixedSearchFailure({
      mixedRequired: true,
      restaurantCount: 16,
      activityCount: 1,
      pairCount: 0,
      rawRestaurantCandidateCount: 16,
      rawActivityCandidateCount: 73,
      primaryFailure: "distance_threshold_rejected_all_pairs",
    });

    expect(diagnosis).toMatchObject({
      classification: "pairing_distance_or_geo_rejection",
      terminalOutcome: "expected_constraint_no_pair",
      inventoryIssue: false,
      pairingIssue: true,
      requestFulfilled: false,
    });
  });
});
