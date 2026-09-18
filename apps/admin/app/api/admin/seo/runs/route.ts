import { NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const RUN_FIELDS = [
  "id",
  "run_type",
  "status",
  "score",
  "pages_scanned",
  "issues_found",
  "critical_count",
  "warning_count",
  "improvement_count",
  "passed_count",
  "started_at",
  "completed_at",
  "created_at",
].join(",");

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoTools);
  if (auth.error) return auth.error;

  const { data, error } = await getAdminDatabaseClient()
    .from("seo_audit_runs")
    .select(RUN_FIELDS)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "Could not load SEO audit runs." },
      { status: 500 },
    );
  }

  return NextResponse.json({ runs: data ?? [] });
}
