import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Json = null | boolean | number | string | Json[] | {
  [key: string]: Json;
};

type WorkerJob = {
  id: string;
  job_type: string;
  status: string;
  payload: Record<string, Json> | null;
  payload_version: number;
  attempt_count: number;
  max_attempts: number;
  progress_current: number;
  progress_total: number | null;
};

type JobResult = {
  job_id: string;
  job_type: string;
  status: "succeeded" | "failed";
  result?: Record<string, Json>;
  error?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
    "x-worker-secret",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
);
const WORKER_INTERNAL_SECRET = requireEnv(
  "WORKER_INTERNAL_SECRET",
);

const DEFAULT_JOB_LIMIT = 5;
const MAX_JOB_LIMIT = 25;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_BACKOFF_SECONDS = 60;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  if (!isAuthorized(request)) {
    return jsonResponse(
      {
        success: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  const requestBody = await readJsonBody(request);

  const limit = normalizeInteger(
    requestBody.limit,
    DEFAULT_JOB_LIMIT,
    1,
    MAX_JOB_LIMIT,
  );

  const leaseSeconds = normalizeInteger(
    requestBody.lease_seconds,
    DEFAULT_LEASE_SECONDS,
    30,
    900,
  );

  const requestedJobTypes = normalizeJobTypes(
    requestBody.job_types,
  );

  const workerName =
    typeof requestBody.worker_name === "string" &&
      requestBody.worker_name.trim()
      ? requestBody.worker_name.trim()
      : `worker-dispatcher-${crypto.randomUUID()}`;

  try {
    const jobs = await claimJobs({
      workerName,
      limit,
      leaseSeconds,
      jobTypes: requestedJobTypes,
    });

    const results: JobResult[] = [];

    for (const job of jobs) {
      const result = await processClaimedJob({
        job,
        workerName,
        leaseSeconds,
      });

      results.push(result);
    }

    return jsonResponse({
      success: true,
      worker: workerName,
      claimed: jobs.length,
      succeeded: results.filter(
        (result) => result.status === "succeeded",
      ).length,
      failed: results.filter(
        (result) => result.status === "failed",
      ).length,
      results,
    });
  } catch (error) {
    const message = errorMessage(error);

    console.error("worker-dispatcher failed", {
      worker: workerName,
      error: message,
    });

    return jsonResponse(
      {
        success: false,
        worker: workerName,
        error: message,
      },
      500,
    );
  }
});

async function claimJobs(input: {
  workerName: string;
  limit: number;
  leaseSeconds: number;
  jobTypes: string[] | null;
}): Promise<WorkerJob[]> {
  const { data, error } = await supabase.rpc(
    "claim_worker_jobs",
    {
      p_worker: input.workerName,
      p_limit: input.limit,
      p_job_types: input.jobTypes,
      p_lease_seconds: input.leaseSeconds,
    },
  );

  if (error) {
    throw new Error(
      `Unable to claim worker jobs: ${error.message}`,
    );
  }

  return Array.isArray(data)
    ? data as WorkerJob[]
    : [];
}

async function processClaimedJob(input: {
  job: WorkerJob;
  workerName: string;
  leaseSeconds: number;
}): Promise<JobResult> {
  const { job, workerName, leaseSeconds } = input;

  try {
    await heartbeatJob(
      job.id,
      workerName,
      leaseSeconds,
    );

    const handlerResult = await executeJob(job);

    await completeJob(job.id, {
      ...handlerResult,
      worker: workerName,
      completed_at: new Date().toISOString(),
    });

    console.log("Worker job completed", {
      job_id: job.id,
      job_type: job.job_type,
      worker: workerName,
    });

    return {
      job_id: job.id,
      job_type: job.job_type,
      status: "succeeded",
      result: handlerResult,
    };
  } catch (error) {
    const message = errorMessage(error);
    const retryable = isRetryableError(error);

    await failJob({
      job,
      message,
      retryable,
      workerName,
    });

    console.error("Worker job failed", {
      job_id: job.id,
      job_type: job.job_type,
      worker: workerName,
      retryable,
      error: message,
    });

    return {
      job_id: job.id,
      job_type: job.job_type,
      status: "failed",
      error: message,
    };
  }
}

async function executeJob(
  job: WorkerJob,
): Promise<Record<string, Json>> {
  switch (job.job_type) {
    case "health.check":
      return processHealthCheck(job);

    case "worker.noop":
      return processNoop(job);

    case "edge_function.invoke":
      return await invokeAllowedEdgeFunction(job);

    default:
      throw new NonRetryableJobError(
        `Unsupported worker job type: ${job.job_type}`,
      );
  }
}

function processHealthCheck(
  job: WorkerJob,
): Record<string, Json> {
  return {
    ok: true,
    job_id: job.id,
    checked_at: new Date().toISOString(),
    payload: job.payload ?? {},
  };
}

function processNoop(
  job: WorkerJob,
): Record<string, Json> {
  return {
    ok: true,
    job_id: job.id,
    message: "No-op job completed",
  };
}

async function invokeAllowedEdgeFunction(
  job: WorkerJob,
): Promise<Record<string, Json>> {
  const payload = job.payload ?? {};

  const functionName = typeof payload.function_name === "string"
    ? payload.function_name.trim()
    : "";

  if (!functionName) {
    throw new NonRetryableJobError(
      "edge_function.invoke requires payload.function_name",
    );
  }

  const allowedFunctions = getAllowedFunctions();

  if (!allowedFunctions.has(functionName)) {
    throw new NonRetryableJobError(
      `Edge Function is not allowed: ${functionName}`,
    );
  }

  const functionPayload = isPlainObject(payload.body)
    ? payload.body
    : {};

  const timeoutSeconds = normalizeInteger(
    payload.timeout_seconds,
    50,
    5,
    120,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutSeconds * 1000,
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${encodeURIComponent(functionName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization":
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "x-worker-secret": WORKER_INTERNAL_SECRET,
          "x-worker-job-id": job.id,
          "x-worker-job-type": job.job_type,
        },
        body: JSON.stringify({
          ...functionPayload,
          worker_job_id: job.id,
        }),
        signal: controller.signal,
      },
    );

    const responseText = await response.text();
    const responseBody = parseResponseBody(responseText);

    if (!response.ok) {
      const error = new Error(
        `Edge Function ${functionName} returned ${response.status}: ${
          stringifyForError(responseBody)
        }`,
      );

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      ) {
        throw new NonRetryableJobError(error.message);
      }

      throw error;
    }

    return {
      ok: true,
      invoked_function: functionName,
      response_status: response.status,
      response: toJson(responseBody),
    };
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `Edge Function ${functionName} timed out after ${timeoutSeconds} seconds`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function heartbeatJob(
  jobId: string,
  workerName: string,
  leaseSeconds: number,
): Promise<void> {
  const { error } = await supabase.rpc(
    "heartbeat_worker_job",
    {
      p_job_id: jobId,
      p_worker: workerName,
      p_lease_seconds: leaseSeconds,
    },
  );

  if (error) {
    throw new Error(
      `Unable to heartbeat job ${jobId}: ${error.message}`,
    );
  }
}

async function completeJob(
  jobId: string,
  result: Record<string, Json>,
): Promise<void> {
  const { error } = await supabase.rpc(
    "complete_worker_job",
    {
      p_job_id: jobId,
      p_result: result,
    },
  );

  if (error) {
    throw new Error(
      `Unable to complete job ${jobId}: ${error.message}`,
    );
  }
}

async function failJob(input: {
  job: WorkerJob;
  message: string;
  retryable: boolean;
  workerName: string;
}): Promise<void> {
  const backoffSeconds = calculateBackoffSeconds(
    input.job.attempt_count,
  );

  const { error } = await supabase.rpc(
    "fail_worker_job",
    {
      p_job_id: input.job.id,
      p_error: input.message,
      p_retryable: input.retryable,
      p_backoff_seconds: backoffSeconds,
      p_metadata: {
        worker: input.workerName,
        job_type: input.job.job_type,
        attempt_count: input.job.attempt_count,
        max_attempts: input.job.max_attempts,
        failed_at: new Date().toISOString(),
      },
    },
  );

  if (error) {
    console.error("Unable to record worker failure", {
      job_id: input.job.id,
      original_error: input.message,
      rpc_error: error.message,
    });
  }
}

function calculateBackoffSeconds(
  attemptCount: number,
): number {
  const exponent = Math.max(0, attemptCount - 1);
  const delay = DEFAULT_BACKOFF_SECONDS * 2 ** exponent;

  return Math.min(delay, 3600);
}

function getAllowedFunctions(): Set<string> {
  const configured = Deno.env.get(
    "WORKER_ALLOWED_FUNCTIONS",
  );

  if (!configured) {
    return new Set();
  }

  return new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAuthorized(request: Request): boolean {
  const suppliedSecret = request.headers.get(
    "x-worker-secret",
  );

  return secureCompare(
    suppliedSecret ?? "",
    WORKER_INTERNAL_SECRET,
  );
}

function secureCompare(
  left: string,
  right: string,
): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index++) {
    difference |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
  }

  return difference === 0;
}

function normalizeJobTypes(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const jobTypes = value
    .filter((item): item is string =>
      typeof item === "string"
    )
    .map((item) => item.trim())
    .filter(Boolean);

  return jobTypes.length > 0
    ? [...new Set(jobTypes)]
    : null;
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
    ? Number(value)
    : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(minimum, Math.trunc(parsed)),
  );
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    return isPlainObject(body)
      ? body
      : {};
  } catch {
    return {};
  }
}

function isPlainObject(
  value: unknown,
): value is Record<string, Json> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function parseResponseBody(
  value: string,
): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyForError(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 1000);
  }

  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return String(value).slice(0, 1000);
  }
}

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJson);
  }

  if (typeof value === "object") {
    const result: Record<string, Json> = {};

    for (
      const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )
    ) {
      result[key] = toJson(item);
    }

    return result;
  }

  return String(value);
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isRetryableError(error: unknown): boolean {
  return !(error instanceof NonRetryableJobError);
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}