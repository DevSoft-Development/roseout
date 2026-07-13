import { sendRawBrandedEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
const recipients = () => (process.env.SEARCH_HEALTH_ALERT_EMAILS || process.env.ADMIN_EMAIL || "").split(",").map((value) => value.trim()).filter(Boolean);

export async function sendCriticalSearchQualityAlert(event: any) {
  if (event?.quality_severity !== "critical" || !recipients().length) return { skipped: true };
  const flags = Array.isArray(event.suspicious_flags) ? event.suspicious_flags : [];
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
    cta: { label: "Review in Search Health", href: `${siteUrl()}/admin/dashboard/search-health` },
  });
}

export async function buildSearchQualityDigest(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("search_events")
    .select("id,created_at,raw_query,quality_severity,quality_issue_type,quality_issue_label,suspicious_flags,technical_success,quality_success,result_count")
    .gte("created_at", since)
    .eq("quality_success", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const bySeverity: Record<string, number> = {};
  const byFlag: Record<string, number> = {};
  const byIssue: Record<string, number> = {};
  for (const row of rows) {
    const severity = row.quality_severity || "info";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    const issue = row.quality_issue_type || "uncategorized";
    byIssue[issue] = (byIssue[issue] || 0) + 1;
    for (const flag of Array.isArray(row.suspicious_flags) ? row.suspicious_flags : []) {
      byFlag[flag] = (byFlag[flag] || 0) + 1;
    }
  }
  return {
    rows,
    totals: { flagged: rows.length, critical: bySeverity.critical || 0, high: bySeverity.high || 0 },
    repeatedPatterns: Object.entries(byFlag).sort((a, b) => b[1] - a[1]).slice(0, 10),
    issueGroups: Object.entries(byIssue).sort((a, b) => b[1] - a[1]),
  };
}

export async function sendSearchQualityDigest(hours = 24) {
  const digest = await buildSearchQualityDigest(hours);
  if (!recipients().length) return { skipped: true, digest };
  const patterns = digest.repeatedPatterns.map(([flag, count]) => `${flag}: ${count}`).join("\n") || "No repeated patterns.";
  const groups = digest.issueGroups.map(([issue, count]) => `${issue}: ${count}`).join("\n") || "No grouped issues.";
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
    ].join("\n\n"),
    cta: { label: "Open Search Health", href: `${siteUrl()}/admin/dashboard/search-health` },
  });
  return { result, digest };
}
