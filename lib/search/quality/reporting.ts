import { sendRawBrandedEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

const siteUrl = () =>
  (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://theouthaven.com"
  ).replace(/\/$/, "");
const recipients = () =>
  (process.env.SEARCH_HEALTH_ALERT_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export async function sendCriticalSearchQualityAlert(event: any) {
  if (event?.quality_severity !== "critical" || !recipients().length)
    return { skipped: true };
  const flags = Array.isArray(event.suspicious_flags)
    ? event.suspicious_flags
    : [];
  return sendRawBrandedEmail({
    to: recipients(),
    department: "admin",
    subject: `Critical Search Quality: ${event.quality_issue_label || event.raw_query || "Review required"}`,
    heading: "Critical search-quality issue",
    preview: event.raw_query || "A production search requires review.",
    body: [
      `Query: ${event.raw_query || "—"}`,
      `Issue: ${event.quality_issue_label || event.quality_issue_type || "—"}`,
      `Technical success: ${event.technical_success === false ? "No" : "Yes"}`,
      `Quality success: ${event.quality_success === false ? "No" : "Yes"}`,
      `Flags: ${flags.join(", ") || "—"}`,
    ].join("\n\n"),
    cta: {
      label: "Review in Search Health",
      url: `${siteUrl()}/admin/dashboard/search-health`,
    },
  });
}

export async function buildSearchQualityDigest(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("search_events")
    .select(
      "id,created_at,raw_query,quality_severity,quality_issue_type,quality_issue_label,suspicious_flags,technical_success,quality_success,result_count,search_core_version,rollout_percentage,v2_issue_codes,v2_fallback_outcome,timing_ms,pair_count",
    )
    .gte("created_at", since)
    .eq("quality_success", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const bySeverity: Record<string, number> = {};
  const byFlag: Record<string, number> = {};
  const byIssue: Record<string, number> = {};
  let v2Volume = 0,
    v2Fulfilled = 0,
    v2NoResults = 0,
    v2PairFailures = 0,
    v2FallbackSuccess = 0;
  const v2Latencies: number[] = [];
  for (const row of rows) {
    const severity = row.quality_severity || "info";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    const issue = row.quality_issue_type || "uncategorized";
    byIssue[issue] = (byIssue[issue] || 0) + 1;
    for (const flag of Array.isArray(row.suspicious_flags)
      ? row.suspicious_flags
      : []) {
      byFlag[flag] = (byFlag[flag] || 0) + 1;
    }
    if (row.search_core_version === "v2") {
      v2Volume++;
      if (row.quality_success !== false) v2Fulfilled++;
      if (row.result_count === 0) v2NoResults++;
      if (
        row.pair_count === 0 &&
        Array.isArray(row.v2_issue_codes) &&
        row.v2_issue_codes.includes("no_valid_pair")
      )
        v2PairFailures++;
      if (row.v2_fallback_outcome === "successful") v2FallbackSuccess++;
      if (Number.isFinite(Number(row.timing_ms)))
        v2Latencies.push(Number(row.timing_ms));
    }
  }
  v2Latencies.sort((a, b) => a - b);
  const p95 = v2Latencies.length
    ? v2Latencies[
        Math.min(v2Latencies.length - 1, Math.floor(v2Latencies.length * 0.95))
      ]
    : null;
  return {
    rows,
    totals: {
      flagged: rows.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
    },
    repeatedPatterns: Object.entries(byFlag)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    issueGroups: Object.entries(byIssue).sort((a, b) => b[1] - a[1]),
    v2: {
      volume: v2Volume,
      fulfillmentRate: v2Volume ? v2Fulfilled / v2Volume : null,
      noResultRate: v2Volume ? v2NoResults / v2Volume : null,
      pairFailureRate: v2Volume ? v2PairFailures / v2Volume : null,
      fallbackSuccessRate: v2Volume ? v2FallbackSuccess / v2Volume : null,
      p95LatencyMs: p95,
    },
  };
}

export async function sendSearchQualityDigest(hours = 24) {
  const digest = await buildSearchQualityDigest(hours);
  if (!recipients().length) return { skipped: true, digest };
  const patterns =
    digest.repeatedPatterns
      .map(([flag, count]) => `${flag}: ${count}`)
      .join("\n") || "No repeated patterns.";
  const groups =
    digest.issueGroups
      .map(([issue, count]) => `${issue}: ${count}`)
      .join("\n") || "No grouped issues.";
  const result = await sendRawBrandedEmail({
    to: recipients(),
    department: "admin",
    subject: `Search Health Daily Summary — ${digest.totals.flagged} quality issues`,
    heading: "Search Health daily quality summary",
    preview: `${digest.totals.critical} critical and ${digest.totals.high} high-priority issues in the last ${hours} hours.`,
    body: [
      `Flagged searches: ${digest.totals.flagged}`,
      `Critical: ${digest.totals.critical}`,
      `High priority: ${digest.totals.high}`,
      `Repeated patterns:\n${patterns}`,
      `Issue groups:\n${groups}`,
      `Search Core V2: ${digest.v2.volume} requests · fulfillment ${digest.v2.fulfillmentRate === null ? "—" : Math.round(digest.v2.fulfillmentRate * 100) + "%"} · no results ${digest.v2.noResultRate === null ? "—" : Math.round(digest.v2.noResultRate * 100) + "%"} · P95 ${digest.v2.p95LatencyMs ?? "—"}ms`,
    ].join("\n\n"),
    cta: {
      label: "Open Search Health",
      url: `${siteUrl()}/admin/dashboard/search-health`,
    },
  });
  return { result, digest };
}
