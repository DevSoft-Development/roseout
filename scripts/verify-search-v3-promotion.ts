import { supabaseAdmin } from "@/lib/supabase-admin";

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const db = supabaseAdmin as any;
  const [{ data: phaseRows, error: phaseError }, { data: replayRows, error: replayError }] =
    await Promise.all([
      db
        .from("cron_job_runs")
        .select("started_at,status,details")
        .eq("job_key", "search-phase13-maintenance")
        .order("started_at", { ascending: false })
        .limit(1),
      db
        .from("search_quality_replay_runs")
        .select("id,completed_at,status,source,metrics")
        .eq("source", "golden")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  if (phaseError) throw new Error(phaseError.message);
  if (replayError) throw new Error(replayError.message);

  const phase = phaseRows?.[0];
  const replay = replayRows?.[0];
  if (!phase) throw new Error("search_v3_phase13_state_missing");
  if (!replay) throw new Error("search_v3_golden_replay_missing");

  const embeddings = phase.details?.embeddings ?? {};
  const metrics = replay.metrics ?? {};
  const v3 = metrics.v3 ?? {};
  const comparison = metrics.v3VsV2 ?? {};
  const noRegressions = comparison.noRegressions ?? {};

  const thresholds = {
    maximumRemaining: n(process.env.SEARCH_V3_PROMOTION_MAX_REMAINING, 50),
    minimumSuccessRate: n(process.env.SEARCH_V3_PROMOTION_MIN_SUCCESS_RATE, 90),
    minimumPairSuccessRate: n(process.env.SEARCH_V3_PROMOTION_MIN_PAIR_SUCCESS_RATE, 90),
    maximumNoResultRegressionRate: n(
      process.env.SEARCH_V3_PROMOTION_MAX_NO_RESULT_REGRESSION_RATE,
      0,
    ),
    maximumContractFailures: n(process.env.SEARCH_V3_PROMOTION_MAX_CONTRACT_FAILURES, 0),
    maximumP95LatencyMs: n(process.env.SEARCH_V3_PROMOTION_MAX_P95_LATENCY_MS, 5000),
  };

  const checks = {
    phase13Succeeded: phase.status === "success",
    latestGoldenReplayCompleted: replay.status === "completed",
    phase13Fresh: typeof phase.started_at === "string" &&
      Date.now() - Date.parse(phase.started_at) <= 30 * 60 * 1000,
    goldenReplayFresh: typeof replay.completed_at === "string" &&
      Date.now() - Date.parse(replay.completed_at) <= 60 * 60 * 1000,
    goldenReplayPersisted: metrics.persistedRowCount === metrics.queryCount &&
      Number(metrics.queryCount) >= 20,
    coreLaneValidation: metrics.coreLaneValidationPassed === true,
    phase13FailedZero: n(embeddings.failed, -1) === 0,
    phase13Scanned: n(embeddings.scanned, 0) > 0,
    phase13Advanced:
      n(embeddings.skippedIneligible, Number.MAX_SAFE_INTEGER) <
      n(embeddings.candidatePool, 0),
    phase13Remaining:
      n(embeddings.remainingApprox, Number.MAX_SAFE_INTEGER) <= thresholds.maximumRemaining,
    goldenSuccessRate: n(v3.successRate) >= thresholds.minimumSuccessRate,
    goldenPairSuccessRate: n(v3.pairSuccessRate) >= thresholds.minimumPairSuccessRate,
    goldenNoResultRegression:
      n(v3.noResultRegressionRate) <= thresholds.maximumNoResultRegressionRate,
    goldenContractFailures:
      n(v3.contractFailureCount) <= thresholds.maximumContractFailures,
    goldenLatency: n(v3.p95LatencyMs, Number.MAX_SAFE_INTEGER) <= thresholds.maximumP95LatencyMs,
    beatsOrMatchesV2Success: noRegressions.successRate === true,
    beatsOrMatchesV2Pairs: noRegressions.pairSuccessRate === true,
    beatsOrMatchesV2NoResult: noRegressions.noResultRegressionRate === true,
    beatsOrMatchesV2Contracts: noRegressions.contractFailures === true,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase13: { startedAt: phase.started_at, embeddings },
    goldenReplay: { id: replay.id, completedAt: replay.completed_at, v3, comparison },
    thresholds,
    checks,
    passed: Object.values(checks).every(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
