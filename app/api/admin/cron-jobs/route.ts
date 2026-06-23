import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin.from("cron_jobs").select("*");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  const statusRank: Record<string, number> = { failed: 0, running: 1, success: 2, never_run: 3 };
  const jobs = (data || []).sort((a: any, b: any) => {
    const statusDelta = (statusRank[a.last_status] ?? 4) - (statusRank[b.last_status] ?? 4);
    if (statusDelta) return statusDelta;
    const aTime = Date.parse(a.last_failed_at || a.last_completed_at || a.updated_at || a.created_at || "") || 0;
    const bTime = Date.parse(b.last_failed_at || b.last_completed_at || b.updated_at || b.created_at || "") || 0;
    return bTime - aTime;
  });
  const counts = { total: jobs.length, success: jobs.filter((j: any) => j.last_status === "success").length, failed: jobs.filter((j: any) => j.last_status === "failed").length, running: jobs.filter((j: any) => j.last_status === "running").length, never_run: jobs.filter((j: any) => j.last_status === "never_run").length, email_alerts_enabled: jobs.filter((j: any) => j.send_success_email || j.send_failure_email).length };
  return NextResponse.json({ success: true, jobs, counts });
}
