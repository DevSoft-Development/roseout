import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "@/lib/admin/formatters";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const metadata = { title: "SEO Tools – Admin" };

const PAGE_RUN_FIELDS = "id,created_at";
const PAGE_ISSUE_FIELDS = [
  "id",
  "title",
  "severity",
  "status",
  "affected_route",
  "affected_file",
  "recommended_fix",
  "fix_url",
  "created_at",
].join(",");

type SeoRunSummary = {
  id: string;
  created_at: string | null;
};

type SeoIssueSummary = {
  id: string;
  title: string | null;
  severity: string | null;
  status: string | null;
  affected_route: string | null;
  affected_file: string | null;
  recommended_fix: string | null;
  fix_url: string | null;
  created_at: string | null;
};

export default async function Page() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.seoTools);
  const db = getAdminDatabaseClient();

  const [runsResult, issuesResult] = await Promise.all([
    db
      .from("seo_audit_runs")
      .select(PAGE_RUN_FIELDS)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("seo_audit_issues")
      .select(PAGE_ISSUE_FIELDS)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const runs = ((runsResult.data ?? []) as unknown) as SeoRunSummary[];
  const issues = ((issuesResult.data ?? []) as unknown) as SeoIssueSummary[];
  const latest = runs[0];
  const group = (severity: string) =>
    issues.filter((issue) => issue.severity === severity);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Growth · Search Visibility"
        title="SEO Tools"
        subtitle={`Last audit: ${formatDate(latest?.created_at)} (${formatRelativeTime(latest?.created_at)})`}
        badge={<AdminStatusBadge tone={group("critical").length ? "red" : group("warning").length ? "amber" : "green"}>{group("critical").length ? `${group("critical").length} critical issues` : group("warning").length ? `${group("warning").length} warnings` : "SEO audit healthy"}</AdminStatusBadge>}
        actions={
          <>
            <form action="/api/admin/seo/setup" method="post">
              <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 hover:border-rose-200/30 hover:text-white">Run SEO setup</button>
            </form>
            <form action="/api/admin/seo/audit" method="post">
              <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500">Run SEO audit</button>
            </form>
          </>
        }
      />

      <AdminKpiGrid>
        {[
          ["Critical", group("critical").length],
          ["Warning", group("warning").length],
          ["Improvement", group("improvement").length],
          ["Passed", group("passed").length],
        ].map(([label, value]) => (
          <AdminKpiCard key={String(label)} label={String(label)} value={formatNumber(Number(value))} helper="Latest SEO audit" />
        ))}
      </AdminKpiGrid>

        <div className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          {runsResult.error || issuesResult.error ? (
            <p className="text-rose-300">Failed loading SEO data.</p>
          ) : !issues.length ? (
            <p className="text-white/70">No SEO audits yet.</p>
          ) : (
            <div className="space-y-3">
              {issues.slice(0, 80).map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-2xl border border-white/10 p-4"
                >
                  <p className="font-bold">{issue.title || "SEO issue"}</p>
                  <p className="text-xs text-white/60">
                    {issue.severity} · {issue.status || "open"} · {issue.affected_route || issue.affected_file || "Not set"}
                  </p>
                  <p className="text-sm text-white/80">
                    {issue.recommended_fix || "Review metadata and content fields."}
                  </p>
                  {issue.fix_url ? (
                    <Link href={issue.fix_url} className="text-sm text-amber-300">
                      Fix
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
    </AdminPageShell>
  );
}
