/**
 * Persist production Golden Replay using the existing canonical V2 evaluator
 * and the V3 comparison artifact. This runs only in the trusted GitHub Actions
 * environment with production service-role credentials.
 */
import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchV2 } from "@/lib/search/v2";
import { GOLDEN_SEARCH_QUERIES } from "@/lib/search/quality/goldenQueries";
import { evaluateReplayCase } from "@/app/api/admin/search-quality/replay/route";
import { buildV3ReplayMetrics } from "@/lib/search/quality/v3ReplayEvaluation";
import { compareSearchV3ToV2 } from "@/lib/search/quality/v3VsV2Comparison";
import { buildLaunchGates, percentile } from "@/lib/search/quality/launchGates";

type ArtifactRow = {
  id: string;
  passed: boolean;
  error: string | null;
  comparison: Parameters<typeof buildV3ReplayMetrics>[0][number]["v3"];
  execution: unknown;
  laneValidation: { passed: boolean } | null;
};
type Artifact = { baseline: { rows: ArtifactRow[] }; queryCount: number };

async function persist() {
  const artifactPath = path.resolve(process.env.SEARCH_V3_REPLAY_OUT_DIR || "artifacts", "search-v3-golden-replay.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Artifact;
  const rowsById = new Map(artifact.baseline.rows.map(row => [row.id, row]));
  if (artifact.queryCount !== GOLDEN_SEARCH_QUERIES.length ||
      rowsById.size !== GOLDEN_SEARCH_QUERIES.length ||
      GOLDEN_SEARCH_QUERIES.some(q => !rowsById.has(q.id))) {
    throw new Error("v3_golden_artifact_incomplete");
  }

  const db = supabaseAdmin;
  const { data: run, error: creationError } = await db.from("search_quality_replay_runs")
    .insert({ source: "golden", status: "running", query_count: GOLDEN_SEARCH_QUERIES.length })
    .select("id").single();
  if (creationError || !run) throw new Error(creationError?.message || "golden_replay_run_creation_failed");

  const rows: Array<Record<string, any>> = [];
  try {
    for (const testCase of GOLDEN_SEARCH_QUERIES) {
      const requestId = run.id + ":" + testCase.id;
      const startedAt = Date.now();
      let v2Canonical: Awaited<ReturnType<typeof searchV2>>;
      let comparison: ReturnType<typeof evaluateReplayCase>;
      try {
        const [legacy, canonical, strictCanonical] = await Promise.all([
          searchV2({ query: testCase.query, requestId: requestId + ":legacy", supabase: db, rolloutOverride: { mode: "off", canaryPercent: 0 } }),
          searchV2({ query: testCase.query, requestId: requestId + ":profile", supabase: db, rolloutOverride: { mode: "primary", canaryPercent: 100 } }),
          searchV2({ query: testCase.query, requestId: requestId + ":strict-profile", supabase: db, rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true } }),
        ]);
        v2Canonical = canonical;
        comparison = {
          ...evaluateReplayCase(testCase, legacy, canonical, strictCanonical),
          latencyMs: Date.now() - startedAt,
        };
      } catch(error) {
        throw new Error("v2_canonical_replay_failed:" + testCase.id + ":" +
          (error instanceof Error ? error.message : String(error)));
      }

      const v3 = rowsById.get(testCase.id)!;
      // The standalone V3 artifact evaluates legacyCount=0; restore the actual
      // V2 result count so no-result regressions cannot be hidden at promotion.
      const v2ResultCount = Number(v2Canonical.counts?.restaurantCards ?? 0) +
        Number(v2Canonical.counts?.activityCards ?? 0) +
        Number(v2Canonical.counts?.pairs ?? 0);
      const noResultRegression = v2ResultCount > 0 && Number(v3.comparison?.resultCount ?? 0) === 0;
      const comparedV3 = v3.comparison ? {
        ...v3.comparison,
        noResultRegression,
        passed: v3.comparison.passed && !noResultRegression,
      } : null;
      const v3CoreOk = v3.laneValidation?.passed === true;
      const v3Error = v3.error || (!v3CoreOk ? "v3_core_lane_validation_failed" : null);
      rows.push({
        run_id: run.id,
        query: testCase.query,
        category: testCase.category,
        expectations: testCase.expectations,
        legacy_result: null,
        canonical_result: { v2Counts: v2Canonical.counts, v3: v3.execution },
        comparison: {
          ...comparison,
          v3: comparedV3,
          v3Error,
          v3ContractFailure: Boolean(v3Error),
        },
        passed: Boolean(comparison.passed),
      });
    }

    // Do not publish partially saved production evidence.
    for (let i = 0; i < rows.length; i += 3) {
      const { error } = await db.from("search_quality_replay_items").insert(rows.slice(i, i + 3));
      if (error) throw new Error("golden_replay_items_insert_failed:" + error.message);
    }

    const total = rows.length;
    const paired = rows.filter(row => Number(row.expectations?.minimumPairs ?? 0) > 0);
    const v2Metrics = {
      total,
      successRate: rows.filter(row => row.passed).length / total * 100,
      wrongDomainRate: rows.filter(row => row.comparison?.wrongDomain).length / total * 100,
      geographyLeakageRate: rows.filter(row => row.comparison?.geographyLeakage).length / total * 100,
      pairedQuerySuccessRate: paired.length
        ? paired.filter(row => row.comparison?.pairedPass).length / paired.length * 100 : 100,
      noResultRegressionRate: rows.filter(row => row.comparison?.noResultRegression).length / total * 100,
      legacyFallbackRate: rows.filter(row => row.comparison?.fallbackUsed).length / total * 100,
      p95LatencyMs: percentile(rows.map(row => Number(row.comparison?.latencyMs ?? 0)), 95),
      contractFailureCount: rows.filter(row => row.comparison?.contractFailure).length,
    };
    const v3Metrics = buildV3ReplayMetrics(rows.map(row => ({
      canonicalPassed: Boolean(row.passed),
      v3: row.comparison?.v3 ?? null,
      contractFailure: Boolean(row.comparison?.v3ContractFailure),
    })));
    const v3VsV2 = compareSearchV3ToV2({
      successRate: v2Metrics.successRate,
      pairSuccessRate: v2Metrics.pairedQuerySuccessRate,
      noResultRegressionRate: v2Metrics.noResultRegressionRate,
      p95LatencyMs: v2Metrics.p95LatencyMs,
      contractFailureCount: v2Metrics.contractFailureCount,
    }, {
      successRate: v3Metrics.successRate,
      pairSuccessRate: v3Metrics.pairSuccessRate,
      noResultRegressionRate: v3Metrics.noResultRegressionRate,
      p95LatencyMs: v3Metrics.p95LatencyMs,
      contractFailureCount: v3Metrics.contractFailureCount,
    });

    const { error: updateError } = await db.from("search_quality_replay_runs")
      .update({
        status: "completed",
        passed_count: rows.filter(row => row.passed).length,
        failed_count: rows.filter(row => !row.passed).length,
        metrics: {
          ...v2Metrics,
          gates: buildLaunchGates(v2Metrics),
          v3: v3Metrics,
          v3VsV2,
          replayMode: "canonical_strict",
          sourceWorkflow: "search-v3-production-golden-replay",
          persistedRowCount: rows.length,
          queryCount: total,
          exactDomainPurity: true,
          coreLaneValidationPassed: artifact.baseline.rows.every(row => row.laneValidation?.passed === true),
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (updateError) throw new Error("golden_replay_final_update_failed:" + updateError.message);
    console.log("Persisted production Golden Replay: " + run.id);
    console.log(JSON.stringify({ v3: v3Metrics, v3VsV2 }, null, 2));
  } catch (error) {
    await db.from("search_quality_replay_runs").update({
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 500) : "Golden Replay failed",
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

persist().catch(error => { console.error(error); process.exitCode = 2; });
