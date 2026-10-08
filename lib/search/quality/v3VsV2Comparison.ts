export type SearchVersionMetrics = {
  successRate: number;
  pairSuccessRate: number;
  noResultRegressionRate: number;
  p95LatencyMs: number;
  contractFailureCount: number;
};

export function compareSearchV3ToV2(
  v2: SearchVersionMetrics,
  v3: SearchVersionMetrics,
) {
  const deltas = {
    successRate: v3.successRate - v2.successRate,
    pairSuccessRate: v3.pairSuccessRate - v2.pairSuccessRate,
    noResultRegressionRate:
      v3.noResultRegressionRate - v2.noResultRegressionRate,
    p95LatencyMs: v3.p95LatencyMs - v2.p95LatencyMs,
    contractFailures: v3.contractFailureCount - v2.contractFailureCount,
  };

  return {
    v2,
    v3,
    deltas,
    wins: {
      successRate: deltas.successRate > 0,
      pairSuccessRate: deltas.pairSuccessRate > 0,
      noResultRegressionRate: deltas.noResultRegressionRate < 0,
      p95LatencyMs: deltas.p95LatencyMs < 0,
      contractFailures: deltas.contractFailures < 0,
    },
    noRegressions: {
      successRate: deltas.successRate >= 0,
      pairSuccessRate: deltas.pairSuccessRate >= 0,
      noResultRegressionRate: deltas.noResultRegressionRate <= 0,
      contractFailures: deltas.contractFailures <= 0,
    },
  };
}
