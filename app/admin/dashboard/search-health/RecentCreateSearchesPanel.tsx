import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SLOW_MS = 5000;
const SLOW_STATUSES = new Set(["slow", "critical", "failed", "timeout", "degraded"]);

type SearchEventRow = {
  id: string;
  created_at: string;
  raw_query: string | null;
  normalized_query: string | null;
  restaurant_count: number | null;
  activity_count: number | null;
  pair_count: number | null;
  result_count: number | null;
  timing_ms: number | null;
  speed_status: string | null;
  success: boolean | null;
  had_issue: boolean | null;
  issue_type: string | null;
  issue_label: string | null;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
};

type HealthIssueRow = {
  id: string;
  created_at: string;
  raw_query: string | null;
  event_type: string | null;
  event_label: string | null;
  severity: string | null;
};

function normalizedQuery(value: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isSlow(row: SearchEventRow) {
  return Number(row.timing_ms ?? 0) > SLOW_MS || SLOW_STATUSES.has(String(row.speed_status ?? "").toLowerCase());
}

function issueLabel(row: SearchEventRow, issue?: HealthIssueRow) {
  return issue?.event_label || row.issue_label || row.no_results_reason || row.no_pairs_reason || row.issue_type || "Issue";
}

function counterCard(label: string, value: number, description: string) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-white/45">{description}</p>
    </div>
  );
}

export default async function RecentCreateSearchesPanel() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data, error }, { data: healthData, error: healthError }] = await Promise.all([
    supabaseAdmin
      .from("search_events")
      .select(
        "id,created_at,raw_query,normalized_query,restaurant_count,activity_count,pair_count,result_count,timing_ms,speed_status,success,had_issue,issue_type,issue_label,no_results_reason,no_pairs_reason",
      )
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("search_health_events")
      .select("id,created_at,raw_query,event_type,event_label,severity")
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rows = (data ?? []) as SearchEventRow[];
  const healthRows = (healthData ?? []) as HealthIssueRow[];
  const latestIssueByQuery = new Map<string, HealthIssueRow>();
  for (const issue of healthRows) {
    const key = normalizedQuery(issue.raw_query);
    if (key && !latestIssueByQuery.has(key)) latestIssueByQuery.set(key, issue);
  }

  const total = rows.length;
  const failed = rows.filter((row) => row.success === false).length;
  const slow = rows.filter(isSlow).length;
  const noResults = rows.filter((row) => Boolean(row.no_results_reason) || Number(row.result_count ?? 0) === 0).length;
  const noPairs = rows.filter((row) => Boolean(row.no_pairs_reason)).length;
  const withIssues = rows.filter((row) => row.had_issue || latestIssueByQuery.has(normalizedQuery(row.raw_query))).length;
  const healthy = rows.filter((row) => row.success !== false && !row.had_issue && !latestIssueByQuery.has(normalizedQuery(row.raw_query))).length;
  const visibleRows = rows.slice(0, 25);

  return (
    <section id="all-searches" className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Default view / All Searches</p>
          <h2 className="mt-1 text-2xl font-black">Recent Create Searches</h2>
          <p className="mt-2 text-sm text-white/60">
            Recent <code>/create</code> traffic comes from <code>search_events</code>. Search Health issues remain isolated in <code>search_health_events</code>.
          </p>
        </div>
        <Link href="/admin/dashboard/search-health#all-searches" className="rounded-full border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-black text-white/80">
          Refresh
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {counterCard("Total searches", total, "Last 30 days")}
        {counterCard("Healthy searches", healthy, "No linked issue")}
        {counterCard("Searches with issues", withIssues, "Matched health event")}
        {counterCard("Failed searches", failed, "success = false")}
        {counterCard("Slow searches", slow, `Over ${SLOW_MS} ms or degraded`)}
        {counterCard("No results", noResults, "Zero displayed results")}
        {counterCard("No pairs", noPairs, "Pairing failure recorded")}
      </div>

      {error || healthError ? (
        <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
          Search data could not be fully loaded: {error?.message || healthError?.message}
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
          No <code>public_create_search</code> rows were found. Check production logs for <code>[search-events] insert failed</code>.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-white/45">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Restaurants</th>
                <th className="px-4 py-3">Activities</th>
                <th className="px-4 py-3">Pairs</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleRows.map((row) => {
                const issue = latestIssueByQuery.get(normalizedQuery(row.raw_query));
                const hasIssue = Boolean(issue || row.had_issue || row.success === false);
                return (
                  <tr key={row.id} className="bg-black/10 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-white/55">{formatTime(row.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-black text-white/90">{row.raw_query || "—"}</p>
                      {row.normalized_query && row.normalized_query !== row.raw_query ? (
                        <p className="mt-1 text-xs text-white/45">{row.normalized_query}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-bold">{row.restaurant_count ?? 0}</td>
                    <td className="px-4 py-3 font-bold">{row.activity_count ?? 0}</td>
                    <td className="px-4 py-3 font-bold">{row.pair_count ?? 0}</td>
                    <td className="px-4 py-3 font-bold">{row.result_count ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.timing_ms == null ? "—" : `${row.timing_ms} ms`}</td>
                    <td className="px-4 py-3">
                      {issue ? (
                        <Link
                          href={`/admin/dashboard/search-health?issue=${encodeURIComponent(issue.id)}#search-health-issue`}
                          className="inline-flex rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-100 hover:bg-amber-500/20"
                        >
                          {issueLabel(row, issue)} →
                        </Link>
                      ) : (
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${hasIssue ? "border-amber-300/25 bg-amber-500/10 text-amber-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>
                          {row.success === false ? "Failed" : hasIssue ? issueLabel(row) : isSlow(row) ? "Slow" : "Healthy"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
