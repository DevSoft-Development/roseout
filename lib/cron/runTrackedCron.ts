import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";

type CronResult = { message?: string; details?: Record<string, unknown>; response?: Response | NextResponse | Record<string, unknown> } | Response | NextResponse | Record<string, unknown> | void;

type Params = { jobKey: string; jobName: string; routePath?: string; description?: string; scheduleHint?: string; isManuallyRunnable?: boolean; handler: () => Promise<CronResult> };

function isResponse(value: unknown): value is Response { return value instanceof Response; }
function details(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !isResponse(value) ? value as Record<string, unknown> : {}; }
function messageFrom(value: unknown, fallback: string) { const d = details(value); return typeof d.message === "string" ? d.message : fallback; }
function recipients(row: any) { return Array.isArray(row?.email_recipients) && row.email_recipients.length ? row.email_recipients : undefined; }

async function sendConfiguredCronEmail(row: any, success: boolean, message: string, startedAt: string, finishedAt: string, durationMs: number, data: Record<string, unknown>, error?: string) {
  if ((success && !row?.send_success_email) || (!success && !row?.send_failure_email)) return { sent: false, provider: "disabled" };
  const original = process.env.ADMIN_ALERT_EMAIL;
  const to = recipients(row);
  if (to?.length) process.env.ADMIN_ALERT_EMAIL = to.join(",");
  try {
    return await sendCronImportSummaryEmail({ success, cronName: row?.job_name || row?.job_key || "Cron Job", startedAt, finishedAt, durationMs, steps: [{ path: row?.route_path || row?.job_key, ok: success, status: success ? 200 : 500, label: row?.job_name, data: { success, message, ...data, error } }] });
  } finally {
    if (to?.length) {
      if (original === undefined) delete process.env.ADMIN_ALERT_EMAIL;
      else process.env.ADMIN_ALERT_EMAIL = original;
    }
  }
}

// All new cron jobs should use runTrackedCron so they automatically appear in the admin cron jobs page and respect notification settings.
export async function runTrackedCron({ jobKey, jobName, routePath, description, scheduleHint, isManuallyRunnable, handler }: Params) {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  await supabaseAdmin.from("cron_jobs").upsert({ job_key: jobKey, job_name: jobName, route_path: routePath ?? null, description: description ?? null, schedule_hint: scheduleHint ?? null, ...(typeof isManuallyRunnable === "boolean" ? { is_manually_runnable: isManuallyRunnable } : {}), last_status: "running", last_started_at: startedAt }, { onConflict: "job_key" });
  const { data: run } = await supabaseAdmin.from("cron_job_runs").insert({ job_key: jobKey, status: "running", started_at: startedAt }).select("id").maybeSingle();
  try {
    const result = await handler();
    const isWrapped = result && typeof result === "object" && !isResponse(result) && ("response" in result || "details" in result || "message" in result);
    const response = isWrapped ? (result as any).response : result;
    const resultDetails = isWrapped ? ((result as any).details || {}) : details(response);
    const message = isWrapped ? ((result as any).message || "Cron job completed successfully.") : messageFrom(response, "Cron job completed successfully.");
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    await supabaseAdmin.from("cron_job_runs").update({ status: "success", completed_at: finishedAt, duration_ms: durationMs, message, details: resultDetails }).eq("id", run?.id);
    const { data: row } = await supabaseAdmin.from("cron_jobs").update({ last_status: "success", last_completed_at: finishedAt, last_duration_ms: durationMs, last_message: message, last_details: resultDetails, last_error: null }).eq("job_key", jobKey).select("*").maybeSingle();
    sendConfiguredCronEmail(row, true, message, startedAt, finishedAt, durationMs, resultDetails).catch((e) => console.error("Cron success email failed", e));
    return isResponse(response) ? response : NextResponse.json(response ?? { success: true, message });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    const errorMessage = error instanceof Error ? error.message : "Cron job failed.";
    const errorStack = error instanceof Error ? error.stack : undefined;
    await supabaseAdmin.from("cron_job_runs").update({ status: "failed", completed_at: finishedAt, duration_ms: durationMs, error_message: errorMessage, error_stack: errorStack }).eq("id", run?.id);
    const { data: row } = await supabaseAdmin.from("cron_jobs").update({ last_status: "failed", last_failed_at: finishedAt, last_duration_ms: durationMs, last_error: errorMessage }).eq("job_key", jobKey).select("*").maybeSingle();
    sendConfiguredCronEmail(row, false, errorMessage, startedAt, finishedAt, durationMs, {}, errorMessage).catch((e) => console.error("Cron failure email failed", e));
    throw error;
  }
}
