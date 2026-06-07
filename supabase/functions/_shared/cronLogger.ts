import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type CronJobRunStatus = "success" | "failed" | "skipped" | "warning" | "started";

export type CronJobRunPayload = {
  job_name: string;
  function_name?: string | null;
  source?: string | null;
  status: CronJobRunStatus | string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  checked_count?: number | null;
  success_count?: number | null;
  skipped_count?: number | null;
  failed_count?: number | null;
  success_rate?: number | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function normalizeCronStatus(status: string): CronJobRunStatus {
  const normalized = status.toLowerCase();
  if (["success", "failed", "skipped", "warning", "started"].includes(normalized)) {
    return normalized as CronJobRunStatus;
  }
  if (["error", "failure", "failed_error"].includes(normalized)) return "failed";
  if (["partial", "partial_success", "degraded"].includes(normalized)) return "warning";
  return "warning";
}

export async function logCronJobRun(
  supabase: SupabaseClient,
  payload: CronJobRunPayload,
): Promise<void> {
  try {
    const { error } = await supabase.from("cron_job_runs").insert({
      job_name: payload.job_name,
      function_name: payload.function_name ?? payload.job_name,
      source: payload.source ?? "cron",
      status: normalizeCronStatus(String(payload.status ?? "success")),
      started_at: payload.started_at ?? null,
      finished_at: payload.finished_at ?? new Date().toISOString(),
      duration_ms: payload.duration_ms ?? null,
      checked_count: payload.checked_count ?? null,
      success_count: payload.success_count ?? null,
      skipped_count: payload.skipped_count ?? null,
      failed_count: payload.failed_count ?? null,
      success_rate: payload.success_rate ?? null,
      error_message: payload.error_message ?? null,
      metadata: payload.metadata ?? {},
    });
    if (error) console.warn("[cron-log] skipped", error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[cron-log] unavailable", message);
  }
}
