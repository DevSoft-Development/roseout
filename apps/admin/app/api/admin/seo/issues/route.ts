import { NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

const SEO_VIEW_ROLES = ["superadmin", "admin", "editor", "viewer"] as const;

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
  const auth = await requireAdminApiRole(SEO_VIEW_ROLES);
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
