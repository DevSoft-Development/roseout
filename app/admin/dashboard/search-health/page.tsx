import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getSearchHealthDashboardData,
  parseSearchHealthFilters,
  sanitizeSearchHealthDebug,
} from "@/lib/admin/search-health-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import RecentCreateSearchesPanel from "./RecentCreateSearchesPanel";
import SearchHealthFiltersBar from "./SearchHealthFilters";
import SearchHealthIssueQueue from "./SearchHealthIssueQueue";
import SearchHealthClient from "./SearchHealthClient";
import SearchHealthSearchLab from "./SearchHealthSearchLab";
import SearchQualityReviewPanel from "./SearchQualityReviewPanel";

export const metadata = {
  title: "Search Health – Admin",
  description: "Search operations health, performance, and review workflow.",
};
export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type SearchHealthTab = "overview" | "search-lab";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tabFromParams(params: Record<string, string | string[] | undefined>): SearchHealthTab {
  return first(params.tab) === "search-lab" ? "search-lab" : "overview";
}

function tabClass(active: boolean) {
  return active
    ? "border-b-2 border-rose-500 px-3 py-3 text-sm font-black text-white"
    : "border-b-2 border-transparent px-3 py-3 text-sm font-bold text-white/45 transition hover:text-white/80";
}

export default async function SearchHealthPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);

  const rawParams = await searchParams;
  const tab = tabFromParams(rawParams);
  const filters = parseSearchHealthFilters(rawParams);
  const dashboard = tab === "overview" ? await getSearchHealthDashboardData(filters) : null;

  const selected =
    tab === "overview" && filters.issue
      ? await supabaseAdmin
          .from("search_health_events")
          .select(
            "id,created_at,source,environment,raw_query,normalized_search_type,primary_domain,event_type,event_label,severity,review_status,restaurant_count,activity_count,pair_count,timing_ms,speed_status,no_results_reason,no_pairs_reason,distance_mode,default_market_id,debug,review_notes,reviewed_at",
          )
          .eq("id", filters.issue)
          .maybeSingle()
      : { data: null, error: null };

  const close = new URLSearchParams(
    Object.fromEntries(
      Object.entries(rawParams).filter(
        ([key, value]) => key !== "issue" && typeof value === "string",
      ) as [string, string][],
    ),
  );

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header data-testid="search-health-dashboard" className="border-b border-white/10 pb-1">
          <div className="flex flex-wrap items-start justify-between gap-4 py-2">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Search Health</h1>
              <p className="mt-1 text-sm text-white/55">
                Monitor search quality, performance, issues, and troubleshooting runs.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-white/35 sm:inline">
                Updated {new Date().toLocaleTimeString()}
              </span>
              <Link
                href={`/admin/dashboard/search-health?${close}`}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-black text-rose-200 transition hover:bg-rose-500/20"
              >
                Refresh
              </Link>
            </div>
          </div>

          <nav aria-label="Search Health sections" className="flex gap-2 overflow-x-auto">
            <Link href="/admin/dashboard/search-health" className={tabClass(tab === "overview")}>
              Overview
            </Link>
            <Link
              href="/admin/dashboard/search-health#all-searches"
              className={tabClass(false)}
            >
              All Searches
            </Link>
            <Link
              href="/admin/dashboard/search-health#issue-queue"
              className={tabClass(false)}
            >
              Issue Queue
            </Link>
            <Link
              data-testid="search-lab-tab"
              href="/admin/dashboard/search-health?tab=search-lab"
              className={tabClass(tab === "search-lab")}
            >
              Search Lab
            </Link>
          </nav>
        </header>

        {tab === "search-lab" ? (
          <SearchHealthSearchLab />
        ) : dashboard ? (
          <>
            <SearchHealthFiltersBar filters={filters} />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,0.85fr)]">
              <div className="min-w-0">
                <RecentCreateSearchesPanel
                  rows={dashboard.searches}
                  issues={dashboard.issues}
                  count={dashboard.searchCount}
                  kpis={dashboard.kpis}
                  filters={filters}
                  errors={dashboard.errors}
                />
              </div>
              <div className="min-w-0">
                <SearchHealthIssueQueue
                  rows={dashboard.issues}
                  count={dashboard.issueCount}
                  error={dashboard.errors.issues}
                  filters={filters}
                />
              </div>
            </div>

            {filters.issue ? (
              <section
                data-testid="issue-detail"
                id="search-health-issue"
                className="rounded-2xl border border-amber-300/20 bg-amber-500/[.07] p-5"
              >
                {selected.data ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">
                          Selected issue detail
                        </p>
                        <h2 className="mt-1 text-2xl font-black">
                          {selected.data.event_label ||
                            selected.data.event_type ||
                            "Search issue"}
                        </h2>
                      </div>
                      <Link
                        href={`/admin/dashboard/search-health?${close}#issue-queue`}
                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black"
                      >
                        Close
                      </Link>
                    </div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(selected.data)
                        .filter(([key]) => key !== "debug")
                        .map(([key, value]) => (
                          <div className="rounded-xl bg-black/20 p-3" key={key}>
                            <dt className="text-[10px] font-black uppercase text-white/40">
                              {key.replaceAll("_", " ")}
                            </dt>
                            <dd className="mt-1 break-words text-sm">
                              {value === null ? "—" : String(value)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <details className="mt-4 rounded-xl bg-black/30 p-4">
                      <summary className="cursor-pointer font-bold">
                        Sanitized debug data
                      </summary>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-white/70">
                        {JSON.stringify(
                          sanitizeSearchHealthDebug(selected.data.debug),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </>
                ) : (
                  <p role="alert">
                    This issue is unavailable or was deleted.{" "}
                    <Link className="underline" href={`/admin/dashboard/search-health?${close}`}>
                      Return to the queue
                    </Link>
                    .
                  </p>
                )}
              </section>
            ) : null}

            <details className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
              <summary className="cursor-pointer text-lg font-black">
                Search quality review tools
              </summary>
              <section id="quality-review" className="mt-5 space-y-5">
                <SearchQualityReviewPanel />
              </section>
            </details>

            <details className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
              <summary className="cursor-pointer text-lg font-black">
                Advanced issue workflow
              </summary>
              <div className="mt-5">
                <SearchHealthClient />
              </div>
            </details>
          </>
        ) : null}
      </div>
    </main>
  );
}
