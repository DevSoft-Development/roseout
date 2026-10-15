import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

type CoverageRow = {
  market: string; area_type: string; area_key: string; location_kind: string;
  category: string; current_count: number; target_count: number;
  search_demand: number; result_gap_rate: number; priority_score: number;
  calculated_at: string;
};

export default async function GapCoveragePage() {
  await requireAdminRole(["superadmin", "admin"]);
  const db = getAdminDatabaseClient();
  const freshnessCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("location_coverage_state")
    .select("market,area_type,area_key,location_kind,category,current_count,target_count,search_demand,result_gap_rate,priority_score,calculated_at")
    .gte("calculated_at", freshnessCutoff)
    .order("priority_score", { ascending: false }).limit(500);
  const rows = (data || []) as CoverageRow[];
  const [recentImports, importBatches] = await Promise.all([
    db.from("import_logs").select("id,job_name,market,status,created_at,imported_count,inserted_count,failed_count")
      .order("created_at", { ascending: false }).limit(12),
    db.from("location_import_batches").select("id,source,source_label,status,started_at,total_published")
      .order("started_at", { ascending: false }).limit(12),
  ]);
  const rankedGaps = rows
    .filter(row => Math.max(0, Number(row.target_count || 0) - Number(row.current_count || 0)) > 0)
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
    .slice(0, 20);
  const lastUpdated = rows.reduce<string | null>((latest, row) =>
    !latest || row.calculated_at > latest ? row.calculated_at : latest, null);
  const missing = (row: CoverageRow) => Math.max(0, Number(row.target_count || 0) - Number(row.current_count || 0));
  const groups = new Map<string, { areas: Set<string>; rows: number; gap: number; top: number }>();
  for (const row of rows) {
    const g = groups.get(row.market) || { areas: new Set<string>(), rows: 0, gap: 0, top: 0 };
    g.areas.add(row.area_key);
    g.rows += 1;
    g.gap += missing(row);
    g.top = Math.max(g.top, Number(row.priority_score || 0));
    groups.set(row.market, g);
  }
  return (
    <main className="min-h-screen bg-[#080407] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href="/admin/dashboard/settings/location-tools" className="text-sm font-bold text-rose-300 hover:underline">← Location Tools</Link>
        <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
          <p className="text-xs font-black uppercase tracking-widest text-rose-200">Location Intelligence V2</p>
          <h1 className="mt-2 text-3xl font-black">Gap Coverage</h1>
          <p className="mt-3 text-sm text-white/65">Coverage priorities refreshed in the last 24 hours by market, area and category. Read-only reporting does not start paid discovery.</p>
          <p className="mt-2 text-xs text-white/50">Showing up to 500 priority records refreshed in the past 24 hours, not all coverage rows. Gap totals below apply to this sample only. Last coverage calculation: {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Not available"}.</p>
        </section>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-400/30 p-5 text-rose-200">Coverage data unavailable: {error.message}</p>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {[
                ["Markets in sample", groups.size],
                ["Coverage priority rows", rows.length],
                ["Category deficit slots in sample", rows.reduce((sum, row) => sum + missing(row), 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <p className="text-sm text-white/60">{label}</p><p className="mt-2 text-3xl font-black">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </section>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Market summaries">
              {[...groups].map(([market, summary]) => (
                <div key={market} className="rounded-2xl border border-white/10 bg-[#111] p-5">
                  <h2 className="font-black">{market.replace(/_/g, " ")}</h2>
                  <p className="mt-2 text-sm text-white/60">{summary.areas.size} areas · {summary.rows} priority rows</p>
                  <p className="mt-2 text-sm text-rose-200">{summary.gap.toLocaleString()} category deficit slots within sample</p>
                </div>
              ))}
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
              <h2 className="text-xl font-black">Next recommended imports</h2>
              <p className="mt-2 text-sm text-white/60">These are ranked recommendations from live coverage gaps, not scheduled or authorized import jobs. No paid provider request is triggered from this page.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="border-b border-white/15 text-white/65"><tr>
                    {["Rank","Market","Area","Location type","Category","Missing","Priority","Action"].map(h => <th key={h} className="p-3">{h}</th>)}
                  </tr></thead>
                  <tbody>{rankedGaps.map((row, i) => (
                    <tr key={`recommended:${row.market}:${row.area_key}:${row.category}:${i}`} className="border-b border-white/10">
                      <td className="p-3">{i+1}</td>
                      <td className="p-3">{row.market}</td>
                      <td className="p-3">{row.area_type}: {row.area_key}</td>
                      <td className="p-3">{row.location_kind}</td>
                      <td className="p-3">{row.category}</td>
                      <td className="p-3 font-bold">{missing(row)}</td>
                      <td className="p-3">{Number(row.priority_score).toFixed(1)}</td>
                      <td className="p-3 text-white/60">Candidate discovery → dedupe → publish eligibility</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!rankedGaps.length && <p className="p-3 text-white/60">No current coverage shortfalls in this sample.</p>}
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#111] p-5">
              <h2 className="text-xl font-black">Actual import activity</h2>
              <p className="mt-2 text-sm text-white/60">Recent logged runs and batches. This section reports recorded status, not a future schedule.</p>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="font-bold">Import logs</h3>
                  {recentImports.error ? <p className="mt-2 text-rose-200">Import logs unavailable.</p> : (
                    <ul className="mt-3 space-y-2 text-sm">{(recentImports.data || []).map(run => (
                      <li key={run.id} className="rounded-lg border border-white/10 p-3">
                        <span className="font-bold">{run.job_name}</span> · {run.status || "unknown"} · {run.market || "all markets"}
                        <p className="text-white/55">{run.created_at ? new Date(run.created_at).toLocaleString() : "Date unknown"} · {run.inserted_count ?? run.imported_count ?? 0} imported</p>
                      </li>
                    ))}</ul>
                  )}
                </div>
                <div>
                  <h3 className="font-bold">Import batches</h3>
                  {importBatches.error ? <p className="mt-2 text-rose-200">Import batches unavailable.</p> : (
                    <ul className="mt-3 space-y-2 text-sm">{(importBatches.data || []).map(batch => (
                      <li key={batch.id} className="rounded-lg border border-white/10 p-3">
                        <span className="font-bold">{batch.source_label || batch.source}</span> · {batch.status || "unknown"}
                        <p className="text-white/55">{batch.started_at ? new Date(batch.started_at).toLocaleString() : "Date unknown"} · {batch.total_published ?? 0} published</p>
                      </li>
                    ))}</ul>
                  )}
                </div>
              </div>
            </section>
            <section className="overflow-x-auto rounded-2xl border border-white/10 bg-[#111] p-5">
              <h2 className="mb-4 text-xl font-black">Highest priority coverage gaps</h2>
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/15 text-white/65"><tr>
                  {["Market","Area","Type","Category","Current","Target","Missing","Priority","Gap rate"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((row, i) => (
                  <tr key={`${row.market}:${row.area_type}:${row.area_key}:${row.location_kind}:${row.category}:${i}`} className="border-b border-white/10">
                    <td className="px-3 py-3">{row.market}</td>
                    <td className="px-3 py-3">{row.area_key}</td>
                    <td className="px-3 py-3">{row.location_kind}</td>
                    <td className="px-3 py-3">{row.category}</td>
                    <td className="px-3 py-3">{row.current_count}</td>
                    <td className="px-3 py-3">{row.target_count}</td>
                    <td className="px-3 py-3 font-bold">{missing(row)}</td>
                    <td className="px-3 py-3">{Number(row.priority_score).toFixed(1)}</td>
                    <td className="px-3 py-3">{(Number(row.result_gap_rate) * 100).toFixed(1)}%</td>
                  </tr>
                ))}</tbody>
              </table>
              {rows.length === 0 && <p className="mt-4 text-white/60">No recently refreshed coverage rows available.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
