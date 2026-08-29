import Link from "next/link";

import {
  classifySearchEvent,
  correlateIssue,
  type HealthIssue,
  type SearchEvent,
  type SearchHealthFilters,
  type SearchHealthKpis,
} from "@/lib/admin/search-health-dashboard";
import { classifyLiveSearchHealth } from "@/lib/search/quality/liveSearchHealth";

import SearchHealthRowActions from "./SearchHealthRowActions";

const cards = [
  ["total", "Total Searches", "border-white/10 bg-white/[0.035]", "text-white"],
  ["healthy", "Healthy Searches", "border-emerald-400/20 bg-emerald-500/[0.06]", "text-emerald-100"],
  ["issues", "Searches With Issues", "border-amber-400/20 bg-amber-500/[0.06]", "text-amber-100"],
  ["failed", "Failed Searches", "border-red-400/20 bg-red-500/[0.06]", "text-red-100"],
  ["slow", "Slow Searches", "border-orange-400/20 bg-orange-500/[0.06]", "text-orange-100"],
  ["noResults", "No Results", "border-violet-400/20 bg-violet-500/[0.06]", "text-violet-100"],
  ["noPairs", "No Pairs", "border-sky-400/20 bg-sky-500/[0.06]", "text-sky-100"],
] as const;

const primaryStageTimingLabels = [
  ["taxonomyMs", "Taxonomy"],
  ["plannerMs", "Plan"],
  ["retrievalMs", "Retrieve"],
  ["roleAssignmentMs", "Roles"],
  ["scoringMs", "Score"],
  ["pairingMs", "Pair"],
  ["fallbackMs", "Fallback"],
  ["validationMs", "Validate"],
  ["serializationMs", "Serialize"],
] as const;

const retrievalStageTimingLabels = [
  ["queryEmbeddingMs", "Embed"],
  ["semanticDbMs", "Semantic DB"],
  ["candidateHydrationMs", "Profile total"],
  ["profileScoutMs", "Profile scout"],
  ["profileHydrationMs", "Location hydrate"],
  ["profileFallbackRpcMs", "Profile fallback"],
  ["inventoryMs", "Event inventory"],
] as const;

const detailStageTimingLabels = [
  ...primaryStageTimingLabels,
  ...retrievalStageTimingLabels,
  ["restaurantRetrievalMs", "Restaurant retrieve"],
  ["activityRetrievalMs", "Activity retrieve"],
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

function liveOutcome(row: SearchEvent) {
  const metadata = (row as any).metadata ?? {};
  const debug = (row as any).debug ?? {};
  return (
    metadata.disposition ??
    metadata.outcome ??
    metadata.outcome_state ??
    debug.disposition ??
    debug.outcome ??
    debug.outcome_state ??
    null
  );
}

function inventoryGapConfirmed(row: SearchEvent) {
  const metadata = (row as any).metadata ?? {};
  const debug = (row as any).debug ?? {};
  return (
    metadata.inventoryGapConfirmed === true ||
    metadata.inventory_gap_confirmed === true ||
    debug.inventoryGapConfirmed === true ||
    debug.inventory_gap_confirmed === true
  );
}

function displaySearchQuery(row: SearchEvent) {
  const metadata = (row as any).metadata ?? {};
  const explicitUserQuery =
    metadata.userSearchQuery ??
    metadata.user_search_query ??
    metadata.originalUserQuery ??
    metadata.original_user_query;
  if (typeof explicitUserQuery === "string" && explicitUserQuery.trim()) {
    return explicitUserQuery.trim();
  }

  const raw = String(row.raw_query || "").trim();
  if (!raw) return "";

  // Guided /create expands the customer's short intent into an execution prompt.
  // Keep the full prompt in telemetry, but show the customer's intent in Search Health.
  const guided = raw.match(
    /^Plan a (?:restaurant and activity outing|restaurant only|activity only)\.\s*(.+?)\s+Location:\s*/i,
  );
  return guided?.[1]?.trim() || raw;
}

function stageTimingSource(row: SearchEvent): Record<string, unknown> | null {
  const metadata = (row as any).metadata ?? {};
  const candidates = [
    metadata?.normalizedIntent?.stageTimings,
    metadata?.normalizedIntent?.stage_timings,
    metadata?.searchTelemetry?.stageTimings,
    metadata?.searchTelemetry?.stage_timings,
  ];
  for (const value of candidates) {
    if (value && typeof value === "object") return value as Record<string, unknown>;
  }
  return null;
}

function stageTimingEntries(
  row: SearchEvent,
  labels: readonly (readonly [string, string])[],
) {
  const timings = stageTimingSource(row);
  if (!timings) return [];
  return labels
    .map(([key, label]) => ({ label, ms: Number(timings[key]) }))
    .filter((item) => Number.isFinite(item.ms) && item.ms > 0);
}

function stageTimingMetric(row: SearchEvent, key: string) {
  const value = Number(stageTimingSource(row)?.[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatStageTiming(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
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
            <table className="w-full min-w-[1240px] text-left text-sm">
              <thead className="bg-black/25 text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                <tr>
                  {["Time", "Query", "Type", "Results", "Pairs", "Timing", "Status", "Issue", "Actions"].map(
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
                  const displayQuery = displaySearchQuery(row);
                  const primaryTimings = stageTimingEntries(row, primaryStageTimingLabels);
                  const retrievalTimings = stageTimingEntries(row, retrievalStageTimingLabels);
                  const profileAttemptCount = stageTimingMetric(row, "profileAttemptCount");
                  const slowestStages = [...primaryTimings]
                    .sort((left, right) => right.ms - left.ms)
                    .slice(0, 3);
                  const timingTitle = stageTimingEntries(row, detailStageTimingLabels)
                    .map((item) => `${item.label}: ${formatStageTiming(item.ms)}`)
                    .join(" · ");
                  const linkedIssue = correlateIssue(row, issues);
                  const storedStatus = classifySearchEvent(row, Boolean(linkedIssue));
                  const liveStatus = classifyLiveSearchHealth({
                    rawQuery: displayQuery,
                    restaurantCount: Number((row as any).restaurant_count ?? 0),
                    activityCount: Number((row as any).activity_count ?? 0),
                    pairCount: Number((row as any).pair_count ?? 0),
                    outcome: liveOutcome(row),
                    inventoryGapConfirmed: inventoryGapConfirmed(row),
                  });
                  const healthy = storedStatus.healthy && liveStatus.healthy;
                  const failed = storedStatus.failed;
                  const issueLabel =
                    linkedIssue?.event_label ||
                    linkedIssue?.event_type ||
                    row.issue_label ||
                    row.issue_type ||
                    row.no_results_reason ||
                    row.no_pairs_reason ||
                    liveStatus.issueType ||
                    "—";

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
                        <p className="font-bold text-white">{displayQuery || "—"}</p>
                        <p className="mt-1 truncate text-xs text-white/35">
                          {row.source || "Unknown source"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone="border-sky-400/20 bg-sky-500/10 text-sky-200">
                          {liveStatus.explicit.restaurant && liveStatus.explicit.activity
                            ? "mixed outing"
                            : row.search_type || row.primary_domain || "search"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 font-black tabular-nums">
                        {row.result_count ?? "—"}
                      </td>
                      <td className="px-4 py-4 font-black tabular-nums">
                        {row.pair_count ?? "—"}
                      </td>
                      <td className="min-w-[170px] px-4 py-4 text-white/70" title={timingTitle || undefined}>
                        <p className="whitespace-nowrap font-bold">
                          {row.timing_ms == null
                            ? "—"
                            : `${(row.timing_ms / 1000).toFixed(1)}s`}
                        </p>
                        {slowestStages.length ? (
                          <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-white/35">
                            {slowestStages.map((stage) => (
                              <p className="whitespace-nowrap" key={stage.label}>
                                {stage.label} {formatStageTiming(stage.ms)}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {retrievalTimings.length || profileAttemptCount ? (
                          <div className="mt-1 border-t border-white/5 pt-1 text-[9px] font-semibold text-white/30">
                            <p className="mb-0.5 uppercase tracking-wide text-white/25">Retrieval split</p>
                            {retrievalTimings.map((stage) => (
                              <p className="whitespace-nowrap" key={stage.label}>
                                {stage.label} {formatStageTiming(stage.ms)}
                              </p>
                            ))}
                            {profileAttemptCount ? (
                              <p className="whitespace-nowrap">
                                Profile attempts {Math.round(profileAttemptCount)}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {healthy ? (
                          <Badge tone="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                            Healthy
                          </Badge>
                        ) : failed ? (
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
                        {issueLabel}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex gap-3 text-xs font-black">
                            <Link
                              className="text-rose-300 hover:text-rose-200"
                              href={`/create?q=${encodeURIComponent(displayQuery)}`}
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
                          <SearchHealthRowActions row={row} />
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