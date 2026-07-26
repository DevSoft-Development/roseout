import Link from "next/link";

import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getSearchHealthDashboardData,
  parseSearchHealthFilters,
  sanitizeSearchHealthDebug,
} from "@/lib/admin/search-health-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

import BatchQaRunner from "./BatchQaRunner";
import RecentCreateSearchesPanel from "./RecentCreateSearchesPanel";
import SearchHealthClient from "./SearchHealthClient";
import SearchHealthFiltersBar from "./SearchHealthFilters";
import SearchHealthIssueQueue from "./SearchHealthIssueQueue";
import SearchQualityReviewPanel from "./SearchQualityReviewPanel";

export const metadata = {
  title: "Search Health – Admin",
  description:
    "Search operations health, performance, metadata, testing, and review workflow.",
};

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

type SearchHealthDashboardData = Awaited<
  ReturnType<typeof getSearchHealthDashboardData>
>;

type SearchHealthTab =
  | "overview"
  | "searches"
  | "issues"
  | "search-lab"
  | "quality";

const VALID_TABS = new Set<SearchHealthTab>([
  "overview",
  "searches",
  "issues",
  "search-lab",
  "quality",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(value: string | string[] | undefined): SearchHealthTab {
  const candidate = first(value);

  return candidate && VALID_TABS.has(candidate as SearchHealthTab)
    ? (candidate as SearchHealthTab)
    : "overview";
}

function createPreservedSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  updates: Record<string, string | number | null>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

function TabLink({
  tab,
  activeTab,
  searchParams,
  children,
}: {
  tab: SearchHealthTab;
  activeTab: SearchHealthTab;
  searchParams: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  const params = createPreservedSearchParams(searchParams, {
    tab,
    issue: tab === "issues" ? first(searchParams.issue) ?? null : null,
  });

  const active = activeTab === tab;

  return (
    <Link
      href={`/admin/dashboard/search-health?${params.toString()}`}
      aria-current={active ? "page" : undefined}
      className={[
        "relative whitespace-nowrap px-1 pb-4 pt-2 text-sm font-black transition",
        active ? "text-white" : "text-white/45 hover:text-white/80",
      ].join(" ")}
    >
      {children}

      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-rose-500" />
      ) : null}
    </Link>
  );
}

export default async function SearchHealthPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  const resolvedSearchParams = await searchParams;
  const activeTab = resolveTab(resolvedSearchParams.tab);
  const filters = parseSearchHealthFilters(resolvedSearchParams);

  const shouldLoadDashboard =
    activeTab === "overview" ||
    activeTab === "searches" ||
    activeTab === "issues";

  const emptyDashboard: SearchHealthDashboardData = {
    searches: [],
    searchCount: 0,
    issues: [],
    issueCount: 0,
    kpis: null,
    errors: {
      searches: undefined,
      issues: undefined,
      kpis: undefined,
    },
  };

  const dashboard: SearchHealthDashboardData = shouldLoadDashboard
    ? await getSearchHealthDashboardData(filters)
    : emptyDashboard;

  const selectedIssueId =
    activeTab === "issues" || activeTab === "overview"
      ? filters.issue
      : null;

  const selectedIssue = selectedIssueId
    ? await supabaseAdmin
        .from("search_health_events")
        .select(
          [
            "id",
            "created_at",
            "source",
            "environment",
            "raw_query",
            "normalized_search_type",
            "primary_domain",
            "event_type",
            "event_label",
            "severity",
            "review_status",
            "restaurant_count",
            "activity_count",
            "pair_count",
            "timing_ms",
            "speed_status",
            "no_results_reason",
            "no_pairs_reason",
            "distance_mode",
            "default_market_id",
            "debug",
            "review_notes",
            "reviewed_at",
          ].join(","),
        )
        .eq("id", selectedIssueId)
        .maybeSingle()
    : { data: null, error: null };

  const closeIssueParams = createPreservedSearchParams(
    resolvedSearchParams,
    {
      tab: "issues",
      issue: null,
    },
  );

  const refreshParams = createPreservedSearchParams(
    resolvedSearchParams,
    {},
  );

  return (
    <main className="min-h-screen bg-[#080706] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <header className="border-b border-white/10 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-5 pb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
                Search operations
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Search Health
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Monitor production search quality, inspect complete metadata,
                investigate failures, and run controlled single or bulk QA
                searches.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/dashboard/ml"
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-white/70 transition hover:border-rose-400/40 hover:text-white"
              >
                ML Dashboard
              </Link>

              <Link
                href={`/admin/dashboard/search-health?${refreshParams.toString()}`}
                className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-sm font-black text-rose-100 transition hover:bg-rose-900/40"
              >
                Refresh
              </Link>
            </div>
          </div>

          <nav
            aria-label="Search Health sections"
            className="flex gap-7 overflow-x-auto"
          >
            <TabLink
              tab="overview"
              activeTab={activeTab}
              searchParams={resolvedSearchParams}
            >
              Overview
            </TabLink>

            <TabLink
              tab="searches"
              activeTab={activeTab}
              searchParams={resolvedSearchParams}
            >
              All Searches
            </TabLink>

            <TabLink
              tab="issues"
              activeTab={activeTab}
              searchParams={resolvedSearchParams}
            >
              Issue Queue
            </TabLink>

            <TabLink
              tab="search-lab"
              activeTab={activeTab}
              searchParams={resolvedSearchParams}
            >
              Search Lab
            </TabLink>

            <TabLink
              tab="quality"
              activeTab={activeTab}
              searchParams={resolvedSearchParams}
            >
              Quality Review
            </TabLink>
          </nav>
        </header>

        <div className="mt-5">
          {activeTab === "overview" ? (
            <div className="space-y-5">
              <SearchHealthFiltersBar filters={filters} />

              <RecentCreateSearchesPanel
                rows={dashboard.searches}
                issues={dashboard.issues}
                count={dashboard.searchCount}
                kpis={dashboard.kpis}
                filters={filters}
                errors={dashboard.errors}
                mode="overview"
              />

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.8fr)]">
                <section className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                        Operations
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        Recent search activity
                      </h2>

                      <p className="mt-1 text-sm text-white/45">
                        Latest production searches with actionable status
                        information.
                      </p>
                    </div>

                    <Link
                      href={`/admin/dashboard/search-health?${createPreservedSearchParams(
                        resolvedSearchParams,
                        {
                          tab: "searches",
                          page: 1,
                        },
                      ).toString()}`}
                      className="text-sm font-black text-rose-300 hover:text-rose-200"
                    >
                      View all
                    </Link>
                  </div>
                </section>

                <SearchHealthIssueQueue
                  rows={dashboard.issues.slice(0, 6)}
                  count={dashboard.issueCount}
                  error={dashboard.errors.issues}
                  filters={filters}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "searches" ? (
            <div className="space-y-5">
              <SearchHealthFiltersBar filters={filters} />

              <RecentCreateSearchesPanel
                rows={dashboard.searches}
                issues={dashboard.issues}
                count={dashboard.searchCount}
                kpis={dashboard.kpis}
                filters={filters}
                errors={dashboard.errors}
                mode="full"
              />
            </div>
          ) : null}

          {activeTab === "issues" ? (
            <div className="space-y-5">
              <SearchHealthFiltersBar filters={filters} />

              <SearchHealthIssueQueue
                rows={dashboard.issues}
                count={dashboard.issueCount}
                error={dashboard.errors.issues}
                filters={filters}
              />

              {filters.issue ? (
                <section
                  data-testid="issue-detail"
                  id="search-health-issue"
                  className="rounded-2xl border border-amber-300/20 bg-[#15100c] p-5"
                >
                  {selectedIssue.data ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">
                            Selected issue
                          </p>

                          <h2 className="mt-1 text-2xl font-black">
                            {selectedIssue.data.event_label ||
                              selectedIssue.data.event_type ||
                              "Search issue"}
                          </h2>

                          <p className="mt-2 max-w-3xl text-sm text-white/55">
                            {selectedIssue.data.raw_query ||
                              "No query recorded"}
                          </p>
                        </div>

                        <Link
                          href={`/admin/dashboard/search-health?${closeIssueParams.toString()}`}
                          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/65 hover:text-white"
                        >
                          Close
                        </Link>
                      </div>

                      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Object.entries(selectedIssue.data)
                          .filter(([key]) => key !== "debug")
                          .map(([key, value]) => (
                            <div
                              className="rounded-xl border border-white/8 bg-black/20 p-3"
                              key={key}
                            >
                              <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                                {key.replaceAll("_", " ")}
                              </dt>

                              <dd className="mt-1 break-words text-sm text-white/80">
                                {value === null || value === undefined
                                  ? "—"
                                  : String(value)}
                              </dd>
                            </div>
                          ))}
                      </dl>

                      <details className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
                        <summary className="cursor-pointer font-black">
                          Sanitized debug metadata
                        </summary>

                        <pre className="mt-4 max-h-[600px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#070606] p-4 text-xs leading-6 text-white/65">
                          {JSON.stringify(
                            sanitizeSearchHealthDebug(
                              selectedIssue.data.debug,
                            ),
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </>
                  ) : (
                    <p
                      role="alert"
                      className="text-sm text-amber-100"
                    >
                      This issue is unavailable or has been deleted.{" "}
                      <Link
                        className="font-black underline"
                        href={`/admin/dashboard/search-health?${closeIssueParams.toString()}`}
                      >
                        Return to the queue
                      </Link>
                      .
                    </p>
                  )}
                </section>
              ) : null}

              <details className="rounded-2xl border border-white/10 bg-[#100d0c] p-5">
                <summary className="cursor-pointer text-lg font-black">
                  Advanced issue workflow
                </summary>

                <div className="mt-5">
                  <SearchHealthClient />
                </div>
              </details>
            </div>
          ) : null}

          {activeTab === "search-lab" ? (
            <section
              data-testid="search-health-search-lab"
              className="rounded-2xl border border-white/10 bg-[#100d0c] p-5"
            >
              <div className="mb-5 border-b border-white/10 pb-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">
                  Troubleshooting workspace
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Search Lab
                </h2>

                <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
                  Run a single search or a bulk set of up to 100
                  searches. Inspect normalized intent, parser behavior,
                  restaurant and activity terms, result counts, fallback
                  behavior, timing, warnings, errors, suspicious flags,
                  and complete JSON responses.
                </p>
              </div>

              <BatchQaRunner />
            </section>
          ) : null}

          {activeTab === "quality" ? (
            <section className="space-y-5">
              <SearchQualityReviewPanel />
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}