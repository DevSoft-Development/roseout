import Link from "next/link";

import {
  classifySearchEvent,
  correlateIssue,
  sanitizeSearchHealthDebug,
  type HealthIssue,
  type SearchEvent,
  type SearchHealthFilters,
  type SearchHealthKpis,
} from "@/lib/admin/search-health-dashboard";

const badgeClass =
  "inline-flex rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wide";

const cardDefinitions = [
  { key: "total", label: "Total Searches", tone: "border-white/10 bg-white/[0.035]", valueTone: "text-white" },
  { key: "healthy", label: "Healthy Searches", tone: "border-emerald-400/15 bg-emerald-500/[0.055]", valueTone: "text-emerald-100" },
  { key: "issues", label: "Searches With Issues", tone: "border-amber-400/15 bg-amber-500/[0.055]", valueTone: "text-amber-100" },
  { key: "failed", label: "Failed Searches", tone: "border-red-400/15 bg-red-500/[0.055]", valueTone: "text-red-100" },
  { key: "slow", label: "Slow Searches", tone: "border-orange-400/15 bg-orange-500/[0.055]", valueTone: "text-orange-100" },
  { key: "noResults", label: "No Results", tone: "border-violet-400/15 bg-violet-500/[0.055]", valueTone: "text-violet-100" },
  { key: "noPairs", label: "No Pairs", tone: "border-sky-400/15 bg-sky-500/[0.055]", valueTone: "text-sky-100" },
] as const;

function createHref(
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

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`${badgeClass} ${tone}`}>{label}</span>;
}

function metadataEntries(row: SearchEvent) {
  return [
    ["Search ID", row.id],
    ["Created At", row.created_at],
    ["Source", row.source],
    ["Route", row.route],
    ["Environment", row.environment],
    ["Raw Query", row.raw_query],
    ["Normalized Query", row.normalized_query],
    ["Search Type", row.search_type],
    ["Primary Domain", row.primary_domain],
    ["Intent Parser", row.intent_parser_source],
    ["City", row.city],
    ["State", row.state],
    ["Borough", row.borough],
    ["Neighborhood", row.neighborhood],
    ["Restaurant Count", row.restaurant_count],
    ["Activity Count", row.activity_count],
    ["Pair Count", row.pair_count],
    ["Result Count", row.result_count],
    ["Pair Candidates", row.pair_candidates_evaluated],
    ["Valid Pairs Before Render", row.valid_pair_count_before_render],
    ["Timing", row.timing_ms],
    ["LLM Timing", row.llm_ms],
    ["RPC Timing", row.rpc_ms],
    ["Pairing Timing", row.pairing_ms],
    ["Ranking Timing", row.ranking_ms],
    ["Speed Status", row.speed_status],
    ["Success", row.success],
    ["Had Issue", row.had_issue],
    ["Issue Type", row.issue_type],
    ["Issue Label", row.issue_label],
    ["No Results Reason", row.no_results_reason],
    ["No Pairs Reason", row.no_pairs_reason],
    ["Session ID", row.session_id],
  ] as const;
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
  const totalPages = Math.max(1, Math.ceil(count / filters.pageSize));
  const displayedRows = mode === "overview" ? rows.slice(0, 8) : rows;

  return (
    <section data-testid="recent-searches" id="all-searches" className="space-y-5">
      <div data-testid="search-health-kpis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cardDefinitions.map((card) => {
          const value = kpis?.[card.key];
          return (
            <article key={card.key} className={`rounded-2xl border p-4 ${card.tone}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">{card.label}</p>
              <p className={`mt-2 text-3xl font-black tabular-nums ${card.valueTone}`}>
                {value === null || value === undefined ? "—" : value.toLocaleString("en-US")}
              </p>
            </article>
          );
        })}
      </div>

      {errors.kpis ? (
        <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          KPI totals are temporarily unavailable. Recent searches can still be reviewed.
        </p>
      ) : null}

      {mode === "full" ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#100d0c]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">Operations</p>
              <h2 className="mt-1 text-xl font-black">Recent Searches</h2>
              <p className="mt-1 text-sm text-white/45">{count.toLocaleString("en-US")} matching searches</p>
            </div>
            <div className="text-xs text-white/35">Select metadata on any row for the complete stored event.</div>
          </div>

          {errors.searches ? (
            <p role="alert" className="m-5 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
              Recent searches could not be loaded: {errors.searches}
            </p>
          ) : displayedRows.length === 0 ? (
            <p className="m-5 rounded-xl border border-white/10 p-5 text-sm text-white/55">No searches match the active filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-black/25 text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                  <tr>
                    {['Time','Query','Type','Results','Pairs','Timing','Status','Issue','Actions'].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {displayedRows.map((row) => {
                    const linkedIssue = correlateIssue(row, issues);
                    const classification = classifySearchEvent(row, Boolean(linkedIssue));

                    return (
                      <tr key={row.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-white/45">{new Date(row.created_at).toLocaleString()}</td>
                        <td className="max-w-[360px] px-4 py-4">
                          <p className="font-black text-white">{row.raw_query || "—"}</p>
                          <p className="mt-1 truncate text-xs text-white/35">{row.normalized_query || "No normalized query"}</p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-black text-rose-300 hover:text-rose-200">View full metadata</summary>
                            <div className="mt-3 w-[720px] max-w-[80vw] rounded-xl border border-white/10 bg-[#070606] p-4">
                              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {metadataEntries(row).map(([label, value]) => (
                                  <div key={label} className="rounded-lg bg-white/[0.025] p-3">
                                    <dt className="text-[9px] font-black uppercase tracking-[0.13em] text-white/30">{label}</dt>
                                    <dd className="mt-1 break-words text-xs leading-5 text-white/70">
                                      {value === null || value === undefined || value === "" ? "—" : String(value)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              <div className="mt-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Complete metadata JSON</p>
                                <pre className="mt-2 max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-4 text-xs leading-6 text-white/60">
                                  {JSON.stringify(sanitizeSearchHealthDebug(row.metadata ?? {}), null, 2)}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white/75">{row.search_type || "—"}</p>
                          <p className="mt-1 text-xs text-white/35">{row.primary_domain || "No primary domain"}</p>
                        </td>
                        <td className="px-4 py-4 font-black tabular-nums">{row.result_count ?? "—"}</td>
                        <td className="px-4 py-4 font-black tabular-nums">{row.pair_count ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className={classification.slow ? "font-black text-orange-300" : "font-black text-emerald-300"}>
                            {row.timing_ms === null ? "—" : `${row.timing_ms.toLocaleString("en-US")} ms`}
                          </p>
                          <p className="mt-1 text-xs text-white/35">{row.speed_status || "No speed status"}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex max-w-48 flex-wrap gap-1">
                            {classification.healthy ? <StatusBadge label="Healthy" tone="border-emerald-400/20 bg-emerald-500/10 text-emerald-200" /> : null}
                            {classification.failed ? <StatusBadge label="Failed" tone="border-red-400/20 bg-red-500/10 text-red-200" /> : null}
                            {classification.slow ? <StatusBadge label="Slow" tone="border-orange-400/20 bg-orange-500/10 text-orange-200" /> : null}
                            {classification.noResults ? <StatusBadge label="No Results" tone="border-violet-400/20 bg-violet-500/10 text-violet-200" /> : null}
                            {classification.noPairs ? <StatusBadge label="No Pairs" tone="border-sky-400/20 bg-sky-500/10 text-sky-200" /> : null}
                            {classification.issue && !classification.failed && !classification.noResults && !classification.noPairs ? (
                              <StatusBadge label="Issue" tone="border-amber-400/20 bg-amber-500/10 text-amber-200" />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {linkedIssue ? (
                            <Link
                              className="text-xs font-black text-amber-200 hover:text-amber-100"
                              href={`${createHref(filters, { tab: "issues", issue: linkedIssue.id })}#search-health-issue`}
                            >
                              {linkedIssue.event_label || linkedIssue.event_type || "Open issue"}
                            </Link>
                          ) : (
                            <span className="text-white/25">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2 text-xs font-black">
                            <Link className="text-rose-300 hover:text-rose-200" href={`/create?q=${encodeURIComponent(row.raw_query || "")}`}>Replay</Link>
                            <Link className="text-white/45 hover:text-white" href="/admin/dashboard/search-health?tab=search-lab">Open Lab</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <nav aria-label="Recent searches pagination" className="flex items-center justify-between border-t border-white/10 px-5 py-4">
            <Link
              aria-disabled={filters.page <= 1}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-black text-white/55 hover:text-white aria-disabled:pointer-events-none aria-disabled:opacity-30"
              href={createHref(filters, { page: Math.max(1, filters.page - 1) })}
            >
              Previous
            </Link>
            <span className="text-xs font-semibold text-white/40">Page {Math.min(filters.page, totalPages)} of {totalPages.toLocaleString("en-US")}</span>
            <Link
              aria-disabled={filters.page >= totalPages}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-black text-white/55 hover:text-white aria-disabled:pointer-events-none aria-disabled:opacity-30"
              href={createHref(filters, { page: Math.min(totalPages, filters.page + 1) })}
            >
              Next
            </Link>
          </nav>
        </div>
      ) : null}
    </section>
  );
}
