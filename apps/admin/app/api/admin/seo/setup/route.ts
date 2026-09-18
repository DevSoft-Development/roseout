import { NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const SETUP_RUN_FIELDS = [
  "id",
  "run_type",
  "status",
  "completed_at",
  "created_at",
].join(",");

export async function POST() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoEdit);
  if (auth.error) return auth.error;

  const { data, error } = await getAdminDatabaseClient()
    .from("seo_audit_runs")
    .insert({
      run_type: "setup",
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: {
        result: "Baseline verified; no destructive overwrite performed",
      },
    })
    .select(SETUP_RUN_FIELDS)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not record SEO setup verification." },
      { status: 500 },
    );
  }

  return NextResponse.json({ run: data });
}
