import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";

type CronResult =
  | { message?: string; details?: Record<string, unknown>; response?: Response | NextResponse | Record<string, unknown> }
  | Response
  | NextResponse
  | Record<string, unknown>
  | void;

type Params = {
  jobKey: string;
  jobName: string;
  routePath?: string;
  description?: string;
  scheduleHint?: string;
  isManuallyRunnable?: boolean;
  suppressConfiguredEmail?: boolean;
  handler: () => Promise<CronResult>;
};

type EmailDelivery = { sent: boolean; provider?: string; error?: string | null };

const DEFAULT_CRON_LEASE_MS = 15 * 60 * 1000;
const MIN_CRON_LEASE_MS = 6 * 60 * 1000;
const MAX_CRON_LEASE_MS = 60 * 60 * 1000;

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function details(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !isResponse(value) ? (value as Record<string, unknown>) : {};
}

function messageFrom(value: unknown, fallback: string) {
  const data = details(value);
  return typeof data.message === "string" ? data.message : fallback;
}

function cronLeaseMs() {
  const configured = Number(process.env.CRON_EXECUTION_LEASE_MS || "");
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_CRON_LEASE_MS;
  return Math.min(MAX_CRON_LEASE_MS, Math.max(MIN_CRON_LEASE_MS, Math.trunc(configured)));
}

async function structuredResponseDetails(value: unknown): Promise<Record<string, unknown>> {
  if (!isResponse(value)) return details(value);

  try {
    const clone = value.clone();
    const contentType = clone.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      const parsed = await clone.json();
      return details(parsed);
    }

    const text = await clone.text();
    if (!text) return {};
    try {
      return details(JSON.parse(text));
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

function responseErrorMessage(response: Response, payload: Record<string, unknown>, fallback: string) {
  const candidates = [payload.error, payload.message, payload.detail];
  const message = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof message === "string" ? message : fallback;
}

function recipients(row: any) {
  return Array.isArray(row?.email_recipients) && row.email_recipients.length ? row.email_recipients : undefined;
}

async function sendConfiguredCronEmail(
  row: any,
  success: boolean,
  message: string,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
  data: Record<string, unknown>,
  error?: string,
): Promise<EmailDelivery> {
  if ((success && !row?.send_success_email) || (!success && !row?.send_failure_email)) {
    return { sent: false, provider: "disabled" };
  }

  const original = process.env.ADMIN_ALERT_EMAIL;
  const to = recipients(row);
  if (to?.length) process.env.ADMIN_ALERT_EMAIL = to.join(",");

  try {
    return await sendCronImportSummaryEmail({
      success,
      cronName: row?.job_name || row?.job_key || "Cron Job",
      startedAt,
      finishedAt,
      durationMs,
      steps: [
        {
          path: row?.route_path || row?.job_key,
          ok: success,
          status: success ? 200 : 500,
          label: row?.job_name,
          data: { success, message, ...data, error },
        },
      ],
    });
  } finally {
    if (to?.length) {
      if (original === undefined) delete process.env.ADMIN_ALERT_EMAIL;
      else process.env.ADMIN_ALERT_EMAIL = original;
    }
  }
}

async function persistEmailDelivery(
  runId: string | number | undefined,
  baseDetails: Record<string, unknown>,
  delivery: EmailDelivery,
  recipientsList?: string[],
) {
  if (!runId) return;
  const attemptedAt = new Date().toISOString();
  await supabaseAdmin
    .from("cron_job_runs")
    .update({
      ...(delivery.sent ? { alert_dispatched_at: attemptedAt } : {}),
      details: {
        ...baseDetails,
        email_notification: {
          requested: delivery.provider !== "disabled",
          sent: delivery.sent,
          provider: delivery.provider || null,
          error: delivery.error || null,
          recipients: recipientsList || null,
          attempted_at: attemptedAt,
        },
      },
    })
    .eq("id", runId);
}

async function pausedResponse(jobKey: string, jobName: string, startedAt: string) {
  const finishedAt = new Date().toISOString();
  const message = `${jobName} skipped because the job is paused.`;
  await supabaseAdmin.from("cron_job_runs").insert({
    job_key: jobKey,
    job_name: jobName,
    status: "skipped",
    started_at: startedAt,
    completed_at: finishedAt,
    finished_at: finishedAt,
    duration_ms: 0,
    message,
    details: { reason: "job_disabled" },
  });
  return NextResponse.json({ success: true, skipped: true, reason: "job_disabled", message });
}

async function duplicateInflightResponse(jobKey: string, jobName: string, startedAt: string, leaseMs: number) {
  const finishedAt = new Date().toISOString();
  const message = `${jobName} skipped because another execution currently owns the cron lease.`;
  await supabaseAdmin.from("cron_job_runs").insert({
    job_key: jobKey,
    job_name: jobName,
    status: "skipped",
    started_at: startedAt,
    completed_at: finishedAt,
    finished_at: finishedAt,
    duration_ms: 0,
    message,
    details: { reason: "duplicate_inflight", lease_ms: leaseMs },
  });
  return NextResponse.json({
    success: true,
    skipped: true,
    reason: "duplicate_inflight",
    leaseMs,
    message,
  });
}

async function expireStaleRunRows(jobKey: string, jobName: string, staleBefore: string) {
  const finishedAt = new Date().toISOString();
  const message = `${jobName} previous execution lease expired before completion.`;
  const { error } = await supabaseAdmin
    .from("cron_job_runs")
    .update({
      status: "failed",
      completed_at: finishedAt,
      finished_at: finishedAt,
      error_message: "stale_execution_lease_expired",
      message,
      details: { reason: "stale_execution_lease_recovered" },
    })
    .eq("job_key", jobKey)
    .eq("status", "running")
    .lt("started_at", staleBefore);
  if (error) throw error;
}

async function claimExecutionLease(jobKey: string, startedAt: string, staleBefore: string) {
  const { data, error } = await supabaseAdmin
    .from("cron_jobs")
    .update({
      last_status: "running",
      last_started_at: startedAt,
      last_error: null,
      updated_at: startedAt,
    })
    .eq("job_key", jobKey)
    .or(`last_status.neq.running,last_started_at.is.null,last_started_at.lt.${staleBefore}`)
    .select("job_key,last_started_at")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.job_key);
}

// All new Next.js cron jobs should use runTrackedCron. It enforces the central pause flag,
// acquires an atomic cross-runtime execution lease, and persists structured business outcomes.
export async function runTrackedCron({
  jobKey,
  jobName,
  routePath,
  description,
  scheduleHint,
  isManuallyRunnable,
  suppressConfiguredEmail = false,
  handler,
}: Params) {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const leaseMs = cronLeaseMs();
  const staleBefore = new Date(started - leaseMs).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("cron_jobs")
    .select("is_active")
    .eq("job_key", jobKey)
    .maybeSingle();

  if (existing?.is_active === false) {
    return pausedResponse(jobKey, jobName, startedAt);
  }

  const { error: metadataError } = await supabaseAdmin.from("cron_jobs").upsert(
    {
      job_key: jobKey,
      job_name: jobName,
      route_path: routePath ?? null,
      description: description ?? null,
      schedule_hint: scheduleHint ?? null,
      ...(typeof isManuallyRunnable === "boolean" ? { is_manually_runnable: isManuallyRunnable } : {}),
    },
    { onConflict: "job_key" },
  );
  if (metadataError) throw metadataError;

  await expireStaleRunRows(jobKey, jobName, staleBefore);
  const ownsLease = await claimExecutionLease(jobKey, startedAt, staleBefore);
  if (!ownsLease) {
    return duplicateInflightResponse(jobKey, jobName, startedAt, leaseMs);
  }

  const { data: run, error: runInsertError } = await supabaseAdmin
    .from("cron_job_runs")
    .insert({ job_key: jobKey, job_name: jobName, status: "running", started_at: startedAt })
    .select("id")
    .maybeSingle();
  if (runInsertError) {
    await supabaseAdmin
      .from("cron_jobs")
      .update({ last_status: "failed", last_failed_at: new Date().toISOString(), last_error: runInsertError.message })
      .eq("job_key", jobKey)
      .eq("last_started_at", startedAt);
    throw runInsertError;
  }

  try {
    const result = await handler();
    const isWrapped =
      result &&
      typeof result === "object" &&
      !isResponse(result) &&
      ("response" in result || "details" in result || "message" in result);
    const response = isWrapped ? (result as any).response : result;
    const responseDetails = await structuredResponseDetails(response);
    const explicitDetails = isWrapped ? ((result as any).details || {}) : {};
    const resultDetails = { ...responseDetails, ...explicitDetails };
    const message = isWrapped
      ? ((result as any).message || messageFrom(responseDetails, "Cron job completed successfully."))
      : messageFrom(responseDetails, messageFrom(response, "Cron job completed successfully."));

    if (isResponse(response) && !response.ok) {
      throw new Error(responseErrorMessage(response, responseDetails, `${jobName} returned HTTP ${response.status}.`));
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - started;

    await supabaseAdmin
      .from("cron_job_runs")
      .update({ status: "success", completed_at: finishedAt, finished_at: finishedAt, duration_ms: durationMs, message, details: resultDetails })
      .eq("id", run?.id);
    const { data: row } = await supabaseAdmin
      .from("cron_jobs")
      .update({
        last_status: "success",
        last_completed_at: finishedAt,
        last_duration_ms: durationMs,
        last_message: message,
        last_details: resultDetails,
        last_error: null,
        updated_at: finishedAt,
      })
      .eq("job_key", jobKey)
      .eq("last_started_at", startedAt)
      .select("*")
      .maybeSingle();

    const delivery = suppressConfiguredEmail
      ? { sent: false, provider: "disabled" }
      : await sendConfiguredCronEmail(row, true, message, startedAt, finishedAt, durationMs, resultDetails);
    await persistEmailDelivery(run?.id, resultDetails, delivery, recipients(row));

    if (delivery.provider !== "disabled" && !delivery.sent) {
      console.error("Cron success email failed", { jobKey, provider: delivery.provider, error: delivery.error });
    }

    return isResponse(response) ? response : NextResponse.json(response ?? { success: true, message });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    const errorMessage = error instanceof Error ? error.message : "Cron job failed.";
    const errorStack = error instanceof Error ? error.stack : undefined;

    await supabaseAdmin
      .from("cron_job_runs")
      .update({
        status: "failed",
        completed_at: finishedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_message: errorMessage,
        error_stack: errorStack,
      })
      .eq("id", run?.id);
    const { data: row } = await supabaseAdmin
      .from("cron_jobs")
      .update({
        last_status: "failed",
        last_failed_at: finishedAt,
        last_duration_ms: durationMs,
        last_error: errorMessage,
        updated_at: finishedAt,
      })
      .eq("job_key", jobKey)
      .eq("last_started_at", startedAt)
      .select("*")
      .maybeSingle();

    const delivery = suppressConfiguredEmail
      ? { sent: false, provider: "disabled" }
      : await sendConfiguredCronEmail(row, false, errorMessage, startedAt, finishedAt, durationMs, {}, errorMessage);
    await persistEmailDelivery(run?.id, {}, delivery, recipients(row));

    if (delivery.provider !== "disabled" && !delivery.sent) {
      console.error("Cron failure email failed", { jobKey, provider: delivery.provider, error: delivery.error });
    }

    throw error;
  }
}
