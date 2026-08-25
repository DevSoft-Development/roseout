import Link from "next/link";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getSearchHealthDashboardData,
  parseSearchHealthFilters,
  sanitizeSearchHealthDebug,
} from "@/lib/admin/search-health-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEffectiveSearchCoreConfig } from "@/lib/search/searchCoreConfig";

import BatchQaRunner from "./BatchQaRunner";
import RecentCreateSearchesPanel from "./RecentCreateSearchesPanel";
import SearchCoreV2Panel from "./SearchCoreV2Panel";
import SearchDiagnosticsPanel from "./SearchDiagnosticsPanel";
import SearchHealthClient from "./SearchHealthClient";
import SearchHealthFiltersBar from "./SearchHealthFilters";
import SearchHealthIssueQueue from "./SearchHealthIssueQueue";
import SearchHealthTrendChart from "./SearchHealthTrendChart";
import SearchQualityReviewPanel from "./SearchQualityReviewPanel";
import SearchLabClient from "@/app/admin/dashboard/beta/search-lab/SearchLabClient";

export const metadata = {
  title: "Search Health – Admin",
  description: "Search operations health, diagnostics, testing, and review workflow.",
};

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type DashboardData = Awaited<ReturnType<typeof getSearchHealthDashboardData>>;
type SearchHealthTab = "overview" | "searches" | "diagnostics" | "search-lab" | "quality" | "settings";

type SearchHealthIssueDetail = {
  id: string;
  created_at: string | null;
  source: string | null;
  environment: string | null;
  raw_query: string | null;
  normalized_search_type: string | null;
  primary_domain: string | null;
  event_type: string | null;
  event_label: string | null;
  severity: string | null;
  review_status: string | null;
  restaurant_count: number | null;
  activity_count: number | null;
  pair_count: number | null;
  timing_ms: number | null;
  speed_status: string | null;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
  distance_mode: string | null;
  default_market_id: string | null;
  debug: unknown;
  review_notes: string | null;
  reviewed_at: string | null;
};

const TAB_ALIASES: Record<string, SearchHealthTab> = {
  overview: "overview",
  searches: "searches",
  issues: "diagnostics",
  failures: "diagnostics",
  "v2-metrics": "diagnostics",
  "search-plans": "diagnostics",
  "role-evidence": "diagnostics",
  fallbacks: "diagnostics",
  performance: "diagnostics",
  "ml-ranking": "diagnostics",
  diagnostics: "diagnostics",
  "v2-qa": "search-lab",
  comparisons: "search-lab",
  "search-lab": "search-lab",
  quality: "quality",
  configuration: "settings",
  settings: "settings",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function resolveTab(value: string | string[] | undefined): SearchHealthTab {
  return TAB_ALIASES[first(value) ?? ""] ?? "overview";
}

function preservedParams(
  searchParams: Record<string, string | string[] | undefined>,
  updates: Record<string, string | number | null>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (typeof value === "string") params.set(key, value);
  for (const [key, value] of Object.entries(updates)) value === null ? params.delete(key) : params.set(key, String(value));
  return params;
}

function TabLink({ tab, activeTab, searchParams, children }: {
  tab: SearchHealthTab;
  activeTab: SearchHealthTab;
  searchParams: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  const params = preservedParams(searchParams, { tab, issue: tab === "diagnostics" ? first(searchParams.issue) ?? null : null });
  const active = activeTab === tab;
  return (
    <Link
      href={`/admin/dashboard/search-health?${params.toString()}`}
      aria-current={active ? "page" : undefined}
      className={[
        "relative whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black transition",
        active
          ? "border border-rose-400/30 bg-rose-950/35 text-white shadow-[0_8px_30px_rgba(225,29,72,.08)]"
          : "border border-transparent text-white/50 hover:border-white/10 hover:bg-white/[.03] hover:text-white/85",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function IssueDetail({ issue, closeHref }: { issue: SearchHealthIssueDetail; closeHref: string }) {
  const debug = sanitizeSearchHealthDebug(issue.debug) as Record<string, any> | null;
  const nlp = debug?.nlp ?? debug?.searchPlan ?? null;
  const failure = debug?.failureCategory ?? issue.event_type ?? "Unclassified";
  const cards = {
    "Failure category": String(failure).replaceAll("_", " "),
    "Parser": nlp?.llmUsed ? "Hybrid / LLM assisted" : nlp?.parser?.source ?? "Deterministic",
    "Relationship": nlp?.relationship?.type ?? debug?.searchPlan?.relationship?.type ?? "—",
    "Search mode": debug?.searchPlan?.mode ?? issue.normalized_search_type ?? "—",
    "Geography": debug?.searchPlan?.geo?.neighborhood ?? debug?.searchPlan?.geo?.borough ?? debug?.effectiveGeo?.neighborhood ?? issue.default_market_id ?? "—",
    "Restaurant results": issue.restaurant_count ?? 0,
    "Activity results": issue.activity_count ?? 0,
    "Pairs": issue.pair_count ?? 0,
    "Latency": issue.timing_ms == null ? "—" : `${issue.timing_ms} ms`,
    "Semantic candidates": Number(debug?.phase13ProductionIntegration?.restaurant?.semanticCandidates ?? 0) + Number(debug?.phase13ProductionIntegration?.activity?.semanticCandidates ?? 0),
    "LLM used": debug?.nlp?.llmUsed === true ? "Yes" : "No",
    "Review status": issue.review_status ?? "new",
  };

  return (
    <section id="search-health-issue" data-testid="issue-detail" className="rounded-3xl border border-amber-300/20 bg-[#15100c] p-5 shadow-[0_24px_80px_rgba(0,0,0,.25)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-amber-200">Diagnosis</p>
          <h2 className="mt-1 text-2xl font-black">{issue.event_label || issue.event_type || "Search issue"}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">{issue.raw_query || "No query recorded"}</p>
        </div>
        <Link href={closeHref} className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2 text-sm font-black text-white/65 hover:text-white">Close</Link>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Object.entries(cards).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <dt className="text-[10px] font-black uppercase tracking-[.16em] text-white/35">{label}</dt>
            <dd className="mt-1 break-words text-sm font-bold text-white/80">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <details open className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer font-black">Understanding trace</summary>
          <pre className="mt-4 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#070606] p-4 text-xs leading-6 text-white/65">{JSON.stringify(nlp, null, 2)}</pre>
        </details>
        <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer font-black">Full sanitized debug trace</summary>
          <pre className="mt-4 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#070606] p-4 text-xs leading-6 text-white/65">{JSON.stringify(debug, null, 2)}</pre>
        </details>
      </div>
    </section>
  );
}

export default async function SearchHealthPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  const resolvedSearchParams = await searchParams;
  const activeTab = resolveTab(resolvedSearchParams.tab);
  const filters = parseSearchHealthFilters(resolvedSearchParams);
  const searchCoreConfig = await getEffectiveSearchCoreConfig();
  const shouldLoadDashboard = ["overview", "searches", "diagnostics"].includes(activeTab);

  const emptyDashboard: DashboardData = {
    searches: [], searchCount: 0, issues: [], issueCount: 0, kpis: null, trend: [],
    errors: { searches: undefined, issues: undefined, kpis: undefined, trend: undefined },
  };
  const dashboard = shouldLoadDashboard ? await getSearchHealthDashboardData(filters) : emptyDashboard;

  const selectedIssueId = activeTab === "diagnostics" ? filters.issue : null;
  let selectedIssue: SearchHealthIssueDetail | null = null;
  let selectedIssueLoadError: string | null = null;
  if (selectedIssueId) {
    const result = await supabaseAdmin
      .from("search_health_events")
      .select("id,created_at,source,environment,raw_query,normalized_search_type,primary_domain,event_type,event_label,severity,review_status,restaurant_count,activity_count,pair_count,timing_ms,speed_status,no_results_reason,no_pairs_reason,distance_mode,default_market_id,debug,review_notes,reviewed_at")
      .eq("id", selectedIssueId)
      .maybeSingle();
    if (result.error) selectedIssueLoadError = result.error.message;
    else selectedIssue = result.data as SearchHealthIssueDetail | null;
  }

  const refreshParams = preservedParams(resolvedSearchParams, {});
  const closeIssueParams = preservedParams(resolvedSearchParams, { tab: "diagnostics", issue: null });

  return (
    <main className="min-h-screen bg-[#080706] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <header className="rounded-3xl border border-white/10 bg-[#100d0c] p-5 shadow-[0_22px_70px_rgba(0,0,0,.22)]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[.28em] text-rose-300">Search operations</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Search Health</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Monitor production quality, diagnose why a search failed, and test fixes without digging through separate technical panels.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/dashboard/ml" className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm font-black text-white/70 hover:text-white">ML Dashboard</Link>
              <Link href={`/admin/dashboard/search-health?${refreshParams.toString()}`} className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-sm font-black text-rose-100 hover:bg-rose-900/40">Refresh</Link>
            </div>
          </div>

          <nav aria-label="Search Health sections" className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <TabLink tab="overview" activeTab={activeTab} searchParams={resolvedSearchParams}>Overview</TabLink>
            <TabLink tab="searches" activeTab={activeTab} searchParams={resolvedSearchParams}>Searches</TabLink>
            <TabLink tab="diagnostics" activeTab={activeTab} searchParams={resolvedSearchParams}>Diagnostics</TabLink>
            <TabLink tab="search-lab" activeTab={activeTab} searchParams={resolvedSearchParams}>Search Lab</TabLink>
            <TabLink tab="quality" activeTab={activeTab} searchParams={resolvedSearchParams}>Quality Review</TabLink>
            <TabLink tab="settings" activeTab={activeTab} searchParams={resolvedSearchParams}>Settings</TabLink>
          </nav>
        </header>

        <div className="mt-5">
          {activeTab === "overview" ? (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Search Core V2 status">
                {Object.entries({
                  "Effective engine": searchCoreConfig.killSwitch ? "Legacy (kill switch)" : searchCoreConfig.mode,
                  "V2 rollout": `${searchCoreConfig.rolloutPercentage}%`,
                  "Kill switch": searchCoreConfig.killSwitch ? "Active" : "Off",
                  "Shadow comparison": searchCoreConfig.shadowEnabled ? "Enabled" : "Disabled",
                  "Search plan": "search-plan-v1",
                }).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-[#100d0c] p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-white/40">{label}</p>
                    <p className="mt-2 text-lg font-black">{value}</p>
                  </div>
                ))}
              </section>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(520px,1.1fr)]">
                <SearchHealthFiltersBar filters={filters} />
                <SearchHealthTrendChart data={dashboard.trend} error={dashboard.errors.trend} />
              </div>
              <RecentCreateSearchesPanel rows={dashboard.searches} issues={dashboard.issues} count={dashboard.searchCount} kpis={dashboard.kpis} filters={filters} errors={dashboard.errors} mode="overview" />
              <SearchDiagnosticsPanel rows={dashboard.issues.slice(0, 50)} />
            </div>
          ) : null}

          {activeTab === "searches" ? (
            <div className="space-y-5">
              <SearchHealthFiltersBar filters={filters} />
              <RecentCreateSearchesPanel rows={dashboard.searches} issues={dashboard.issues} count={dashboard.searchCount} kpis={dashboard.kpis} filters={filters} errors={dashboard.errors} mode="full" />
            </div>
          ) : null}

          {activeTab === "diagnostics" ? (
            <div className="space-y-5">
              <SearchHealthFiltersBar filters={filters} />
              <SearchDiagnosticsPanel rows={dashboard.issues} />
              <SearchHealthIssueQueue rows={dashboard.issues} count={dashboard.issueCount} error={dashboard.errors.issues} filters={filters} />
              {selectedIssue ? <IssueDetail issue={selectedIssue} closeHref={`/admin/dashboard/search-health?${closeIssueParams.toString()}`} /> : null}
              {selectedIssueId && !selectedIssue ? (
                <div role="alert" className="rounded-2xl border border-amber-300/20 bg-amber-950/20 p-4 text-sm text-amber-100">
                  {selectedIssueLoadError ? `Unable to load this issue: ${selectedIssueLoadError}` : "This issue is unavailable or has been deleted."}
                </div>
              ) : null}
              <details className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
                <summary className="cursor-pointer text-base font-black">Advanced issue workflow</summary>
                <div className="mt-5"><SearchHealthClient /></div>
              </details>
            </div>
          ) : null}

          {activeTab === "search-lab" ? (
            <section data-testid="search-health-search-lab" className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
              <div className="mb-5 border-b border-white/10 pb-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Troubleshooting workspace</p>
                <h2 className="mt-1 text-2xl font-black">Search Lab</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Run a single search or a bulk set of up to 100 searches. Inspect normalized intent, parser behavior, restaurant and activity terms, result counts, fallback behavior, timing, warnings, errors, suspicious flags, and complete JSON responses.</p>
              </div>
              <BatchQaRunner />
              <div className="mt-8 border-t border-white/10 pt-6">
                <SearchLabClient initialQuery={first(resolvedSearchParams.q) ?? ""} />
              </div>
            </section>
          ) : null}

          {activeTab === "quality" ? <section className="space-y-5"><SearchQualityReviewPanel /></section> : null}
          {activeTab === "settings" ? <SearchCoreV2Panel tab="configuration" config={searchCoreConfig} /> : null}
        </div>
      </div>
    </main>
  );
}
