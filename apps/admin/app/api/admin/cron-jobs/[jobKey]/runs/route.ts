import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { summarizeCronOutcome } from "@/lib/cron/outcome";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const CRON_RUN_FIELDS = "id,job_key,job_name,function_name,source,status,created_at,started_at,completed_at,finished_at,duration_ms,checked_count,success_count,skipped_count,failed_count,error_message,message,details,http_status,transport_status";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobKey: string }> }) {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;
  const { jobKey } = await params;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 25), 1), 50);
  const { data, error } = await getAdminDatabaseClient()
    .from("cron_job_runs")
    .select(CRON_RUN_FIELDS)
    .eq("job_key", jobKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  const runs = (data || []).map((run: Record<string, unknown>) => ({ ...run, outcome: summarizeCronOutcome(run) }));
  return NextResponse.json({ success: true, runs });
}
