export const SEARCH_HEALTH_SLOW_MS = 5000;
export const SEARCH_HEALTH_SLOW_STATUSES = new Set([
  "slow",
  "critical",
  "failed",
  "timeout",
  "degraded",
]);

export type SearchEventSummaryRow = {
  raw_query?: string | null;
  result_count?: number | null;
  timing_ms?: number | null;
  speed_status?: string | null;
  success?: boolean | null;
  had_issue?: boolean | null;
  no_results_reason?: string | null;
  no_pairs_reason?: string | null;
};

export type SearchHealthIssueSummaryRow = {
  raw_query?: string | null;
};

export function normalizeSearchQuery(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isSlowSearch(row: SearchEventSummaryRow) {
  return (
    Number(row.timing_ms ?? 0) > SEARCH_HEALTH_SLOW_MS ||
    SEARCH_HEALTH_SLOW_STATUSES.has(
      String(row.speed_status ?? "").toLowerCase(),
    )
  );
}

export function buildSearchHealthKpis(
  searches: SearchEventSummaryRow[],
  issues: SearchHealthIssueSummaryRow[],
) {
  const issueQueries = new Set(
    issues
      .map((issue) => normalizeSearchQuery(issue.raw_query))
      .filter(Boolean),
  );

  const hasIssue = (row: SearchEventSummaryRow) =>
    row.had_issue === true ||
    row.success === false ||
    Boolean(row.no_results_reason) ||
    Boolean(row.no_pairs_reason) ||
    issueQueries.has(normalizeSearchQuery(row.raw_query));

  return {
    total: searches.length,
    healthy: searches.filter((row) => row.success !== false && !hasIssue(row))
      .length,
    issues: searches.filter(hasIssue).length,
    failed: searches.filter((row) => row.success === false).length,
    slow: searches.filter(isSlowSearch).length,
    noResults: searches.filter(
      (row) =>
        Boolean(row.no_results_reason) || Number(row.result_count ?? 0) === 0,
    ).length,
    noPairs: searches.filter((row) => Boolean(row.no_pairs_reason)).length,
  };
}
