import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { inspectPublicSeoUrl, type LiveSeoInspection } from "@/lib/admin/seo/live-inspection";

export const dynamic = "force-dynamic";

const AUDIT_URLS = [
  "/",
  "/about",
  "/business",
  "/business/plans",
  "/explore",
  "/contact",
  "/privacy",
  "/terms",
] as const;

function issueRows(runId: string, inspection: LiveSeoInspection) {
  const rows: Array<Record<string, unknown>> = [];
  const route = new URL(inspection.url).pathname;
  const push = (severity: "critical" | "warning" | "improvement", title: string, description: string, currentValue: string | null, recommendedFix: string) => {
    rows.push({
      run_id: runId,
      severity,
      title,
      description,
      affected_area: "public-seo",
      affected_route: route,
      current_value: currentValue,
      recommended_fix: recommendedFix,
      fix_url: `/admin/dashboard/seo?url=${encodeURIComponent(route)}`,
      status: "open",
      metadata: { inspected_url: inspection.url, checked_at: inspection.checkedAt },
    });
  };

  if (!inspection.ok) push("critical", "Public page is not healthy", `The page returned HTTP ${inspection.status}.`, String(inspection.status), "Restore a successful 200 response before requesting indexing.");
  if (!inspection.indexable) push("critical", "Public page is not indexable", "The page is blocked from indexing or did not return a successful response.", inspection.robots, "Remove unintended noindex directives and confirm the page returns 200.");
  if (!inspection.title) push("warning", "Missing page title", "Search engines do not have a page-specific title to use.", null, "Add unique page metadata with a descriptive title.");
  if (!inspection.description) push("warning", "Missing meta description", "The page does not expose a meta description.", null, "Add a concise page-specific meta description.");
  if (!inspection.canonical) push("warning", "Missing canonical URL", "The page does not declare its preferred canonical URL.", null, "Add a self-referencing canonical URL for this public page.");
  if (!inspection.inSitemap) push("warning", "Page missing from primary sitemap", "The inspected URL was not found in /sitemap.xml.", inspection.url, "Add the eligible public page to the dynamic sitemap.");
  if (!inspection.hasJsonLd) push("improvement", "Structured data not detected", "No JSON-LD block was detected on the page.", null, "Add appropriate structured data when it materially describes the page or entity.");

  return rows;
}

export async function POST() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoEdit);
  if (auth.error) return auth.error;

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabaseAdmin
    .from("seo_audit_runs")
    .insert({ run_type: "live_public_audit", status: "running", started_at: startedAt, metadata: { routes: AUDIT_URLS } })
    .select("*")
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || "Could not create SEO audit run." }, { status: 500 });
  }

  try {
    const inspections = await Promise.all(AUDIT_URLS.map((url) => inspectPublicSeoUrl(url)));
    const issues = inspections.flatMap((inspection) => issueRows(run.id, inspection));
    const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
    const warningCount = issues.filter((issue) => issue.severity === "warning").length;
    const improvementCount = issues.filter((issue) => issue.severity === "improvement").length;
    const totalChecks = inspections.length * 7;
    const passedCount = Math.max(0, totalChecks - issues.length);
    const score = Math.max(0, Math.round(100 - (criticalCount * 15) - (warningCount * 6) - (improvementCount * 2)));

    if (issues.length) {
      const { error: issueError } = await supabaseAdmin.from("seo_audit_issues").insert(issues);
      if (issueError) throw issueError;
    }

    const completedAt = new Date().toISOString();
    const { data: completedRun, error: updateError } = await supabaseAdmin
      .from("seo_audit_runs")
      .update({
        status: "completed",
        score,
        pages_scanned: inspections.length,
        issues_found: issues.length,
        critical_count: criticalCount,
        warning_count: warningCount,
        improvement_count: improvementCount,
        passed_count: passedCount,
        completed_at: completedAt,
        metadata: { routes: AUDIT_URLS, inspections },
      })
      .eq("id", run.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ run: completedRun, inspections, issuesCreated: issues.length });
  } catch (error) {
    await supabaseAdmin
      .from("seo_audit_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), metadata: { routes: AUDIT_URLS, error: error instanceof Error ? error.message : "SEO audit failed" } })
      .eq("id", run.id);

    return NextResponse.json({ error: error instanceof Error ? error.message : "SEO audit failed." }, { status: 500 });
  }
}
