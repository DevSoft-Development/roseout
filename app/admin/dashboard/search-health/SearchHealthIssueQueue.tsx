import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const severityRank: Record<string, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function formatAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function badgeClass(severity: string | null) {
  if (severity === "critical" || severity === "error")
    return "border-red-300/25 bg-red-500/10 text-red-100";
  if (severity === "warning")
    return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-sky-300/25 bg-sky-500/10 text-sky-100";
}

export default async function SearchHealthIssueQueue() {
  const { data, error } = await supabaseAdmin
    .from("search_health_events")
    .select(
      "id,created_at,raw_query,event_type,event_label,severity,review_status,restaurant_count,activity_count,pair_count,timing_ms,speed_status,no_results_reason,no_pairs_reason",
    )
    .in("review_status", ["new", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = [...(data ?? [])].sort((a: any, b: any) => {
    const severityDelta =
      (severityRank[String(a.severity ?? "info")] ?? 9) -
      (severityRank[String(b.severity ?? "info")] ?? 9);
    if (severityDelta !== 0) return severityDelta;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return (
    <section id="issue-queue" className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
            Operations queue
          </p>
          <h2 className="mt-1 text-2xl font-black">Open Search Issues</h2>
          <p className="mt-2 text-sm text-white/60">
            New and actively reviewed issues, ordered by severity and recency.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-white/70">
          {rows.length} open
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
          Issue queue could not be loaded: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
          No unresolved Search Health issues.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-white/45">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3">Performance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row: any) => (
                <tr key={row.id} className="bg-black/10 align-top">
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${badgeClass(row.severity)}`}>
                      {row.severity || "info"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-white/90">
                      {row.event_label || row.event_type || "Search issue"}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {row.no_results_reason || row.no_pairs_reason || row.event_type || "Needs investigation"}
                    </p>
                  </td>
                  <td className="max-w-[360px] px-4 py-3 font-semibold text-white/80">
                    {row.raw_query || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/70">
                    {row.restaurant_count ?? 0} R · {row.activity_count ?? 0} A · {row.pair_count ?? 0} P
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/70">
                    {row.timing_ms == null ? row.speed_status || "—" : `${row.timing_ms} ms`}
                  </td>
                  <td className="px-4 py-3 font-bold text-white/70">
                    {row.review_status || "new"}
                  </td>
                  <td className="px-4 py-3 font-bold text-white/55">
                    {formatAge(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/dashboard/search-health?issue=${encodeURIComponent(row.id)}#search-health-issue`}
                      className="inline-flex rounded-full border border-rose-300/25 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-100 hover:bg-rose-500/20"
                    >
                      Investigate →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
