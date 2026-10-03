import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  loadReplayItemsPerRun,
  replayItemsComplete,
  REPLAY_HISTORY_RUN_LIMIT,
} from "@/lib/search/quality/replayHistory";
import ReplayRunnerClient from "./ReplayRunnerClient";
import ReplayHistoryClient from "./ReplayHistoryClient";

export const dynamic = "force-dynamic";

function replaySuccessRate(run: any) {
  const metrics = run?.metrics ?? {};
  const explicitRate = metrics.passRate ?? metrics.successRate;
  if (Number.isFinite(Number(explicitRate))) return Number(explicitRate);
  const passed = Number(run?.passed_count ?? 0);
  const total = Number(run?.query_count ?? 0);
  return total > 0 ? (passed / total) * 100 : 0;
}

export default async function ProfileRolloutQualityPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const { data: runs } = await supabaseAdmin
    .from("search_quality_replay_runs")
    .select("id,source,status,query_count,passed_count,failed_count,metrics,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(REPLAY_HISTORY_RUN_LIMIT);

  const safeRuns = runs ?? [];
  const itemsByRun = await loadReplayItemsPerRun(safeRuns, async (runId, limit) => {
    const { data, error } = await supabaseAdmin
      .from("search_quality_replay_items")
      .select("id,run_id,query,passed,comparison,expectations,legacy_result,canonical_result,created_at")
      .eq("run_id", runId)
      .order("passed", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Unable to load replay ${runId}: ${error.message}`);
    return data ?? [];
  });

  const replayRuns = safeRuns.map((run: any) => {
    const items = itemsByRun.get(String(run.id)) ?? [];
    return {
      ...run,
      success_rate: replaySuccessRate(run),
      items,
      items_complete: replayItemsComplete(run, items),
    };
  });

  const latest = safeRuns[0] as any;
  const gates = Array.isArray(latest?.metrics?.gates) ? latest.metrics.gates : [];
  const v3 = latest?.metrics?.v3 ?? null;

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">Search API prelaunch</p>
            <h1 className="mt-2 text-3xl font-black">Profile Rollout Quality</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/60">Compare legacy and canonical profile retrieval, replay production searches, and enforce launch gates before increasing traffic.</p>
          </div>
          <Link href="/admin/dashboard/settings#search-profile-rollout" className="rounded-full border border-rose-300/25 px-5 py-3 text-sm font-black text-rose-100">Open rollout controls</Link>
        </div>

        <ReplayRunnerClient />

        <section className="rounded-3xl border border-rose-400/20 bg-[#120d0b] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Latest launch gates</h2>
            <span className="text-xs text-white/45">{latest?.completed_at ? new Date(latest.completed_at).toLocaleString() : "No completed run"}</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {gates.map((gate: any) => (
              <div key={gate.key} className={`rounded-2xl border p-4 ${gate.passed ? "border-white/10 bg-black/20" : "border-rose-400/40 bg-rose-500/10"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black">{gate.label}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${gate.passed ? "bg-white/10 text-white/70" : "bg-rose-500/20 text-rose-100"}`}>{gate.passed ? "Pass" : "Fail"}</span>
                </div>
                <p className="mt-3 text-2xl font-black">{gate.actual}</p>
                <p className="mt-1 text-xs text-white/45">Target {gate.operator} {gate.target}</p>
              </div>
            ))}
            {!gates.length ? <p className="text-sm text-white/50">Run the golden suite to calculate launch gates.</p> : null}
          </div>
        </section>

        {v3 ? (
          <section className="rounded-3xl border border-sky-400/20 bg-[#0b1118] p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.24em] text-sky-300">Search V3 shadow</p>
                <h2 className="mt-1 text-xl font-black">Golden-query comparison</h2>
                <p className="mt-1 text-sm text-white/55">
                  V3 runs beside the current search only. These metrics do not affect live traffic or existing rollout gates.
                </p>
              </div>
              <span className="rounded-full border border-sky-300/20 px-3 py-1 text-xs font-black text-sky-100">
                Shadow only
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["V3 success", Number(v3.successRate ?? 0).toFixed(1) + "%"],
                ["Domain coverage", Number(v3.exactDomainCoverageRate ?? 0).toFixed(1) + "%"],
                ["Pair success", Number(v3.pairSuccessRate ?? v3.pairedDomainCoverageRate ?? 0).toFixed(1) + "%"],
                ["No-result regression", Number(v3.noResultRegressionRate ?? 0).toFixed(1) + "%"],
                ["Geography pass", Number(v3.geographyPassRate ?? 0).toFixed(1) + "%"],
                ["P95 latency", Math.round(Number(v3.p95LatencyMs ?? 0)) + " ms"],
                ["Pair relevance", Number(v3.pairRelevancePassRate ?? 0).toFixed(1) + "%"],
                ["Sequence pass", Number(v3.pairSequencingPassRate ?? 0).toFixed(1) + "%"],
                ["Distance leakage", Number(v3.pairDistanceLeakageRate ?? 0).toFixed(1) + "%"],
                ["Walk-time leakage", Number(v3.pairTravelTimeLeakageRate ?? 0).toFixed(1) + "%"],
                ["Verified walk routes", Number(v3.pairRouteVerificationRate ?? 0).toFixed(1) + "%"],
                ["V3-only passes", String(v3.v3OnlyPassCount ?? 0)],
                ["Canonical-only passes", String(v3.canonicalOnlyPassCount ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-white/45">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
              <span>Both pass: {Number(v3.bothPassCount ?? 0)}</span>
              <span>Both fail: {Number(v3.bothFailCount ?? 0)}</span>
              <span>Contract failures: {Number(v3.contractFailureCount ?? 0)}</span>
              <span>Prohibited-category violations: {Number(v3.prohibitedCategoryViolationRate ?? 0).toFixed(1)}%</span>
            </div>
          </section>
        ) : null}

        <ReplayHistoryClient runs={replayRuns} />
      </div>
    </main>
  );
}
