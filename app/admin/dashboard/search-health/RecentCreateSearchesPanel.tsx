import Link from "next/link";

import {
  classifySearchEvent,
  correlateIssue,
  type HealthIssue,
  type SearchEvent,
  type SearchHealthFilters,
  type SearchHealthKpis,
} from "@/lib/admin/search-health-dashboard";

const cards = [
  ["total", "Total Searches", "border-white/10 bg-white/[0.035]", "text-white"],
  ["healthy", "Healthy Searches", "border-emerald-400/20 bg-emerald-500/[0.06]", "text-emerald-100"],
  ["issues", "Searches With Issues", "border-amber-400/20 bg-amber-500/[0.06]", "text-amber-100"],
  ["failed", "Failed Searches", "border-red-400/20 bg-red-500/[0.06]", "text-red-100"],
  ["slow", "Slow Searches", "border-orange-400/20 bg-orange-500/[0.06]", "text-orange-100"],
  ["noResults", "No Results", "border-violet-400/20 bg-violet-500/[0.06]", "text-violet-100"],
  ["noPairs", "No Pairs", "border-sky-400/20 bg-sky-500/[0.06]", "text-sky-100"],
] as const;

function href(
  filters: SearchHealthFilters,
  updates: Record<string, string | number | null>,
) {
  const params = new URLSearchParams({
    range: filters.preset,
    from: filters.from,
    to: filters.to,
    q: filters.q,
    status: filters.status,
    severity: filters.severity,
    review: filters.reviewStatus,
    source: filters.source,
    speed: filters.speed,
    hasIssue: filters.hasIssue,
    noResults: filters.noResults,
    noPairs: filters.noPairs,
    page: String(filters.page),
    issuePage: String(filters.issuePage),
    pageSize: String(filters.pageSize),
    sort: filters.sort,
    direction: filters.direction,
    tab: "searches",
  });

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, String(value));
  }

  return `/admin/dashboard/search-health?${params.toString()}`;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${tone}`}
    >
      {children}
    </span>
  );
}

export default function RecentCreateSearchesPanel({
  rows,
  issues,
  count,
  kpis,
  filters,
  errors,
  mode = "full",
}: {
  rows: SearchEvent[];
  issues: HealthIssue[];
  count: number;
  kpis: SearchHealthKpis | null;
  filters: SearchHealthFilters;
  errors: { searches?: string; kpis?: string };
  mode?: "overview" | "full";
}) {
  const displayedRows = mode === "overview" ? rows.slice(0, 10) : rows;
  const totalPages = Math.max(1, Math.ceil(count / filters.pageSize));

  return (
    <section className="space-y-5" data-testid="recent-searches" id="all-searches">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map(([key, label, tone, valueTone]) => {
          const value = kpis?.[key];
          const percent =
            key !== "total" && kpis?.total
              ? Math.round(((value ?? 0) / kpis.total) * 100)
              : null;

          return (
            <article className={`rounded-2xl border p-4 ${tone}`} key={key}>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
                {label}
              </p>
              <p className={`mt-2 text-3xl font-black tabular-nums ${valueTone}`}>
                {value === null || value === undefined
                  ? "—"
                  : value.toLocaleString("en-US")}
              </p>
              <p className="mt-2 text-[11px] text-white/35">
                {key === "total"
                  ? `${count.toLocaleString("en-US")} matching rows`
                  : percent === null
                    ? "Unavailable"
                    : `${percent}% of total`}
              </p>
            </article>
          );
        })}
      </div>

      {errors.kpis ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          KPI totals are temporarily unavailable. Search rows can still be reviewed.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#100d0c]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">
              Operations
            </p>
            <h2 className="mt-1 text-xl font-black">Recent search activity</h2>
            <p className="mt-1 text-sm text-white/45">
              All healthy and unhealthy production searches matching the active filters.
            </p>
          </div>

          {mode === "overview" ? (
            <Link
              className="text-sm font-black text-rose-300 hover:text-rose-200"
              href={href(filters, { tab: "searches", page: 1 })}
            >
              View all
            </Link>
          ) : (
            <span className="text-xs text-white/35">
              {count.toLocaleString("en-US")} matching searches
            </span>
          )}
        </div>

        {errors.searches ? (
          <p className="m-5 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
            Recent searches could not be loaded: {errors.searches}
          </p>
        ) : displayedRows.length === 0 ? (
          <div className="m-5 rounded-xl border border-white/10 p-5">
            <p className="font-black text-white">No searches are visible.</p>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Clear the source and status filters first. The default source filter may hide
              searches written under another source value.
            </p>
            <Link
              className="mt-4 inline-flex rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white"
              href="/admin/dashboard/search-health?tab=overview&range=30d&source=all&status=all&review=all&speed=all&hasIssue=all&noResults=all&noPairs=all&page=1&pageSize=25"
            >
              Show all searches
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-black/25 text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                <tr>
                  {["Time", "Query", "Type", "Results", "Pairs", "Time", "Status", "Issue", "Actions"].map(
                    (label) => (
                      <th className="px-4 py-3" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {displayedRows.map((row) => {
                  const linkedIssue = correlateIssue(row, issues);
                  const status = classifySearchEvent(row, Boolean(linkedIssue));

                  return (
                    <tr className="align-top transition hover:bg-white/[0.025]" key={row.id}>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-white/45">
                        {new Date(row.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="max-w-[320px] px-4 py-4">
                        <p className="font-bold text-white">{row.raw_query || "—"}</p>
                        <p className="mt-1 truncate text-xs text-white/35">
                          {row.source || "Unknown source"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone="border-sky-400/20 bg-sky-500/10 text-sky-200">
                          {row.search_type || row.primary_domain || "search"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 font-black tabular-nums">
                        {row.result_count ?? "—"}
                      </td>
                      <td className="px-4 py-4 font-black tabular-nums">
                        {row.pair_count ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-white/70">
                        {row.timing_ms === null
                          ? "—"
                          : `${(row.timing_ms / 1000).toFixed(1)}s`}
                      </td>
                      <td className="px-4 py-4">
                        {status.healthy ? (
                          <Badge tone="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                            Healthy
                          </Badge>
                        ) : status.failed ? (
                          <Badge tone="border-red-400/20 bg-red-500/10 text-red-200">
                            Failed
                          </Badge>
                        ) : (
                          <Badge tone="border-amber-400/20 bg-amber-500/10 text-amber-200">
                            Issue
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-white/55">
                        {linkedIssue?.event_label ||
                          linkedIssue?.event_type ||
                          row.issue_label ||
                          row.issue_type ||
                          row.no_results_reason ||
                          row.no_pairs_reason ||
                          "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-3 text-xs font-black">
                          <Link
                            className="text-rose-300 hover:text-rose-200"
                            href={`/create?q=${encodeURIComponent(row.raw_query || "")}`}
                          >
                            Replay
                          </Link>
                          <Link
                            className="text-white/45 hover:text-white"
                            href="/admin/dashboard/search-health?tab=search-lab"
                          >
                            Lab
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mode === "full" ? (
          <nav className="flex items-center justify-between border-t border-white/10 px-5 py-4">
            <Link
              aria-disabled={filters.page <= 1}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-black text-white/55 aria-disabled:pointer-events-none aria-disabled:opacity-30"
              href={href(filters, { page: Math.max(1, filters.page - 1) })}
            >
              Previous
            </Link>
            <span className="text-xs font-semibold text-white/40">
              Page {Math.min(filters.page, totalPages)} of {totalPages}
            </span>
            <Link
              aria-disabled={filters.page >= totalPages}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-black text-white/55 aria-disabled:pointer-events-none aria-disabled:opacity-30"
              href={href(filters, { page: Math.min(totalPages, filters.page + 1) })}
            >
              Next
            </Link>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
