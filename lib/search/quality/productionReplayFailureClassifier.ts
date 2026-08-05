import { countResponseResults, responseDomainInventory } from "./replayEvaluation";

export const PRODUCTION_REPLAY_REGRESSION_QUERIES = [
  "Sushi and an escape room near Garden City for four people",
  "Halal restaurant and karaoke within a 20-minute walk in Flushing",
  "Sushi dinner and an escape room in Garden City",
  "Halal dinner and karaoke within a 20-minute walk in Flushing",
  "Steak dinner and a relaxed lounge in Midtown within 30 minutes walking",
] as const;

export type PairRejectionReason =
  | "distance_exceeded"
  | "missing_coordinates"
  | "market_mismatch"
  | "walkability_constraint"
  | "schedule_open_hours_conflict"
  | "insufficient_domain_candidates"
  | "other";

export type ProductionReplayPairOutcome =
  | "pair_served"
  | "expected_constraint_no_pair"
  | "unexpected_missing_pair"
  | "pair_not_requested";

export type ProductionReplayDisposition =
  | "passed"
  | "expected_constraint_no_pair"
  | "clarification_required"
  | "known_inventory_gap"
  | "unsupported_market"
  | "anchor_not_found"
  | "temporary_external_failure"
  | "fixable_regression";

export function normalizePairRejectionReason(reason: unknown): PairRejectionReason {
  const value = String(reason ?? "").trim().toLowerCase();
  if (value === "walkability_constraint") return "walkability_constraint";
  if (value === "distance_exceeded") return "distance_exceeded";
  if (value === "missing_coordinates") return "missing_coordinates";
  if (value === "market_mismatch") return "market_mismatch";
  if (value === "schedule_open_hours_conflict") return "schedule_open_hours_conflict";
  if (value === "insufficient_domain_candidates") return "insufficient_domain_candidates";
  if (value.includes("missing_coordinate")) return "missing_coordinates";
  if (value.includes("walkability") || value.includes("walking") || value.includes("walkable")) return "walkability_constraint";
  if (value.includes("distance")) return "distance_exceeded";
  if (value.includes("market") || value.includes("cross_state") || value.includes("geo")) return "market_mismatch";
  if (value.includes("schedule") || value.includes("open_hour") || value.includes("closed")) return "schedule_open_hours_conflict";
  if (value.includes("insufficient") || value.includes("no_candidate")) return "insufficient_domain_candidates";
  return "other";
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function readFinalEligiblePairCount(debug: any) {
  return readNumber(
    debug?.renderEligiblePairCount,
    debug?.validPairCountAfterConstraints,
    debug?.validPairCountAfterDiversification,
  );
}

export function collectCandidateLossDiagnostics(response: any) {
  const debug = response?.debug ?? {};
  const retrieval = response?.retrieval ?? {};
  const stages = debug?.candidateStages ?? debug?.candidateLoss ?? retrieval?.candidateStages ?? {};
  const inventory = responseDomainInventory(response);
  const profileCandidates = readNumber(stages.profileCandidates, retrieval.profileCandidateCount) ?? 0;
  const geoEligibleCandidates = readNumber(stages.geoEligibleCandidates, stages.afterGeo);
  const domainAssignedCandidates = readNumber(stages.domainAssignedCandidates, stages.afterDomainAssignment);
  const taxonomyEligibleCandidates = readNumber(stages.taxonomyEligibleCandidates, stages.afterTaxonomy);
  const publishableCandidates = readNumber(stages.publishableCandidates, stages.afterPublishability);
  const finalRestaurantCandidates = readNumber(stages.finalRestaurantCandidates, inventory.counts.restaurant) ?? 0;
  const finalActivityCandidates = readNumber(stages.finalActivityCandidates, inventory.counts.activity) ?? 0;
  const rejectedCandidates: any[] = Array.isArray(stages.rejectedCandidates) ? stages.rejectedCandidates : [];
  const rejectionReasonCounts = rejectedCandidates.reduce<Record<string, number>>((counts, candidate: any) => {
    const reason = String(candidate?.rejectionReason ?? candidate?.reason ?? "unknown");
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});

  const inventoryAudit = debug?.inventoryAudit ?? retrieval?.inventoryAudit ?? {};
  const inventoryGapConfirmed = inventoryAudit?.status === "confirmed_gap"
    || retrieval?.inventoryGapConfirmed === true;
  const supportedMarket = inventoryAudit?.supportedMarket !== false
    && retrieval?.supportedMarket !== false;

  return {
    profileCandidates,
    geoEligibleCandidates,
    domainAssignedCandidates,
    taxonomyEligibleCandidates,
    publishableCandidates,
    finalRestaurantCandidates,
    finalActivityCandidates,
    rejectedCandidates,
    rejectionReasonCounts,
    inventoryAuditId: inventoryAudit?.id ?? null,
    inventoryGapConfirmed,
    supportedMarket,
    hasStageEvidence: [
      geoEligibleCandidates,
      domainAssignedCandidates,
      taxonomyEligibleCandidates,
      publishableCandidates,
    ].some((value) => value != null) || rejectedCandidates.length > 0,
  };
}

export function collectPairingDiagnostics(response: any) {
  const inventory = responseDomainInventory(response);
  const debug = response?.debug?.pairing ?? response?.debug?.pairingDebug ?? response?.pairingDebug ?? {};
  const rejectedPairs = Array.isArray(debug?.rejectedPairs) ? debug.rejectedPairs : [];
  const finalEligiblePairs: any[] = Array.isArray(debug?.finalEligiblePairs) ? debug.finalEligiblePairs : [];
  const rejectionCounts: Record<PairRejectionReason, number> = {
    distance_exceeded: 0,
    missing_coordinates: 0,
    market_mismatch: 0,
    walkability_constraint: 0,
    schedule_open_hours_conflict: 0,
    insufficient_domain_candidates: 0,
    other: 0,
  };

  const normalizedRejectedPairs = rejectedPairs.map((pair: any) => {
    const normalizedReason = normalizePairRejectionReason(pair?.reason ?? pair?.detail);
    rejectionCounts[normalizedReason] += 1;
    return { ...pair, normalizedReason };
  });

  const restaurantCandidates = Number(inventory.counts.restaurant ?? 0);
  const activityCandidates = Number(inventory.counts.activity ?? 0);
  if ((restaurantCandidates === 0 || activityCandidates === 0) && rejectionCounts.insufficient_domain_candidates === 0) {
    rejectionCounts.insufficient_domain_candidates += 1;
  }

  const finalEligiblePairCount = readFinalEligiblePairCount(debug);
  const countMatchesIds = finalEligiblePairCount == null
    ? finalEligiblePairs.length === 0
    : finalEligiblePairCount === finalEligiblePairs.length;
  const producerContractValid = debug?.eligibilityContractValid !== false;
  const eligibilityContractValid = countMatchesIds && producerContractValid;
  const eligibilityContractViolation = eligibilityContractValid
    ? null
    : String(
        debug?.eligibilityContractViolation
        ?? `renderEligiblePairCount=${finalEligiblePairCount};finalEligiblePairs=${finalEligiblePairs.length}`,
      );

  return {
    pairCandidatesEvaluated: Number(debug?.pairCandidatesEvaluated ?? 0),
    validPairCountBeforeRender: Number(debug?.validPairCountBeforeRender ?? inventory.counts.pairs ?? 0),
    validPairCountAfterConstraints: readNumber(debug?.validPairCountAfterConstraints),
    validPairCountAfterDiversification: readNumber(debug?.validPairCountAfterDiversification),
    finalEligiblePairCount,
    finalEligiblePairs,
    eligibilityContractValid,
    eligibilityContractViolation,
    hasFinalEligibilityEvidence: finalEligiblePairCount != null && eligibilityContractValid,
    rejectionCounts,
    rejectedPairs: normalizedRejectedPairs,
    candidateCounts: {
      restaurant: restaurantCandidates,
      activity: activityCandidates,
      pairs: Number(inventory.counts.pairs ?? 0),
    },
  };
}

function requestedPairDomains(response: any) {
  return new Set(
    (Array.isArray(response?.debug?.retrievalCalls) ? response.debug.retrievalCalls : [])
      .map((call: any) => call.domain)
      .filter(Boolean),
  );
}

function responseClaimsFulfillment(response: any) {
  return response?.requestFulfilled === true;
}

function hasExplicitPairConstraint(response: any, diagnostics: ReturnType<typeof collectPairingDiagnostics>) {
  const plan = response?.searchPlan ?? response?.searchV2?.searchPlan ?? response?.debug?.searchPlan ?? {};
  const pairing = plan?.pairing ?? {};
  const travel = plan?.travel ?? {};
  return pairing?.requireWalkable === true
    || finiteNumber(pairing?.maxWalkingMinutes) != null
    || finiteNumber(pairing?.maxDistanceMiles) != null
    || travel?.explicit === true
    || (typeof travel?.constraint === "string" && travel.constraint !== "none")
    || diagnostics.rejectedPairs.some((pair: any) =>
      String(pair?.detail ?? "").includes("requested_")
      || pair?.normalizedReason === "walkability_constraint"
      || pair?.normalizedReason === "distance_exceeded",
    );
}

function expectedConstraintNoPair(response: any, diagnostics: ReturnType<typeof collectPairingDiagnostics>) {
  if (!diagnostics.eligibilityContractValid) return false;
  if (diagnostics.candidateCounts.pairs > 0) return false;
  if (diagnostics.candidateCounts.restaurant === 0 || diagnostics.candidateCounts.activity === 0) return false;
  if (diagnostics.finalEligiblePairCount != null && diagnostics.finalEligiblePairCount > 0) return false;
  if (!hasExplicitPairConstraint(response, diagnostics)) return false;
  const constrained = diagnostics.rejectionCounts.walkability_constraint
    + diagnostics.rejectionCounts.distance_exceeded
    + diagnostics.rejectionCounts.schedule_open_hours_conflict;
  const disqualifying = diagnostics.rejectionCounts.missing_coordinates
    + diagnostics.rejectionCounts.market_mismatch
    + diagnostics.rejectionCounts.insufficient_domain_candidates
    + diagnostics.rejectionCounts.other;
  return constrained > 0 && disqualifying === 0;
}

function pairOutcome({ pairRequested, pairCount, response, diagnostics }: {
  pairRequested: boolean;
  pairCount: number;
  response: any;
  diagnostics: ReturnType<typeof collectPairingDiagnostics>;
}): ProductionReplayPairOutcome {
  if (!pairRequested) return "pair_not_requested";
  if (pairCount > 0) return "pair_served";
  return expectedConstraintNoPair(response, diagnostics)
    ? "expected_constraint_no_pair"
    : "unexpected_missing_pair";
}

function finalEligiblePairWasOmitted(pairCount: number, diagnostics: ReturnType<typeof collectPairingDiagnostics>) {
  return pairCount === 0
    && diagnostics.hasFinalEligibilityEvidence
    && Number(diagnostics.finalEligiblePairCount) > 0;
}

function responseOutcome(response: any) {
  const anchor = response?.debug?.anchorResolution ?? response?.anchorResolution ?? {};
  const status = String(
    response?.outcome
    ?? response?.status
    ?? anchor?.status
    ?? response?.debug?.resolutionStatus
    ?? "",
  ).toLowerCase();
  return { anchor, status };
}

const ACCEPTED_INVENTORY_REJECTION_REASONS = new Set([
  "market_mismatch",
  "outside_requested_radius",
  "state_mismatch",
  "insufficient_domain_candidates",
]);

function evidenceBackedInventoryGap({
  pairRequested,
  canonical,
  strictCanonical,
  servedDiagnostics,
  strictDiagnostics,
  candidateLoss,
  strictCandidateLoss,
  viablePairOmitted,
  strictViablePairOmitted,
  pairingContractViolation,
  strictPairingContractViolation,
  servedStrictPairParityMismatch,
}: {
  pairRequested: boolean;
  canonical: any;
  strictCanonical: any;
  servedDiagnostics: ReturnType<typeof collectPairingDiagnostics>;
  strictDiagnostics: ReturnType<typeof collectPairingDiagnostics>;
  candidateLoss: ReturnType<typeof collectCandidateLossDiagnostics>;
  strictCandidateLoss: ReturnType<typeof collectCandidateLossDiagnostics>;
  viablePairOmitted: boolean;
  strictViablePairOmitted: boolean;
  pairingContractViolation: boolean;
  strictPairingContractViolation: boolean;
  servedStrictPairParityMismatch: boolean;
}) {
  if (!pairRequested) return false;
  if (responseClaimsFulfillment(canonical) || responseClaimsFulfillment(strictCanonical)) return false;
  if (candidateLoss.supportedMarket === false || strictCandidateLoss.supportedMarket === false) return false;
  if (!candidateLoss.hasStageEvidence || !strictCandidateLoss.hasStageEvidence) return false;
  if (pairingContractViolation || strictPairingContractViolation || servedStrictPairParityMismatch) return false;
  if (viablePairOmitted || strictViablePairOmitted) return false;
  if ((servedDiagnostics.finalEligiblePairCount ?? 0) > 0 || (strictDiagnostics.finalEligiblePairCount ?? 0) > 0) return false;

  const servedLaneMissing = candidateLoss.finalRestaurantCandidates === 0
    || candidateLoss.finalActivityCandidates === 0;
  const strictLaneMissing = strictCandidateLoss.finalRestaurantCandidates === 0
    || strictCandidateLoss.finalActivityCandidates === 0;
  if (!servedLaneMissing || !strictLaneMissing) return false;

  if (candidateLoss.inventoryGapConfirmed && strictCandidateLoss.inventoryGapConfirmed) return true;

  const evidenceReasons = [
    ...Object.keys(candidateLoss.rejectionReasonCounts),
    ...Object.keys(strictCandidateLoss.rejectionReasonCounts),
  ];
  if (evidenceReasons.length === 0) return false;
  if (!evidenceReasons.every((reason) => ACCEPTED_INVENTORY_REJECTION_REASONS.has(reason))) return false;

  const servedExplained = candidateLoss.geoEligibleCandidates === 0
    || candidateLoss.finalRestaurantCandidates === 0
    || candidateLoss.finalActivityCandidates === 0;
  const strictExplained = strictCandidateLoss.geoEligibleCandidates === 0
    || strictCandidateLoss.finalRestaurantCandidates === 0
    || strictCandidateLoss.finalActivityCandidates === 0;
  return servedExplained && strictExplained;
}

function classifyDisposition({
  canonical,
  expectedConstraintNoPairOutcome,
  inventoryGapOutcome,
  blockingReasons,
  candidateLoss,
}: {
  canonical: any;
  expectedConstraintNoPairOutcome: boolean;
  inventoryGapOutcome: boolean;
  blockingReasons: string[];
  candidateLoss: ReturnType<typeof collectCandidateLossDiagnostics>;
}): ProductionReplayDisposition {
  if (expectedConstraintNoPairOutcome) return "expected_constraint_no_pair";
  const { anchor, status } = responseOutcome(canonical);
  if (status === "clarification_required" || anchor?.requiresClarification === true) return "clarification_required";
  if (status === "anchor_not_found" || anchor?.status === "not_found") return "anchor_not_found";
  if (status === "unsupported_market" || candidateLoss.supportedMarket === false) return "unsupported_market";
  if (inventoryGapOutcome || (candidateLoss.inventoryGapConfirmed && !responseClaimsFulfillment(canonical))) return "known_inventory_gap";
  if (status === "temporary_external_failure") return "temporary_external_failure";
  if (blockingReasons.length > 0) return "fixable_regression";
  return "passed";
}

function dispositionBlocksCanary(disposition: ProductionReplayDisposition) {
  return disposition === "fixable_regression" || disposition === "temporary_external_failure";
}

export function classifyProductionReplayFailure(legacy: any, canonical: any, strictCanonical: any) {
  const legacyCount = countResponseResults(legacy);
  const canonicalCount = countResponseResults(canonical);
  const canonicalInventory = responseDomainInventory(canonical);
  const strictInventory = responseDomainInventory(strictCanonical);
  const canonicalPairs = Number(canonicalInventory.counts.pairs ?? 0);
  const strictPairs = Number(strictInventory.counts.pairs ?? 0);
  const parsedDomains = requestedPairDomains(strictCanonical);
  const pairRequested = parsedDomains.has("restaurant") && parsedDomains.has("activity");
  const fallbackUsed = Boolean(canonical?.retrieval?.legacyFallbackUsed);
  const canonicalProfileCandidateCount = Number(canonical?.retrieval?.profileCandidateCount ?? 0);
  const latencyMs = Number(canonical?.timing?.totalMs ?? 0);
  const returnedDomains = [...strictInventory.servedDomains];
  const unexpectedDomains = parsedDomains.size
    ? returnedDomains.filter((domain) => !parsedDomains.has(domain))
    : [];

  const servedDiagnostics = collectPairingDiagnostics(canonical);
  const strictDiagnostics = collectPairingDiagnostics(strictCanonical);
  const candidateLoss = collectCandidateLossDiagnostics(canonical);
  const strictCandidateLoss = collectCandidateLossDiagnostics(strictCanonical);
  const servedPairOutcome = pairOutcome({ pairRequested, pairCount: canonicalPairs, response: canonical, diagnostics: servedDiagnostics });
  const strictPairOutcome = pairOutcome({ pairRequested, pairCount: strictPairs, response: strictCanonical, diagnostics: strictDiagnostics });
  const expectedConstraintNoPairOutcome = servedPairOutcome === "expected_constraint_no_pair"
    && strictPairOutcome === "expected_constraint_no_pair";
  const viablePairOmitted = finalEligiblePairWasOmitted(canonicalPairs, servedDiagnostics);
  const strictViablePairOmitted = finalEligiblePairWasOmitted(strictPairs, strictDiagnostics);
  const falseFulfillment = pairRequested && canonicalPairs === 0 && responseClaimsFulfillment(canonical);
  const strictFalseFulfillment = pairRequested && strictPairs === 0 && responseClaimsFulfillment(strictCanonical);
  const servedStrictPairParityMismatch = pairRequested
    && servedPairOutcome !== strictPairOutcome
    && !(servedPairOutcome === "pair_served" && strictPairOutcome === "expected_constraint_no_pair");
  const canonicalProfileNoCandidates = pairRequested && canonicalProfileCandidateCount === 0;
  const noResultRegression = legacyCount > 0 && canonicalCount === 0;
  const pairingContractViolation = !servedDiagnostics.eligibilityContractValid;
  const strictPairingContractViolation = !strictDiagnostics.eligibilityContractValid;
  const inventoryGapOutcome = evidenceBackedInventoryGap({
    pairRequested,
    canonical,
    strictCanonical,
    servedDiagnostics,
    strictDiagnostics,
    candidateLoss,
    strictCandidateLoss,
    viablePairOmitted,
    strictViablePairOmitted,
    pairingContractViolation,
    strictPairingContractViolation,
    servedStrictPairParityMismatch,
  });

  const rawReasons = [
    noResultRegression ? "canonical_no_result_regression" : null,
    unexpectedDomains.length ? "unexpected_domain" : null,
    pairingContractViolation ? "pairing_diagnostics_contract_violation" : null,
    strictPairingContractViolation ? "strict_pairing_diagnostics_contract_violation" : null,
    servedPairOutcome === "unexpected_missing_pair" ? "unexpected_missing_pair" : null,
    strictPairOutcome === "unexpected_missing_pair" ? "strict_unexpected_missing_pair" : null,
    viablePairOmitted ? "viable_pair_omitted" : null,
    strictViablePairOmitted ? "strict_viable_pair_omitted" : null,
    falseFulfillment ? "false_pair_fulfillment" : null,
    strictFalseFulfillment ? "strict_false_pair_fulfillment" : null,
    servedStrictPairParityMismatch ? "served_strict_pair_parity_mismatch" : null,
    canonicalProfileNoCandidates ? "canonical_profile_no_candidates" : null,
    fallbackUsed ? "legacy_fallback" : null,
    latencyMs > 3000 ? "slow_over_3s" : null,
  ].filter(Boolean) as string[];

  const blockingReasons = rawReasons.filter((reason) => {
    if (reason === "legacy_fallback") return false;
    if (inventoryGapOutcome && [
      "canonical_no_result_regression",
      "unexpected_missing_pair",
      "strict_unexpected_missing_pair",
      "canonical_profile_no_candidates",
    ].includes(reason)) return false;
    return true;
  });

  const disposition = classifyDisposition({
    canonical,
    expectedConstraintNoPairOutcome,
    inventoryGapOutcome,
    blockingReasons,
    candidateLoss,
  });
  const blocksCanary = dispositionBlocksCanary(disposition);
  const reasons = blocksCanary ? blockingReasons : [];

  return {
    passed: !blocksCanary,
    disposition,
    blocksCanary,
    retirementEligible: [
      "known_inventory_gap",
      "unsupported_market",
      "anchor_not_found",
    ].includes(disposition),
    reasons,
    diagnosticReasons: rawReasons,
    pairOutcome: servedPairOutcome,
    strictPairOutcome,
    expectedConstraintNoPair: expectedConstraintNoPairOutcome,
    inventoryGapOutcome,
    latencyMs,
    legacyCount,
    canonicalCount,
    strictCount: countResponseResults(strictCanonical),
    canonicalPairs,
    strictPairs,
    servedMissingPair: servedPairOutcome === "unexpected_missing_pair",
    strictMissingPair: strictPairOutcome === "unexpected_missing_pair",
    viablePairOmitted,
    strictViablePairOmitted,
    falseFulfillment,
    strictFalseFulfillment,
    servedStrictPairParityMismatch,
    canonicalProfileNoCandidates,
    fallbackUsed,
    noResultRegression,
    pairingContractViolation,
    strictPairingContractViolation,
    returnedDomains,
    parsedDomains: [...parsedDomains],
    unexpectedDomains,
    strictDomainCounts: strictInventory.counts,
    pairingDiagnostics: { served: servedDiagnostics, strict: strictDiagnostics },
    candidateLossDiagnostics: { served: candidateLoss, strict: strictCandidateLoss },
  };
}

export function unresolvedRegressionQueries(rows: Array<{ query: string; passed?: boolean; blocksCanary?: boolean }>) {
  const byQuery = new Map(rows.map((row) => [row.query.toLowerCase(), row]));
  return PRODUCTION_REPLAY_REGRESSION_QUERIES.filter((query) => {
    const row = byQuery.get(query.toLowerCase());
    return !row || row.blocksCanary === true || row.passed === false;
  });
}

export function productionReplayCanaryReady({
  persistedRowCount,
  rowCount,
  rows,
  unresolvedRequiredRegressions,
  p95LatencyMs,
}: {
  persistedRowCount: number;
  rowCount: number;
  rows: Array<{ passed?: boolean; blocksCanary?: boolean }>;
  unresolvedRequiredRegressions: string[];
  p95LatencyMs: number;
}) {
  return rowCount > 0
    && persistedRowCount === rowCount
    && rows.every((row) => row.blocksCanary !== true && row.passed !== false)
    && unresolvedRequiredRegressions.length === 0
    && p95LatencyMs <= 3000;
}
