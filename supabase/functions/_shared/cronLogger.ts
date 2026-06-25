import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type CronJobRunStatus = "success" | "failed" | "skipped" | "warning" | "started" | "running" | "error";

export type CronJobRunPayload = {
  job_name: string;
  job_key?: string | null;
  function_name?: string | null;
  route_path?: string | null;
  description?: string | null;
  schedule_hint?: string | null;
  message?: string | null;
  details?: Record<string, unknown> | null;
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

function normalizeJobKey(value: string | null | undefined): string {
  return String(value || "unknown-cron-job")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-cron-job";
}

export function normalizeCronStatus(status: string): CronJobRunStatus {
  const normalized = status.toLowerCase();
  if (["success", "failed", "skipped", "warning", "started", "running", "error"].includes(normalized)) {
    return normalized as CronJobRunStatus;
  }
  if (["failure", "failed_error"].includes(normalized)) return "failed";
  if (["partial", "partial_success", "degraded"].includes(normalized)) return "warning";
  return "warning";
}

function mapLastStatus(status: CronJobRunStatus, errorMessage?: string | null): "running" | "success" | "failed" {
  if (status === "failed" || status === "error" || errorMessage) return "failed";
  if (status === "started" || status === "running") return "running";
  return "success";
}

function buildDetails(payload: CronJobRunPayload): Record<string, unknown> {
  const details = { ...(payload.metadata ?? {}), ...(payload.details ?? {}) };
  for (const key of ["checked_count", "success_count", "skipped_count", "failed_count", "success_rate", "source"] as const) {
    const value = key === "source" ? (payload.source ?? "edge_function") : payload[key];
    if (value !== undefined && value !== null) details[key] = value;
  }
  return details;
}

function buildMessage(payload: CronJobRunPayload, status: CronJobRunStatus): string {
  if (payload.message) return payload.message;
  const counts = [
    payload.checked_count != null ? `${payload.checked_count} checked` : null,
    payload.success_count != null ? `${payload.success_count} succeeded` : null,
    payload.skipped_count != null ? `${payload.skipped_count} skipped` : null,
    payload.failed_count != null ? `${payload.failed_count} failed` : null,
  ].filter(Boolean).join(", ");
  return counts ? `${payload.job_name} ${status}: ${counts}.` : `${payload.job_name} ${status}.`;
}

export async function logCronJobRun(
  supabase: SupabaseClient,
  payload: CronJobRunPayload,
): Promise<void> {
  const status = normalizeCronStatus(String(payload.status ?? "success"));
  const jobKey = normalizeJobKey(payload.job_key ?? payload.function_name ?? payload.job_name);
  const functionName = payload.function_name ?? payload.job_name;
  const finishedAt = payload.finished_at ?? new Date().toISOString();
  const runSource = payload.source ?? "edge_function";
  const jobSource = payload.source && !["cron", "manual", "manual_dry_run", "digest_self"].includes(payload.source) ? payload.source : "edge_function";
  const details = buildDetails(payload);
  const message = buildMessage(payload, status);
  const routePath = payload.route_path ?? (functionName ? `supabase/functions/${functionName}` : null);

  const runRow = {
    job_key: jobKey,
    job_name: payload.job_name,
    function_name: functionName,
    source: runSource,
    status,
    started_at: payload.started_at ?? null,
    finished_at: finishedAt,
    completed_at: finishedAt,
    duration_ms: payload.duration_ms ?? null,
    checked_count: payload.checked_count ?? null,
    success_count: payload.success_count ?? null,
    skipped_count: payload.skipped_count ?? null,
    failed_count: payload.failed_count ?? null,
    success_rate: payload.success_rate ?? null,
    error_message: payload.error_message ?? null,
    metadata: payload.metadata ?? {},
    message,
    details,
  };

  let runInserted = false;
  try {
    const { error } = await supabase.from("cron_job_runs").insert(runRow);
    if (error) {
      const { error: fallbackError } = await supabase.from("cron_job_runs").insert({
        job_name: payload.job_name,
        function_name: functionName,
        source: runSource,
        status,
        started_at: payload.started_at ?? null,
        finished_at: finishedAt,
        duration_ms: payload.duration_ms ?? null,
        checked_count: payload.checked_count ?? null,
        success_count: payload.success_count ?? null,
        skipped_count: payload.skipped_count ?? null,
        failed_count: payload.failed_count ?? null,
        success_rate: payload.success_rate ?? null,
        error_message: payload.error_message ?? null,
        metadata: payload.metadata ?? {},
      });
      if (fallbackError) console.warn("[cron-log] skipped", fallbackError.message);
      else runInserted = true;
    } else {
      runInserted = true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[cron-log] unavailable", errorMessage);
  }

  if (!runInserted) return;

  const lastStatus = mapLastStatus(status, payload.error_message);
  const isCompleted = ["success", "warning", "skipped"].includes(status);
  const isFailed = status === "failed" || status === "error" || Boolean(payload.error_message);
  try {
    const { data: existingJob } = await supabase
      .from("cron_jobs")
      .select("route_path,description,schedule_hint,source,is_active")
      .eq("job_key", jobKey)
      .maybeSingle();

    const { error } = await supabase.from("cron_jobs").upsert({
      job_key: jobKey,
      job_name: payload.job_name,
      route_path: routePath ?? existingJob?.route_path ?? null,
      description: payload.description ?? existingJob?.description ?? null,
      schedule_hint: payload.schedule_hint ?? existingJob?.schedule_hint ?? null,
      source: existingJob?.source ?? jobSource,
      is_active: existingJob?.is_active ?? true,
      last_status: lastStatus,
      last_started_at: payload.started_at ?? null,
      last_completed_at: isCompleted ? finishedAt : null,
      last_failed_at: isFailed ? finishedAt : null,
      last_duration_ms: payload.duration_ms ?? null,
      last_message: message,
      last_details: details,
      last_error: payload.error_message ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_key" });
    if (error) console.warn("[cron-log] cron_jobs upsert skipped", error.message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[cron-log] cron_jobs unavailable", errorMessage);
  }
}
