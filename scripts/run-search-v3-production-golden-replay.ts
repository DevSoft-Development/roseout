import fs from "node:fs";
import path from "node:path";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createTheOutHavenSearchV3, type TheOutHavenSearchV3Client } from "@/lib/search/v3";
import { GOLDEN_SEARCH_QUERIES } from "@/lib/search/quality/goldenQueries";
import { buildV3ReplayMetrics, evaluateV3Execution, snapshotV3Execution } from "@/lib/search/quality/v3ReplayEvaluation";
import { validateSearchV3CoreLanes } from "@/lib/search/quality/v3LaneValidation";

type Variant = "five_lane" | "six_lane_review";

type Row = {
  id: string;
  query: string;
  category: string;
  passed: boolean;
  error: string | null;
  comparison: ReturnType<typeof evaluateV3Execution> | null;
  execution: ReturnType<typeof snapshotV3Execution> | null;
  laneValidation: ReturnType<typeof validateSearchV3CoreLanes> | null;
};

type VariantResult = {
  variant: Variant;
  rows: Row[];
  metrics: ReturnType<typeof buildV3ReplayMetrics>;
};

async function runVariant(variant: Variant): Promise<VariantResult> {
  const reviewEnabled = variant === "six_lane_review";
  const v3 = createTheOutHavenSearchV3(
    supabaseAdmin as unknown as TheOutHavenSearchV3Client,
    {
      reviewIntelligence: { enabled: reviewEnabled },
    },
  );

  const rows: Row[] = [];

  for (const testCase of GOLDEN_SEARCH_QUERIES) {
    const startedAt = Date.now();
    try {
      const execution = await v3.orchestrator.execute({
        requestId: `production-golden:${variant}:${Date.now()}:${testCase.id}`,
        query: testCase.query,
        limit: 20,
      });

      const comparison = evaluateV3Execution(testCase, execution, {
        legacyCount: 0,
        latencyMs: Date.now() - startedAt,
      });

      rows.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        passed: comparison.passed,
        error: null,
        comparison,
        execution: snapshotV3Execution(execution),
        laneValidation: validateSearchV3CoreLanes(execution.retrieval),
      });

      console.log(JSON.stringify({
        variant,
        id: testCase.id,
        passed: comparison.passed,
        resultCount: comparison.resultCount,
        pairCount: comparison.pairCount,
        exactDomainCoveragePass: comparison.exactDomainCoveragePass,
        geographyPass: comparison.geographyPass,
        pairRelevancePass: comparison.pairRelevancePass,
        pairTravelTimePass: comparison.pairTravelTimePass,
        pairRouteVerifiedPass: comparison.pairRouteVerifiedPass,
        latencyMs: comparison.latencyMs,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack ?? null : null;
      rows.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        passed: false,
        error: message,
        comparison: null,
        execution: null,
        laneValidation: null,
      });
      console.error(JSON.stringify({ variant, id: testCase.id, error: message, stack }));
    }
  }

  const metrics = buildV3ReplayMetrics(
    rows.map((row) => ({
      canonicalPassed: false,
      v3: row.comparison,
      contractFailure: Boolean(row.error),
    })),
  );

  const laneFailures = rows.filter((row) => row.laneValidation && !row.laneValidation.passed);
  return {
    variant,
    rows,
    metrics: {
      ...metrics,
      coreLaneValidationPassed: laneFailures.length === 0,
      coreLaneFailureCount: laneFailures.length,
    } as ReturnType<typeof buildV3ReplayMetrics> & {
      coreLaneValidationPassed: boolean;
      coreLaneFailureCount: number;
    },
  };
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function evaluateBaselinePromotionGate(result: VariantResult) {
  const thresholds = {
    minimumSuccessRate: envNumber("SEARCH_V3_GOLDEN_MIN_SUCCESS_RATE", 90),
    minimumPairSuccessRate: envNumber("SEARCH_V3_GOLDEN_MIN_PAIR_SUCCESS_RATE", 90),
    maximumNoResultRegressionRate: envNumber("SEARCH_V3_GOLDEN_MAX_NO_RESULT_REGRESSION_RATE", 0),
    maximumContractFailures: envNumber("SEARCH_V3_GOLDEN_MAX_CONTRACT_FAILURES", 0),
    maximumP95LatencyMs: envNumber("SEARCH_V3_GOLDEN_MAX_P95_LATENCY_MS", 5000),
  };

  const checks = {
    successRate: Number(result.metrics.successRate ?? 0) >= thresholds.minimumSuccessRate,
    pairSuccessRate:
      Number(result.metrics.pairSuccessRate ?? 0) >= thresholds.minimumPairSuccessRate,
    noResultRegressionRate:
      Number(result.metrics.noResultRegressionRate ?? 0) <= thresholds.maximumNoResultRegressionRate,
    contractFailures:
      Number(result.metrics.contractFailureCount ?? 0) <= thresholds.maximumContractFailures,
    p95Latency:
      Number(result.metrics.p95LatencyMs ?? Number.MAX_SAFE_INTEGER) <= thresholds.maximumP95LatencyMs,
    coreLanes: (result.metrics as any).coreLaneValidationPassed === true,
  };

  return {
    thresholds,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function compareVariants(baseline: VariantResult, review: VariantResult) {
  const baselineById = new Map(baseline.rows.map((row) => [row.id, row]));
  const reviewById = new Map(review.rows.map((row) => [row.id, row]));

  let wins = 0;
  let losses = 0;
  let ties = 0;
  const changed: Array<Record<string, unknown>> = [];

  for (const testCase of GOLDEN_SEARCH_QUERIES) {
    const before = baselineById.get(testCase.id);
    const after = reviewById.get(testCase.id);
    if (!before || !after) continue;

    if (!before.passed && after.passed) wins += 1;
    else if (before.passed && !after.passed) losses += 1;
    else ties += 1;

    const beforeTop = before.execution?.candidates?.slice(0, 5).map((candidate: any) => candidate.locationId) ?? [];
    const afterTop = after.execution?.candidates?.slice(0, 5).map((candidate: any) => candidate.locationId) ?? [];
    const rankingChanged = JSON.stringify(beforeTop) !== JSON.stringify(afterTop);

    if (before.passed !== after.passed || rankingChanged) {
      changed.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        beforePassed: before.passed,
        afterPassed: after.passed,
        rankingChanged,
        beforeTop5: beforeTop,
        afterTop5: afterTop,
      });
    }
  }

  return {
    wins,
    losses,
    ties,
    netWins: wins - losses,
    successRateDelta:
      Number(review.metrics.successRate ?? 0) - Number(baseline.metrics.successRate ?? 0),
    pairSuccessRateDelta:
      Number(review.metrics.pairSuccessRate ?? 0) -
      Number(baseline.metrics.pairSuccessRate ?? 0),
    p95LatencyDeltaMs:
      Number(review.metrics.p95LatencyMs ?? 0) -
      Number(baseline.metrics.p95LatencyMs ?? 0),
    contractFailureDelta:
      Number(review.metrics.contractFailureCount ?? 0) -
      Number(baseline.metrics.contractFailureCount ?? 0),
    changedQueryCount: changed.length,
    changed,
  };
}

async function main() {
  const outDir = process.env.SEARCH_V3_REPLAY_OUT_DIR || "artifacts";
  fs.mkdirSync(outDir, { recursive: true });

  const baseline = await runVariant("five_lane");
  const review = await runVariant("six_lane_review");
  const comparison = compareVariants(baseline, review);
  const promotionGate = evaluateBaselinePromotionGate(baseline);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "production",
    queryCount: GOLDEN_SEARCH_QUERIES.length,
    baseline,
    review,
    comparison,
    promotionGate,
    recommendation:
      comparison.losses === 0 &&
      comparison.wins > 0 &&
      comparison.successRateDelta >= 0 &&
      comparison.contractFailureDelta <= 0
        ? "candidate_for_controlled_canary"
        : "keep_review_lane_disabled",
  };

  const reportPath = path.join(outDir, "search-v3-golden-replay.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\nSearch V3 five-lane baseline");
  console.log(JSON.stringify(baseline.metrics, null, 2));
  console.log("\nSearch V3 six-lane review");
  console.log(JSON.stringify(review.metrics, null, 2));
  console.log("\nSearch V3 A/B comparison");
  console.log(JSON.stringify(comparison, null, 2));
  console.log("\nSearch V3 baseline promotion gate");
  console.log(JSON.stringify(promotionGate, null, 2));
  console.log(`Recommendation: ${report.recommendation}`);
  console.log(`Report: ${reportPath}`);

  if (
    !promotionGate.passed ||
    Number(baseline.metrics.contractFailureCount ?? 0) > 0 ||
    Number(review.metrics.contractFailureCount ?? 0) > 0
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
