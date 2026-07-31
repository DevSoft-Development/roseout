export type SearchFailureClass =
  | "PARSER_FAILURE"
  | "UNKNOWN_TAXONOMY"
  | "NO_INVENTORY"
  | "PROFILE_CLASSIFICATION_GAP"
  | "RETRIEVAL_RECALL_FAILURE"
  | "ROLE_ASSIGNMENT_FAILURE"
  | "GEOGRAPHY_REJECTION"
  | "HARD_DISTANCE_NO_PAIR"
  | "ANCHOR_DISTANCE_VIOLATION"
  | "RANKING_FAILURE"
  | "SERIALIZATION_FAILURE"
  | "UNCLASSIFIED";

export type SearchReliabilityInput = {
  responseContractValid: boolean;
  parserConfidence?: number | null;
  unknownTerms?: string[];
  knownInventoryRequired?: boolean;
  profileCandidateCount?: number;
  legacyCandidateCount?: number;
  retrievedCandidateCount?: number;
  restaurantCandidateCount?: number;
  activityCandidateCount?: number;
  restaurantRequired?: boolean;
  activityRequired?: boolean;
  rejectedForGeography?: number;
  rejectedForDistance?: number;
  evaluatedPairs?: number;
  hardDistance?: boolean;
  anchorRequested?: boolean;
  anchorResolved?: boolean;
  singleDomainDistanceViolations?: number;
  displayedResults?: number;
  expectedResultIds?: string[];
  displayedResultIds?: string[];
};

export function classifySearchFailure(input: SearchReliabilityInput): SearchFailureClass | null {
  if (!input.responseContractValid) return "SERIALIZATION_FAILURE";
  if ((input.parserConfidence ?? 1) < 0.5) return "PARSER_FAILURE";
  if ((input.unknownTerms?.length ?? 0) > 0) return "UNKNOWN_TAXONOMY";
  const retrieved = input.retrievedCandidateCount ?? 0;
  const profile = input.profileCandidateCount ?? 0;
  const legacy = input.legacyCandidateCount ?? 0;
  if (input.knownInventoryRequired && retrieved === 0) {
    if (profile === 0 && legacy > 0) return "PROFILE_CLASSIFICATION_GAP";
    return "RETRIEVAL_RECALL_FAILURE";
  }
  if (!input.knownInventoryRequired && retrieved === 0) return "NO_INVENTORY";
  if (input.restaurantRequired && (input.restaurantCandidateCount ?? 0) === 0) return "ROLE_ASSIGNMENT_FAILURE";
  if (input.activityRequired && (input.activityCandidateCount ?? 0) === 0) return "ROLE_ASSIGNMENT_FAILURE";
  if (input.hardDistance && input.anchorRequested && input.anchorResolved && (input.singleDomainDistanceViolations ?? 0) > 0) return "ANCHOR_DISTANCE_VIOLATION";
  const evaluated = input.evaluatedPairs ?? 0;
  if (evaluated > 0 && (input.rejectedForGeography ?? 0) >= evaluated) return "GEOGRAPHY_REJECTION";
  if (input.hardDistance && evaluated > 0 && (input.rejectedForDistance ?? 0) >= evaluated) return "HARD_DISTANCE_NO_PAIR";
  if ((input.expectedResultIds?.length ?? 0) > 0) {
    const displayed = new Set(input.displayedResultIds ?? []);
    if (!input.expectedResultIds!.some((id) => displayed.has(id))) return "RANKING_FAILURE";
  }
  return (input.displayedResults ?? 0) > 0 ? null : "UNCLASSIFIED";
}

export function evaluateEngineCorrectness(args: { responseContractValid: boolean; wrongDomainCount: number; geographyLeakageCount: number; hardConstraintViolations: number; parserCorrect: boolean }) {
  return args.responseContractValid && args.wrongDomainCount === 0 && args.geographyLeakageCount === 0 && args.hardConstraintViolations === 0 && args.parserCorrect;
}

export function acceptableOutcome(args: { engineCorrect: boolean; fulfilled: boolean; knownInventoryRequired: boolean; failureClass: SearchFailureClass | null }) {
  if (!args.engineCorrect) return false;
  if (args.fulfilled) return true;
  if (args.knownInventoryRequired) return false;
  return args.failureClass === "NO_INVENTORY" || args.failureClass === "HARD_DISTANCE_NO_PAIR";
}
