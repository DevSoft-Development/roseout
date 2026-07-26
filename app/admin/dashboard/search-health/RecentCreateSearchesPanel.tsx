import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SLOW_MS = 5000;
const SLOW_STATUSES = new Set(["slow", "critical", "failed", "timeout", "degraded"]);
const METRICS = ["total", "healthy", "issues", "failed", "slow", "no_results", "no_pairs"] as const;

type Metric = (typeof METRICS)[number];

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
  wants_pairing: boolean | null;
};

type HealthIssueRow = {
  id: string;
  created_at: string;
  raw_query: string | null;
  event_type: string | null;
  event_label: string | null;
  severity: string | null;
  review_status: string | null;
};

type Props = {
  metric?: string | null;
};

function normalizeQuery(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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

function hasNoResults(row: SearchEventRow) {
  return Number(row.result_count ?? 0) === 0 || Boolean(row.no_results_reason);
}

function hasNoPairs(row: SearchEventRow) {
  return Boolean(row.no_pairs_reason) || (row.wants_pairing === true && Number(row.pair_count ?? 0) === 0);
}

function matchesMetric(row: SearchEventRow & { issue: HealthIssueRow | null }, metric: Metric) {
  if (metric === "healthy") return row.success !== false && !row.had_issue && !row.issue;
  if (metric === "issues") return Boolean(row.had_issue || row.issue);
  if (metric === "failed") return row.success === false;
  if (metric === "slow") return isSlow(row);
  if (metric === "no_results") return hasNoResults(row);
  if (metric === "no_pairs") return hasNoPairs(row);
  return true;
}

function issueBadgeClass(severity: string | null | undefined) {
  if (severity === "critical" || severity === "error") return "border-red-300/30 bg-red-500/10 text-red-100";
  if (severity === "warning") return "border-amber-300/30 bg-amber-500/10 text-amber-100";
  return "border-sky-300/30 bg-sky-500/10 text-sky-100";
}

export default async function RecentCreateSearchesPanel({ metric }: Props) {
  const activeMetric = METRICS.includes(metric as Metric) ? (metric as Metric) : "total";
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data, error }, { data: issueData, error: issueError }] = await Promise.all([
    supabaseAdmin
      .from("search_events")
      .select(
        "id,created_at,raw_query,normalized_query,restaurant_count,activity_count,pair_count,result_count,timing_ms,speed_status,success,had_issue,issue_type,issue_label,no_results_reason,no_pairs_reason,wants_pairing",
      )
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("search_health_events")
      .select("id,created_at,raw_query,event_type,event_label,severity,review_status")
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rows = (data ?? []) as SearchEventRow[];
  const issues = (issueData ?? []) as HealthIssueRow[];
  const issuesByQuery = new Map<string, HealthIssueRow[]>();
  for (const issue of issues) {
    const key = normalizeQuery(issue.raw_query);
    if (!key) continue;
    const list = issuesByQuery.get(key) ?? [];
    list.push(issue);
    issuesByQuery.set(key, list);
  }

  const correlated = rows.map((row) => {
    const key = normalizeQuery(row.raw_query || row.normalized_query);
    const candidates = issuesByQuery.get(key) ?? [];
    const rowTime = new Date(row.created_at).getTime();
    const issue =
      candidates.find((candidate) => Math.abs(new Date(candidate.created_at).getTime() - rowTime) <= 10 * 60 * 1000) ?? null;
    return { ...row, issue };
  });

  const counters = {
    total: correlated.length,
    healthy: correlated.filter((row) => matchesMetric(row, "healthy")).length,
    issues: correlated.filter((row) => matchesMetric(row, "issues")).length,
    failed: correlated.filter((row) => matchesMetric(row, "failed")).length,
    slow: correlated.filter((row) => matchesMetric(row, "slow")).length,
    no_results: correlated.filter((row) => matchesMetric(row, "no_results")).length,
    no_pairs: correlated.filter((row) => matchesMetric(row, "no_pairs")).length,
  };

  const visibleRows = correlated.filter((row) => matchesMetric(row, activeMetric)).slice(0, 50);
  const cards: Array<{ key: Metric; label: string; value: number; help: string }> = [
    { key: "total", label: "Total searches", value: counters.total, help: "Latest /create searches" },
    { key: "healthy", label: "Healthy searches", value: counters.healthy, help: "Successful with no linked issue" },
    { key: "issues", label: "Searches with issues", value: counters.issues, help: "Linked to Search Health" },
    { key: "failed", label: "Failed searches", value: counters.failed, help: "Search request failed" },
    { key: "slow", label: "Slow searches", value: counters.slow, help: `Over ${SLOW_MS / 1000}s or degraded` },
    { key: "no_results", label: "No results", value: counters.no_results, help: "No displayable results" },
    { key: "no_pairs", label: "No pairs", value: counters.no_pairs, help: "Pair requested but unavailable" },
  ];

  return (
    <section id="all-searches" className="scroll-mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Live /create traffic</p>
          <h2 className="mt-1 text-2xl font-black">All Searches</h2>
          <p className="mt-2 text-sm text-white/60">
            The latest 200 searches from the last 30 days. Healthy searches stay in <code>search_events</code>; issue badges are correlated from <code>search_health_events</code>.
          </p>
        </div>
        <Link href="/admin/dashboard/search-health#all-searches" className="rounded-full border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-black text-white/80">
          Refresh
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => {
          const active = card.key === activeMetric;
          return (
            <Link
              key={card.key}
              href={`/admin/dashboard/search-health?metric=${card.key}#all-searches`}
              className={`rounded-2xl border p-4 transition ${active ? "border-rose-300/50 bg-rose-500/15" : "border-white/10 bg-black/20 hover:border-white/25"}`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{card.label}</p>
              <p className="mt-2 text-3xl font-black text-white">{card.value}</p>
              <p className="mt-1 text-xs text-white/45">{card.help}</p>
            </Link>
          );
        })}
      </div>

      {error || issueError ? (
        <p className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
          Search dashboard data could not be fully loaded: {error?.message || issueError?.message}
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
          No searches match the selected metric.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-white/45">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Restaurants</th>
                <th className="px-4 py-3">Activities</th>
                <th className="px-4 py-3">Pairs</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Search Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleRows.map((row) => (
                <tr key={row.id} className="bg-black/10 align-top hover:bg-white/[.03]">
                  <td className="whitespace-nowrap px-4 py-3 text-white/55">{formatTime(row.created_at)}</td>
                  <td className="max-w-[360px] px-4 py-3">
                    <p className="font-black text-white/90">{row.raw_query || "—"}</p>
                    {row.normalized_query && row.normalized_query !== row.raw_query ? (
                      <p className="mt-1 truncate text-xs text-white/45">{row.normalized_query}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-bold">{row.restaurant_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.activity_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.pair_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.result_count ?? 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.timing_ms == null ? "—" : `${row.timing_ms} ms`}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${row.success === false ? "border-red-300/25 bg-red-500/10 text-red-100" : row.had_issue ? "border-amber-300/25 bg-amber-500/10 text-amber-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>
                      {row.success === false ? "Failed" : row.had_issue ? row.issue_label || "Issue" : row.speed_status || "Healthy"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.issue ? (
                      <Link
                        href={`/admin/dashboard/search-health?issue=${encodeURIComponent(row.issue.id)}&metric=${activeMetric}#search-health-issue`}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${issueBadgeClass(row.issue.severity)}`}
                      >
                        {row.issue.event_label || row.issue.event_type || "Open issue"}
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-white/35">No issue</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/40">
        Issue correlation currently matches normalized query text within a 10-minute window. A dedicated shared search-event ID should be added later for exact one-to-one correlation.
      </p>
    </section>
  );
}
