export type MixedSearchFailureClassification =
  | "none"
  | "verified_activity_inventory_gap"
  | "verified_restaurant_inventory_gap"
  | "activity_evidence_gap"
  | "restaurant_evidence_gap"
  | "no_compatible_pair"
  | "pairing_distance_or_geo_rejection"
  | "unclassified_mixed_failure";

export type MixedSearchFailureDiagnosis = {
  classification: MixedSearchFailureClassification;
  terminalOutcome: "confirmed_inventory_gap" | "no_compatible_pair" | "expected_constraint_no_pair" | null;
  requestFulfilled: boolean;
  partialResults: boolean;
  renderMode: "partial_mixed" | null;
  inventoryIssue: boolean;
  evidenceIssue: boolean;
  pairingIssue: boolean;
  reason: string;
};

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function classifyMixedSearchFailure(args: {
  mixedRequired: boolean;
  restaurantCount: number;
  activityCount: number;
  pairCount: number;
  rawRestaurantCandidateCount?: number | null;
  rawActivityCandidateCount?: number | null;
  restaurantRejectedCount?: number | null;
  activityRejectedCount?: number | null;
  primaryFailure?: string | null;
  restaurantAuditStatus?: string | null;
  activityAuditStatus?: string | null;
}): MixedSearchFailureDiagnosis {
  if (!args.mixedRequired || args.pairCount > 0) {
    return {
      classification: "none",
      terminalOutcome: null,
      requestFulfilled: true,
      partialResults: false,
      renderMode: null,
      inventoryIssue: false,
      evidenceIssue: false,
      pairingIssue: false,
      reason: "The mixed request has a valid rendered pair or does not require both lanes.",
    };
  }

  const rawRestaurants = numeric(args.rawRestaurantCandidateCount);
  const rawActivities = numeric(args.rawActivityCandidateCount);
  const rejectedRestaurants = numeric(args.restaurantRejectedCount);
  const rejectedActivities = numeric(args.activityRejectedCount);
  const hasStandaloneResults = args.restaurantCount > 0 || args.activityCount > 0;
  const primaryFailure = String(args.primaryFailure ?? "").toLowerCase();

  if (args.activityCount === 0) {
    if (args.activityAuditStatus === "confirmed_gap" || rawActivities === 0) {
      return {
        classification: "verified_activity_inventory_gap",
        terminalOutcome: "confirmed_inventory_gap",
        requestFulfilled: false,
        partialResults: hasStandaloneResults,
        renderMode: hasStandaloneResults ? "partial_mixed" : null,
        inventoryIssue: true,
        evidenceIssue: false,
        pairingIssue: false,
        reason: "No verified activity inventory exists for the requested activity lane.",
      };
    }
    if (rawActivities > 0 || rejectedActivities > 0) {
      return {
        classification: "activity_evidence_gap",
        terminalOutcome: "confirmed_inventory_gap",
        requestFulfilled: false,
        partialResults: hasStandaloneResults,
        renderMode: hasStandaloneResults ? "partial_mixed" : null,
        inventoryIssue: false,
        evidenceIssue: true,
        pairingIssue: false,
        reason: "Activity candidates were retrieved, but none contained enough verified evidence to satisfy the requested activity.",
      };
    }
  }

  if (args.restaurantCount === 0) {
    if (args.restaurantAuditStatus === "confirmed_gap" || rawRestaurants === 0) {
      return {
        classification: "verified_restaurant_inventory_gap",
        terminalOutcome: "confirmed_inventory_gap",
        requestFulfilled: false,
        partialResults: hasStandaloneResults,
        renderMode: hasStandaloneResults ? "partial_mixed" : null,
        inventoryIssue: true,
        evidenceIssue: false,
        pairingIssue: false,
        reason: "No verified restaurant inventory exists for the requested restaurant lane.",
      };
    }
    if (rawRestaurants > 0 || rejectedRestaurants > 0) {
      return {
        classification: "restaurant_evidence_gap",
        terminalOutcome: "confirmed_inventory_gap",
        requestFulfilled: false,
        partialResults: hasStandaloneResults,
        renderMode: hasStandaloneResults ? "partial_mixed" : null,
        inventoryIssue: false,
        evidenceIssue: true,
        pairingIssue: false,
        reason: "Restaurant candidates were retrieved, but none contained enough verified evidence to satisfy the requested restaurant.",
      };
    }
  }

  const distanceOrGeo = /distance|geo|radius|walking|travel|coordinate/.test(primaryFailure);
  return {
    classification: distanceOrGeo ? "pairing_distance_or_geo_rejection" : "no_compatible_pair",
    terminalOutcome: distanceOrGeo ? "expected_constraint_no_pair" : "no_compatible_pair",
    requestFulfilled: false,
    partialResults: hasStandaloneResults,
    renderMode: hasStandaloneResults ? "partial_mixed" : null,
    inventoryIssue: false,
    evidenceIssue: false,
    pairingIssue: true,
    reason: distanceOrGeo
      ? "Both lanes have eligible inventory, but distance or geography rejected every pair."
      : "Both lanes have eligible inventory, but no compatible pair survived final pairing rules.",
  };
}
