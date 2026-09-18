import { NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const ISSUE_FIELDS = [
  "id",
  "run_id",
  "severity",
  "title",
  "description",
  "affected_area",
  "affected_route",
  "affected_file",
  "current_value",
  "recommended_fix",
  "fix_url",
  "status",
  "created_at",
  "updated_at",
].join(",");

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoTools);
  if (auth.error) return auth.error;

  const { data, error } = await getAdminDatabaseClient()
    .from("seo_audit_issues")
    .select(ISSUE_FIELDS)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json(
      { error: "Could not load SEO audit issues." },
      { status: 500 },
    );
  }

  return NextResponse.json({ issues: data ?? [] });
}
