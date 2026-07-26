import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildSearchHealthKpis,
  type SearchEventSummaryRow,
  type SearchHealthIssueSummaryRow,
} from "./dashboardFoundation";

export const dynamic = "force-dynamic";

const KPI_WINDOW_DAYS = 30;
const SEARCH_LIMIT = 5000;
const ISSUE_LIMIT = 5000;

const KPI_CONFIG = [
  {
    key: "total",
    label: "Total searches",
    description: "Completed /create searches",
    className: "border-white/10 bg-white/[.04] text-white",
  },
  {
    key: "healthy",
    label: "Healthy searches",
    description: "Successful with no linked issue",
    className: "border-emerald-300/20 bg-emerald-500/10 text-emerald-50",
  },
  {
    key: "issues",
    label: "Searches with issues",
    description: "Matched issue or failed outcome",
    className: "border-amber-300/20 bg-amber-500/10 text-amber-50",
  },
  {
    key: "failed",
    label: "Failed searches",
    description: "success = false",
    className: "border-red-300/20 bg-red-500/10 text-red-50",
  },
  {
    key: "slow",
    label: "Slow searches",
    description: "Over 5s or degraded",
    className: "border-orange-300/20 bg-orange-500/10 text-orange-50",
  },
  {
    key: "noResults",
    label: "No results",
    description: "Zero displayed results",
    className: "border-violet-300/20 bg-violet-500/10 text-violet-50",
  },
  {
    key: "noPairs",
    label: "No pairs",
    description: "Pairing issue recorded",
    className: "border-sky-300/20 bg-sky-500/10 text-sky-50",
  },
] as const;

export default async function SearchHealthKpiOverview() {
  const since = new Date(
    Date.now() - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [searchResponse, issueResponse] = await Promise.all([
    supabaseAdmin
      .from("search_events")
      .select(
        "raw_query,result_count,timing_ms,speed_status,success,had_issue,no_results_reason,no_pairs_reason",
      )
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT),
    supabaseAdmin
      .from("search_health_events")
      .select("raw_query")
      .eq("source", "public_create_search")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ISSUE_LIMIT),
  ]);

  const error = searchResponse.error || issueResponse.error;
  const kpis = buildSearchHealthKpis(
    (searchResponse.data ?? []) as SearchEventSummaryRow[],
    (issueResponse.data ?? []) as SearchHealthIssueSummaryRow[],
  );

  return (
    <section
      id="search-health-kpis"
      className="rounded-3xl border border-white/10 bg-white/[.04] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">
            Search operations overview
          </p>
          <h2 className="mt-1 text-2xl font-black">Last 30 Days</h2>
          <p className="mt-2 text-sm text-white/60">
            Server-rendered metrics from <code>search_events</code>, correlated
            with issue-only rows in <code>search_health_events</code>.
          </p>
        </div>
        <a
          href="/admin/dashboard/search-health#search-health-kpis"
          className="rounded-full border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-black text-white/80"
        >
          Refresh
        </a>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
          KPI data could not be fully loaded: {error.message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {KPI_CONFIG.map((item) => (
          <article
            key={item.key}
            className={`rounded-2xl border p-4 ${item.className}`}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-65">
              {item.label}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">
              {kpis[item.key].toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs opacity-60">{item.description}</p>
          </article>
        ))}
      </div>

      {kpis.total >= SEARCH_LIMIT ? (
        <p className="mt-4 text-xs font-semibold text-amber-100/80">
          The 30-day window reached the {SEARCH_LIMIT.toLocaleString("en-US")}
          -row safety cap. Add a database aggregation function before traffic
          exceeds this threshold.
        </p>
      ) : null}
    </section>
  );
}
