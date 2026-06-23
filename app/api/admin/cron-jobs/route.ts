import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { knownCronSourceByKey } from "@/lib/cron/knownCronSources";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RunRow = { job_key: string | null; status: string | null; created_at: string | null; completed_at?: string | null; finished_at?: string | null; error_message?: string | null };

function attentionReason(job: any, runStats: { count: number; latest?: RunRow }, sourceInfo: ReturnType<typeof knownCronSourceByKey.get>) {
  if (!runStats.count) return "registered_no_runs";
  if (job.last_status === "never_run" || !job.last_started_at) return "has_history_but_summary_missing";
  if (job.source === "edge_function" && sourceInfo?.schedule_detected === false) return "edge_function_not_scheduled";
  if (job.source === "edge_function" && sourceInfo?.logger_expected === false) return "edge_function_logger_not_confirmed";
  if (!sourceInfo) return "unknown";
  return "ok";
}

export async function GET() {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;

  const { data: cronJobs, error } = await supabaseAdmin.from("cron_jobs").select("*");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const { data: runs, error: runsError } = await supabaseAdmin
    .from("cron_job_runs")
    .select("job_key,status,created_at,completed_at,finished_at,error_message")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (runsError) return NextResponse.json({ success: false, error: runsError.message }, { status: 400 });

  const stats = new Map<string, { count: number; latest?: RunRow }>();
  for (const run of (runs || []) as RunRow[]) {
    if (!run.job_key) continue;
    const current = stats.get(run.job_key) || { count: 0 };
    current.count += 1;
    if (!current.latest) current.latest = run;
    stats.set(run.job_key, current);
  }

  const statusRank: Record<string, number> = { failed: 0, running: 1, success: 3, never_run: 4 };
  const jobs = (cronJobs || []).map((job: any) => {
    const sourceInfo = knownCronSourceByKey.get(job.job_key);
    const runStats = stats.get(job.job_key) || { count: 0 };
    const needs_attention_reason = attentionReason(job, runStats, sourceInfo);
    return {
      ...job,
      source: job.source || sourceInfo?.source || "unknown",
      route_path: job.route_path || sourceInfo?.route_path || null,
      schedule_hint: job.schedule_hint || sourceInfo?.schedule_hint || null,
      schedule_detected: sourceInfo?.schedule_detected ?? false,
      schedule_notes: sourceInfo?.notes || null,
      logger_expected: sourceInfo?.logger_expected ?? false,
      has_run_history: runStats.count > 0,
      run_count: runStats.count,
      latest_run_at: runStats.latest?.completed_at || runStats.latest?.finished_at || runStats.latest?.created_at || null,
      latest_run_status: runStats.latest?.status || null,
      needs_attention_reason,
    };
  }).sort((a: any, b: any) => {
    const statusDelta = (statusRank[a.last_status] ?? 5) - (statusRank[b.last_status] ?? 5);
    if (statusDelta) return statusDelta;
    const attentionDelta = (a.needs_attention_reason === "ok" ? 1 : 0) - (b.needs_attention_reason === "ok" ? 1 : 0);
    if (attentionDelta) return attentionDelta;
    const aTime = Date.parse(a.last_failed_at || a.last_completed_at || a.latest_run_at || a.updated_at || a.created_at || "") || 0;
    const bTime = Date.parse(b.last_failed_at || b.last_completed_at || b.latest_run_at || b.updated_at || b.created_at || "") || 0;
    return bTime - aTime;
  });

  const counts = {
    total: jobs.length,
    success: jobs.filter((j: any) => j.last_status === "success").length,
    failed: jobs.filter((j: any) => j.last_status === "failed").length,
    running: jobs.filter((j: any) => j.last_status === "running").length,
    never_run: jobs.filter((j: any) => j.last_status === "never_run").length,
    needs_attention: jobs.filter((j: any) => j.needs_attention_reason !== "ok").length,
    email_alerts_enabled: jobs.filter((j: any) => j.send_success_email || j.send_failure_email).length,
  };
  return NextResponse.json({ success: true, jobs, counts });
}
