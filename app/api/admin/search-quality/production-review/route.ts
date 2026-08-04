import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchV2 } from "@/lib/search/v2";
import { responseDomainInventory } from "@/lib/search/quality/replayEvaluation";
import { percentile } from "@/lib/search/quality/launchGates";
import {
  classifyProductionReplayFailure,
  collectPairingDiagnostics,
  productionReplayCanaryReady,
  unresolvedRegressionQueries,
} from "@/lib/search/quality/productionReplayFailureClassifier";
import { updateSearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

const MAX_QUERIES = 100;
const DEFAULT_LOOKBACK_DAYS = 90;
const INSERT_BATCH_SIZE = 3;
const CANARY_PERCENT = 10;

function lightweightSnapshot(response: any) {
  const inventory = responseDomainInventory(response);
  return {
    counts: inventory.counts,
    servedDomains: [...inventory.servedDomains],
    retrieval: response?.retrieval ?? null,
    timing: response?.timing ?? null,
    pairingDiagnostics: collectPairingDiagnostics(response),
  };
}

function summarizeFailureFrequency(rows: any[]) {
  const counts = new Map<string, { reason: string; affectedQueries: number; weightedFrequency: number }>();
  for (const row of rows) {
    for (const reason of row.comparison?.reasons ?? []) {
      const current = counts.get(reason) ?? { reason, affectedQueries: 0, weightedFrequency: 0 };
      current.affectedQueries += 1;
      current.weightedFrequency += Number(row.frequency ?? 1);
      counts.set(reason, current);
    }
  }
  return [...counts.values()].sort((a, b) =>
    b.weightedFrequency - a.weightedFrequency || b.affectedQueries - a.affectedQueries,
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Math.min(MAX_QUERIES, Math.max(10, Number(body.limit ?? MAX_QUERIES)));
  const lookbackDays = Math.min(365, Math.max(7, Number(body.lookbackDays ?? DEFAULT_LOOKBACK_DAYS)));
  const applyCanary = body.applyCanary === true;
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

  const { data: logs, error: logError } = await supabaseAdmin
    .from("search_logs")
    .select("id,query,created_at,technical_success,quality_success,quality_issue_type")
    .not("query", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (logError) {
    return NextResponse.json({ success: false, error: logError.message }, { status: 500 });
  }

  const grouped = new Map<string, any>();
  for (const row of logs ?? []) {
    const normalized = String(row.query ?? "").trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const current = grouped.get(key) ?? {
      query: normalized,
      frequency: 0,
      sourceSearchId: row.id,
      lastSeenAt: row.created_at,
      priorQualityFailures: 0,
      priorTechnicalFailures: 0,
      issueTypes: new Set<string>(),
    };
    current.frequency += 1;
    current.priorQualityFailures += row.quality_success === false ? 1 : 0;
    current.priorTechnicalFailures += row.technical_success === false ? 1 : 0;
    if (row.quality_issue_type) current.issueTypes.add(String(row.quality_issue_type));
    grouped.set(key, current);
  }

  const cases = [...grouped.values()]
    .sort((a, b) =>
      b.priorQualityFailures - a.priorQualityFailures ||
      b.priorTechnicalFailures - a.priorTechnicalFailures ||
      b.frequency - a.frequency ||
      String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)),
    )
    .slice(0, requestedLimit);

  if (!cases.length) {
    return NextResponse.json({
      success: false,
      searchLoggingVerified: false,
      canaryReady: false,
      canaryApplied: false,
      reason: "no_production_queries",
      queryCount: 0,
      lookbackDays,
      message: "No production search queries were found in search_logs for the selected lookback window.",
    }, { status: 409 });
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("search_quality_replay_runs")
    .insert({
      source: "production_replay",
      status: "running",
      query_count: cases.length,
      created_by: auth.adminUser!.user_id,
    })
    .select("id")
    .single();

  if (runError || !run) {
    return NextResponse.json({ success: false, error: runError?.message ?? "Unable to create replay run." }, { status: 500 });
  }

  const rows: any[] = [];
  for (const testCase of cases) {
    try {
      const requestId = `${run.id}:production:${testCase.sourceSearchId}`;
      const [legacy, canonical, strictCanonical] = await Promise.all([
        searchV2({ query: testCase.query, requestId: `${requestId}:normal`, supabase: supabaseAdmin, rolloutOverride: { mode: "off", canaryPercent: 0 } }),
        searchV2({ query: testCase.query, requestId: `${requestId}:canonical`, supabase: supabaseAdmin, rolloutOverride: { mode: "primary", canaryPercent: 100 } }),
        searchV2({ query: testCase.query, requestId: `${requestId}:strict`, supabase: supabaseAdmin, rolloutOverride: { mode: "primary", canaryPercent: 100, strictNoFallback: true } }),
      ]);
      const comparison = classifyProductionReplayFailure(legacy, canonical, strictCanonical);
      rows.push({
        run_id: run.id,
        source_search_id: testCase.sourceSearchId,
        query: testCase.query,
        category: "production",
        expectations: {
          frequency: testCase.frequency,
          priorQualityFailures: testCase.priorQualityFailures,
          priorTechnicalFailures: testCase.priorTechnicalFailures,
          issueTypes: [...testCase.issueTypes],
          lastSeenAt: testCase.lastSeenAt,
        },
        legacy_result: lightweightSnapshot(legacy),
        canonical_result: {
          served: lightweightSnapshot(canonical),
          strict: lightweightSnapshot(strictCanonical),
        },
        comparison,
        passed: comparison.passed,
        frequency: testCase.frequency,
      });
    } catch (error) {
      rows.push({
        run_id: run.id,
        source_search_id: testCase.sourceSearchId,
        query: testCase.query,
        category: "production",
        expectations: { frequency: testCase.frequency },
        comparison: {
          passed: false,
          reasons: ["contract_or_execution_failure"],
          contractFailure: true,
          error: error instanceof Error ? error.message : "Production replay failed",
        },
        passed: false,
        frequency: testCase.frequency,
      });
    }
  }

  let persistedRowCount = 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE).map(({ frequency: _frequency, ...row }) => row);
    const { error } = await supabaseAdmin.from("search_quality_replay_items").insert(batch);
    if (error) {
      await supabaseAdmin.from("search_quality_replay_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        metrics: { persistenceError: error.message, persistedRowCount, queryCount: rows.length },
      }).eq("id", run.id);
      return NextResponse.json({ success: false, runId: run.id, error: error.message, persistedRowCount, queryCount: rows.length }, { status: 500 });
    }
    persistedRowCount += batch.length;
  }

  const failureFrequency = summarizeFailureFrequency(rows);
  const largestFailureCluster = failureFrequency[0] ?? null;
  const failedRows = rows.filter((row) => !row.passed);
  const expectedConstraintRows = rows.filter((row) => row.comparison?.expectedConstraintNoPair === true);
  const unresolvedRequiredRegressions = unresolvedRegressionQueries(rows);
  const p95LatencyMs = percentile(rows.map((row) => Number(row.comparison?.latencyMs ?? 0)), 95);
  const weightedFailureFrequency = failedRows.reduce((sum, row) => sum + Number(row.frequency ?? 1), 0);
  const totalWeightedFrequency = rows.reduce((sum, row) => sum + Number(row.frequency ?? 1), 0) || 1;
  const weightedFailureRate = (weightedFailureFrequency / totalWeightedFrequency) * 100;

  const canaryReady = productionReplayCanaryReady({
    persistedRowCount,
    rowCount: rows.length,
    rows,
    unresolvedRequiredRegressions,
    p95LatencyMs,
  });

  let canaryApplied = false;
  let rollout = null;
  if (applyCanary && canaryReady) {
    rollout = await updateSearchProfileRolloutConfig(
      { mode: "canary", canaryPercent: CANARY_PERCENT, killSwitch: false },
      auth.adminUser!.user_id,
      `Production replay ${run.id} passed all launch gates, including the five required regressions.`,
    );
    canaryApplied = true;
  }

  const metrics = {
    searchLoggingVerified: true,
    sourceLogRowCount: logs?.length ?? 0,
    uniqueProductionQueryCount: grouped.size,
    queryCount: rows.length,
    persistedRowCount,
    passedCount: rows.length - failedRows.length,
    failedCount: failedRows.length,
    expectedConstraintNoPairCount: expectedConstraintRows.length,
    passRate: rows.length ? ((rows.length - failedRows.length) / rows.length) * 100 : 0,
    weightedFailureRate,
    p95LatencyMs,
    failureFrequency,
    largestFailureCluster,
    unresolvedRequiredRegressions,
    canaryBlockReason: unresolvedRequiredRegressions.length
      ? "required_production_regressions_failed"
      : failedRows.length
        ? "replay_failures_present"
        : p95LatencyMs > 3000
          ? "latency_gate_failed"
          : null,
    canaryReady,
    canaryApplied,
    canaryTargetPercent: canaryReady ? CANARY_PERCENT : 0,
    lookbackDays,
  };

  await supabaseAdmin.from("search_quality_replay_runs").update({
    status: "completed",
    passed_count: rows.length - failedRows.length,
    failed_count: failedRows.length,
    metrics,
    completed_at: new Date().toISOString(),
  }).eq("id", run.id);

  return NextResponse.json({
    success: true,
    runId: run.id,
    ...metrics,
    rollout,
    recommendedNextAction: unresolvedRequiredRegressions.length
      ? `Keep canary disabled. Fix and rerun: ${unresolvedRequiredRegressions.join(" | ")}.`
      : largestFailureCluster
        ? `Fix only the largest weighted failure cluster: ${largestFailureCluster.reason}. Then rerun this review.`
        : canaryApplied
          ? "Monitor the 10% canary in Search Health before increasing traffic."
          : canaryReady
            ? "All gates passed. Rerun with applyCanary=true to enable the audited 10% canary."
            : "Review the replay failures before changing rollout traffic.",
    topFailures: failedRows
      .sort((a, b) => Number(b.frequency ?? 1) - Number(a.frequency ?? 1))
      .slice(0, 20)
      .map((row) => ({
        query: row.query,
        frequency: row.frequency,
        reasons: row.comparison?.reasons ?? [],
        comparison: row.comparison,
      })),
  });
}
