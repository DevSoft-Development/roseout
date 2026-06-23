import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin.from("cron_jobs").select("*").order("last_failed_at", { ascending: false, nullsFirst: false }).order("last_completed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  const jobs = data || [];
  const counts = { total: jobs.length, success: jobs.filter((j: any) => j.last_status === "success").length, failed: jobs.filter((j: any) => j.last_status === "failed").length, running: jobs.filter((j: any) => j.last_status === "running").length, never_run: jobs.filter((j: any) => j.last_status === "never_run").length, email_alerts_enabled: jobs.filter((j: any) => j.send_success_email || j.send_failure_email).length };
  return NextResponse.json({ success: true, jobs, counts });
}
