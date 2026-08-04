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

export function collectPairingDiagnostics(response: any) {
  const inventory = responseDomainInventory(response);
  const debug = response?.debug?.pairing ?? response?.debug?.pairingDebug ?? response?.pairingDebug ?? {};
  const rejectedPairs = Array.isArray(debug?.rejectedPairs) ? debug.rejectedPairs : [];
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

  return {
    pairCandidatesEvaluated: Number(debug?.pairCandidatesEvaluated ?? 0),
    validPairCountBeforeRender: Number(debug?.validPairCountBeforeRender ?? inventory.counts.pairs ?? 0),
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
  return response?.requestFulfilled === true || response?.success === true;
}

function hasExplicitPairConstraint(response: any, diagnostics: ReturnType<typeof collectPairingDiagnostics>) {
  const plan = response?.searchPlan ?? response?.searchV2?.searchPlan ?? response?.debug?.searchPlan ?? {};
  const pairing = plan?.pairing ?? {};
  const travel = plan?.travel ?? {};
  const explicitPlanConstraint = pairing?.requireWalkable === true
    || Number.isFinite(Number(pairing?.maxWalkingMinutes))
    || Number.isFinite(Number(pairing?.maxDistanceMiles))
    || travel?.explicit === true
    || (typeof travel?.constraint === "string" && travel.constraint !== "none");
  const explicitRejection = diagnostics.rejectedPairs.some((pair: any) =>
    String(pair?.detail ?? "").includes("requested_")
    || pair?.normalizedReason === "walkability_constraint"
    || pair?.normalizedReason === "distance_exceeded",
  );
  return explicitPlanConstraint || explicitRejection;
}

function expectedConstraintNoPair(response: any, diagnostics: ReturnType<typeof collectPairingDiagnostics>) {
  if (diagnostics.candidateCounts.pairs > 0) return false;
  if (diagnostics.candidateCounts.restaurant === 0 || diagnostics.candidateCounts.activity === 0) return false;
  if (diagnostics.validPairCountBeforeRender > 0) return false;
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
  const servedPairOutcome = pairOutcome({ pairRequested, pairCount: canonicalPairs, response: canonical, diagnostics: servedDiagnostics });
  const strictPairOutcome = pairOutcome({ pairRequested, pairCount: strictPairs, response: strictCanonical, diagnostics: strictDiagnostics });
  const servedMissingPair = servedPairOutcome === "unexpected_missing_pair";
  const strictMissingPair = strictPairOutcome === "unexpected_missing_pair";
  const expectedConstraintNoPairOutcome = servedPairOutcome === "expected_constraint_no_pair"
    && strictPairOutcome === "expected_constraint_no_pair";
  const viablePairOmitted = canonicalPairs === 0 && servedDiagnostics.validPairCountBeforeRender > 0;
  const strictViablePairOmitted = strictPairs === 0 && strictDiagnostics.validPairCountBeforeRender > 0;
  const falseFulfillment = pairRequested && canonicalPairs === 0 && responseClaimsFulfillment(canonical);
  const strictFalseFulfillment = pairRequested && strictPairs === 0 && responseClaimsFulfillment(strictCanonical);
  const servedStrictPairParityMismatch = pairRequested
    && servedPairOutcome !== strictPairOutcome
    && !(servedPairOutcome === "pair_served" && strictPairOutcome === "expected_constraint_no_pair");
  const canonicalProfileNoCandidates = pairRequested && canonicalProfileCandidateCount === 0;
  const noResultRegression = legacyCount > 0 && canonicalCount === 0;

  const reasons = [
    noResultRegression ? "canonical_no_result_regression" : null,
    unexpectedDomains.length ? "unexpected_domain" : null,
    servedMissingPair ? "unexpected_missing_pair" : null,
    strictMissingPair ? "strict_unexpected_missing_pair" : null,
    viablePairOmitted ? "viable_pair_omitted" : null,
    strictViablePairOmitted ? "strict_viable_pair_omitted" : null,
    falseFulfillment ? "false_pair_fulfillment" : null,
    strictFalseFulfillment ? "strict_false_pair_fulfillment" : null,
    servedStrictPairParityMismatch ? "served_strict_pair_parity_mismatch" : null,
    canonicalProfileNoCandidates ? "canonical_profile_no_candidates" : null,
    fallbackUsed ? "legacy_fallback" : null,
    latencyMs > 3000 ? "slow_over_3s" : null,
  ].filter(Boolean) as string[];

  return {
    passed: reasons.length === 0,
    reasons,
    pairOutcome: servedPairOutcome,
    strictPairOutcome,
    expectedConstraintNoPair: expectedConstraintNoPairOutcome,
    latencyMs,
    legacyCount,
    canonicalCount,
    strictCount: countResponseResults(strictCanonical),
    canonicalPairs,
    strictPairs,
    servedMissingPair,
    strictMissingPair,
    viablePairOmitted,
    strictViablePairOmitted,
    falseFulfillment,
    strictFalseFulfillment,
    servedStrictPairParityMismatch,
    canonicalProfileNoCandidates,
    fallbackUsed,
    noResultRegression,
    returnedDomains,
    parsedDomains: [...parsedDomains],
    unexpectedDomains,
    strictDomainCounts: strictInventory.counts,
    pairingDiagnostics: {
      served: servedDiagnostics,
      strict: strictDiagnostics,
    },
  };
}

export function unresolvedRegressionQueries(rows: Array<{ query?: string; passed?: boolean }>) {
  const failing = new Set(rows.filter((row) => row.passed === false).map((row) => String(row.query ?? "").toLowerCase()));
  return PRODUCTION_REPLAY_REGRESSION_QUERIES.filter((query) => failing.has(query.toLowerCase()));
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
  rows: Array<{ passed?: boolean }>;
  unresolvedRequiredRegressions: string[];
  p95LatencyMs: number;
}) {
  return persistedRowCount === rowCount
    && rows.every((row) => row.passed !== false)
    && unresolvedRequiredRegressions.length === 0
    && p95LatencyMs <= 3000;
}
