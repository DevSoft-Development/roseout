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

function normalizePairRejectionReason(reason: unknown): PairRejectionReason {
  const value = String(reason ?? "").toLowerCase();
  if (value.includes("missing_coordinate")) return "missing_coordinates";
  if (value.includes("walking") || value.includes("walkable")) return "walkability_constraint";
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
    const normalizedReason = normalizePairRejectionReason(pair?.reason);
    rejectionCounts[normalizedReason] += 1;
    return { ...pair, normalizedReason };
  });

  const restaurantCandidates = Number(inventory.counts.restaurant ?? 0);
  const activityCandidates = Number(inventory.counts.activity ?? 0);
  if (restaurantCandidates === 0 || activityCandidates === 0) {
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

export function classifyProductionReplayFailure(legacy: any, canonical: any, strictCanonical: any) {
  const legacyCount = countResponseResults(legacy);
  const canonicalCount = countResponseResults(canonical);
  const canonicalInventory = responseDomainInventory(canonical);
  const strictInventory = responseDomainInventory(strictCanonical);
  const canonicalPairs = Number(canonicalInventory.counts.pairs ?? 0);
  const strictPairs = Number(strictInventory.counts.pairs ?? 0);
  const parsedDomains = new Set(
    (Array.isArray(strictCanonical?.debug?.retrievalCalls) ? strictCanonical.debug.retrievalCalls : [])
      .map((call: any) => call.domain)
      .filter(Boolean),
  );
  const pairRequested = parsedDomains.has("restaurant") && parsedDomains.has("activity");
  const fallbackUsed = Boolean(canonical?.retrieval?.legacyFallbackUsed);
  const canonicalProfileCandidateCount = Number(canonical?.retrieval?.profileCandidateCount ?? 0);
  const latencyMs = Number(canonical?.timing?.totalMs ?? 0);
  const returnedDomains = [...strictInventory.servedDomains];
  const unexpectedDomains = parsedDomains.size
    ? returnedDomains.filter((domain) => !parsedDomains.has(domain))
    : [];

  const servedMissingPair = pairRequested && canonicalPairs === 0;
  const strictMissingPair = pairRequested && strictPairs === 0;
  const canonicalProfileNoCandidates = pairRequested && canonicalProfileCandidateCount === 0;
  const noResultRegression = legacyCount > 0 && canonicalCount === 0;

  const reasons = [
    noResultRegression ? "canonical_no_result_regression" : null,
    unexpectedDomains.length ? "unexpected_domain" : null,
    servedMissingPair ? "served_missing_pair" : null,
    strictMissingPair ? "strict_missing_pair" : null,
    canonicalProfileNoCandidates ? "canonical_profile_no_candidates" : null,
    fallbackUsed ? "legacy_fallback" : null,
    latencyMs > 3000 ? "slow_over_3s" : null,
  ].filter(Boolean) as string[];

  return {
    passed: reasons.length === 0,
    reasons,
    latencyMs,
    legacyCount,
    canonicalCount,
    strictCount: countResponseResults(strictCanonical),
    canonicalPairs,
    strictPairs,
    servedMissingPair,
    strictMissingPair,
    canonicalProfileNoCandidates,
    fallbackUsed,
    noResultRegression,
    returnedDomains,
    parsedDomains: [...parsedDomains],
    unexpectedDomains,
    strictDomainCounts: strictInventory.counts,
    pairingDiagnostics: {
      served: collectPairingDiagnostics(canonical),
      strict: collectPairingDiagnostics(strictCanonical),
    },
  };
}

export function unresolvedRegressionQueries(rows: Array<{ query?: string; passed?: boolean }>) {
  const failing = new Set(rows.filter((row) => row.passed === false).map((row) => String(row.query ?? "").toLowerCase()));
  return PRODUCTION_REPLAY_REGRESSION_QUERIES.filter((query) => failing.has(query.toLowerCase()));
}
