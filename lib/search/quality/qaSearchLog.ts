import { supabaseAdmin } from "@/lib/supabase-admin";

export type QaSearchSummary = {
  query: string;
  ok: boolean;
  engine: string;
  normalized_search_type: string | null;
  primary_domain: string | null;
  restaurant_count: number;
  activity_count: number;
  pair_count: number;
  result_count: number;
  timing_ms: number | null;
  speed_status: string | null;
  intentParserSource: string | null;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
  suspiciousFlags: string[];
  warnings: string[];
  errors: string[];
  needsRestaurant?: boolean;
  needsActivity?: boolean;
};

export function classifyQaIssue(summary: QaSearchSummary) {
  if (summary.errors.length > 0 || !summary.ok) {
    return {
      severity: "critical",
      type: "technical_failure",
      label: summary.errors[0] ?? "Search QA execution failed",
    };
  }

  if (summary.result_count === 0) {
    return {
      severity: "high",
      type: "no_results",
      label: summary.no_results_reason ?? "No valid results",
    };
  }

  if (
    summary.needsRestaurant &&
    summary.needsActivity &&
    summary.pair_count === 0
  ) {
    return {
      severity: "high",
      type: "missing_pair",
      label:
        summary.no_pairs_reason ??
        summary.no_results_reason ??
        "Paired query returned no pair",
    };
  }

  if (summary.speed_status === "critical" || summary.speed_status === "slow") {
    return {
      severity: summary.speed_status === "critical" ? "high" : "medium",
      type: "slow_search",
      label: `Search completed with ${summary.speed_status} latency`,
    };
  }

  return { severity: null, type: null, label: null };
}

export function buildQaSearchLogRow(
  summary: QaSearchSummary,
  requestId: string | null,
) {
  const issue = classifyQaIssue(summary);
  const technicalSuccess = summary.errors.length === 0;
  const qualitySuccess = technicalSuccess && issue.type === null;

  return {
    query: summary.query,
    created_at: new Date().toISOString(),
    technical_success: technicalSuccess,
    quality_success: qualitySuccess,
    quality_severity: issue.severity,
    quality_issue_type: issue.type,
    quality_issue_label: issue.label,
    suspicious_flags: summary.suspiciousFlags,
    quality_findings: {
      source: "admin_search_health_batch_qa",
      requestId,
      engine: summary.engine,
      searchType: summary.normalized_search_type,
      primaryDomain: summary.primary_domain,
      restaurantCount: summary.restaurant_count,
      activityCount: summary.activity_count,
      pairCount: summary.pair_count,
      resultCount: summary.result_count,
      timingMs: summary.timing_ms,
      speedStatus: summary.speed_status,
      intentParserSource: summary.intentParserSource,
      needsRestaurant: Boolean(summary.needsRestaurant),
      needsActivity: Boolean(summary.needsActivity),
      noResultsReason: summary.no_results_reason,
      noPairsReason: summary.no_pairs_reason,
      warnings: summary.warnings,
      errors: summary.errors,
    },
  };
}

export async function persistQaSearchLog(
  summary: QaSearchSummary,
  requestId: string | null,
) {
  const row = buildQaSearchLogRow(summary, requestId);
  const { error } = await supabaseAdmin.from("search_logs").insert(row);

  if (error) {
    throw new Error(`QA search log failed: ${error.message}`);
  }

  return row;
}
