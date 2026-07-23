import type { JobHandler, WorkerJob, WorkerContext } from "./types.ts";
import { retryDelaySeconds } from "./retry.ts";

const OPERATIONS_JOB_TYPES = new Set([
  "search.document_rebuild",
  "search.embedding_generation",
  "analytics.aggregate",
  "enrichment.ai_profile",
  "enrichment.ai_menu",
  "ml.duplicate_detection.recalculate",
  "review.moderation",
  "location.publishability_repair",
]);

const EDGE_FUNCTION_BY_JOB_TYPE: Record<string, string> = {
  "search.anchor.reconcile": "search-anchor-reconciliation",
  "search.qa.batch": "admin-search-health-digest",
  "search.maintenance": "create-search",
  "location.chain_classify": "google-location-enrichment",
  "location.backfill": "google-location-enrichment",
  "enrichment.google_metadata": "google-location-enrichment",
  "enrichment.google_photos": "nightly-photo-backfill",
  "photo.backfill": "nightly-photo-backfill",
  "reservation.cleanup": "reservation-status-cleanup",
  "notification.email_deliver": "notification-worker",
  "notification.sms_deliver": "notification-worker",
  "notification.deliver": "notification-worker",
};

const invokeOperationsWorker: JobHandler = async (job, ctx) =>
  invokeEdgeFunction("operations-worker", job, ctx, {
    job_type: job.job_type,
    payload: job.payload ?? {},
  });

const invokeMappedEdgeFunction: JobHandler = async (job, ctx) => {
  const functionName = EDGE_FUNCTION_BY_JOB_TYPE[job.job_type];
  if (!functionName) throw new Error(`Unsupported job type: ${job.job_type}`);
  return invokeEdgeFunction(functionName, job, ctx, {
    ...(job.payload ?? {}),
    worker_job_id: job.id,
    worker_job_type: job.job_type,
  });
};

export const handlers: Record<string, JobHandler> = Object.fromEntries([
  ...Array.from(OPERATIONS_JOB_TYPES, (jobType) => [jobType, invokeOperationsWorker]),
  ...Object.keys(EDGE_FUNCTION_BY_JOB_TYPE).map((jobType) => [jobType, invokeMappedEdgeFunction]),
]);

async function invokeEdgeFunction(
  functionName: string,
  job: WorkerJob,
  ctx: WorkerContext,
  body: Record<string, unknown>,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !workerSecret) {
    throw new Error("Worker invocation environment is incomplete");
  }

  const remainingMs = Math.max(1000, ctx.deadline - Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(remainingMs, 50000));

  ctx.log("worker.handler.invoke", {
    jobId: job.id,
    jobType: job.job_type,
    functionName,
  });

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/${encodeURIComponent(functionName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "x-worker-secret": workerSecret,
          "x-worker-job-id": job.id,
          "x-worker-job-type": job.job_type,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    const text = await response.text();
    let result: Record<string, unknown> = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { response_text: text.slice(0, 4000) };
    }

    if (!response.ok || result.success === false) {
      const detail = typeof result.error === "string"
        ? result.error
        : `HTTP ${response.status}`;
      throw new Error(`${functionName} failed: ${detail}`);
    }

    return {
      progress: { current: 1, total: 1 },
      checkpoint: {
        invokedAt: new Date().toISOString(),
        functionName,
      },
      result: {
        functionName,
        responseStatus: response.status,
        ...result,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        retryAfterSeconds: retryDelaySeconds(job.attempt_count),
        checkpoint: job.checkpoint,
        result: { timedOut: true, functionName },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function processJob(job: WorkerJob, ctx: WorkerContext) {
  const handler = handlers[job.job_type];
  if (!handler) throw new Error(`Unsupported job type: ${job.job_type}`);
  if (Date.now() > ctx.deadline) {
    return {
      retryAfterSeconds: retryDelaySeconds(job.attempt_count),
      checkpoint: job.checkpoint,
      result: { deferred: "time_budget" },
    };
  }
  return handler(job, ctx);
}
