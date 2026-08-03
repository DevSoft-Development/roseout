import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ReplayRunnerClient from "./ReplayRunnerClient";

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
  const { data: runs } = await supabaseAdmin.from("search_quality_replay_runs").select("id,source,status,query_count,passed_count,failed_count,metrics,created_at,completed_at").order("created_at", { ascending: false }).limit(20);
  const latest = runs?.[0] as any;
  const gates = Array.isArray(latest?.metrics?.gates) ? latest.metrics.gates : [];
  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">Search API prelaunch</p><h1 className="mt-2 text-3xl font-black">Profile Rollout Quality</h1><p className="mt-2 max-w-3xl text-sm text-white/60">Compare legacy and canonical profile retrieval, replay production searches, and enforce launch gates before increasing traffic.</p></div>
          <Link href="/admin/dashboard/settings#search-profile-rollout" className="rounded-full border border-rose-300/25 px-5 py-3 text-sm font-black text-rose-100">Open rollout controls</Link>
        </div>
        <ReplayRunnerClient />
        <section className="rounded-3xl border border-rose-400/20 bg-[#120d0b] p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl font-black">Latest launch gates</h2><span className="text-xs text-white/45">{latest?.completed_at ? new Date(latest.completed_at).toLocaleString() : "No completed run"}</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {gates.map((gate: any) => <div key={gate.key} className={`rounded-2xl border p-4 ${gate.passed ? "border-white/10 bg-black/20" : "border-rose-400/40 bg-rose-500/10"}`}><div className="flex items-center justify-between"><p className="text-sm font-black">{gate.label}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${gate.passed ? "bg-white/10 text-white/70" : "bg-rose-500/20 text-rose-100"}`}>{gate.passed ? "Pass" : "Fail"}</span></div><p className="mt-3 text-2xl font-black">{gate.actual}</p><p className="mt-1 text-xs text-white/45">Target {gate.operator} {gate.target}</p></div>)}
            {!gates.length ? <p className="text-sm text-white/50">Run the golden suite to calculate launch gates.</p> : null}
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h2 className="text-xl font-black">Replay history</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-white/40"><tr><th className="py-3">Created</th><th>Source</th><th>Status</th><th>Queries</th><th>Passed</th><th>Failed</th><th>Success</th></tr></thead><tbody>{(runs ?? []).map((run: any) => <tr key={run.id} className="border-t border-white/10"><td className="py-3">{new Date(run.created_at).toLocaleString()}</td><td>{run.source}</td><td>{run.status}</td><td>{run.query_count}</td><td>{run.passed_count}</td><td>{run.failed_count}</td><td>{replaySuccessRate(run).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
      </div>
    </main>
  );
}
