import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonObject = Record<string, Json>;

type WorkerJob = {
  id: string;
  job_type: string;
  status: string;
  payload: JsonObject | null;
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
  result?: JsonObject;
  error?: string;
};

type EdgeFunctionResponse = {
  status: number;
  body: unknown;
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

const DEFAULT_JOB_LIMIT = 25;
const MAX_JOB_LIMIT = 100;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_BACKOFF_SECONDS = 60;
const DEFAULT_EDGE_TIMEOUT_SECONDS = 50;
const MAX_EDGE_TIMEOUT_SECONDS = 120;

const OPERATIONS_WORKER_JOB_TYPES = new Set<string>([
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
  "photo.backfill": "nightly-photo-backfill",
  "enrichment.google_photos": "nightly-photo-backfill",
  "nightly-photo-backfill": "nightly-photo-backfill",
  "enrichment.google_metadata": "google-location-enrichment",
  "search.qa.batch": "admin-search-health-digest",
  "notification.email_deliver": "notification-worker",
  "notification.sms_deliver": "notification-worker",
  "notification.deliver": "notification-worker",
  "reservation.cleanup": "reservation-status-cleanup",
};

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
      results.push(
        await processClaimedJob({
          job,
          workerName,
          leaseSeconds,
        }),
      );
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
      registered_job_types: registeredJobTypes(),
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
  const {
    job,
    workerName,
    leaseSeconds,
  } = input;

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
      error,
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
): Promise<JsonObject> {
  switch (job.job_type) {
    case "health.check":
      return processHealthCheck(job);

    case "worker.noop":
      return processNoop(job);

    case "edge_function.invoke":
      return await invokeAllowedEdgeFunction(job);

    default:
      break;
  }

  if (
    OPERATIONS_WORKER_JOB_TYPES.has(
      job.job_type,
    )
  ) {
    return await invokeOperationsWorker(job);
  }

  const mappedFunction =
    EDGE_FUNCTION_BY_JOB_TYPE[job.job_type];

  if (mappedFunction) {
    return await invokeRegisteredEdgeFunction(
      mappedFunction,
      job,
    );
  }

  throw new UnsupportedWorkerJobTypeError(
    `Unsupported worker job type: ${job.job_type}`,
    job.job_type,
  );
}

function processHealthCheck(
  job: WorkerJob,
): JsonObject {
  return {
    ok: true,
    job_id: job.id,
    checked_at: new Date().toISOString(),
    payload: job.payload ?? {},
    registered_job_types: registeredJobTypes(),
  };
}

function processNoop(
  job: WorkerJob,
): JsonObject {
  return {
    ok: true,
    job_id: job.id,
    message: "No-op job completed",
  };
}

async function invokeOperationsWorker(
  job: WorkerJob,
): Promise<JsonObject> {
  const payload = normalizeWorkerPayload(
    job.payload ?? {},
    job.job_type,
  );

  const response = await invokeWorkerEdgeFunction({
    functionName: "operations-worker",
    job,
    body: {
      job_type: job.job_type,
      payload,
      worker_job_id: job.id,
    },
  });

  return {
    ok: true,
    canonical_job_type: job.job_type,
    invoked_function: "operations-worker",
    response_status: response.status,
    response: selectBoundedResultMetadata(
      response.body,
    ),
  };
}

async function invokeRegisteredEdgeFunction(
  functionName: string,
  job: WorkerJob,
): Promise<JsonObject> {
  const isPhotoBackfill =
    functionName === "nightly-photo-backfill";

  const payload = isPhotoBackfill
    ? normalizePhotoBackfillPayload(
      job.payload ?? {},
    )
    : normalizeWorkerPayload(
      job.payload ?? {},
      job.job_type,
    );

  const canonicalJobType = isPhotoBackfill
    ? "photo.backfill"
    : job.job_type;

  const response = await invokeWorkerEdgeFunction({
    functionName,
    job,
    body: {
      ...payload,
      worker_job_id: job.id,
      worker_job_type: canonicalJobType,
    },
  });

  return {
    ok: true,
    canonical_job_type: canonicalJobType,
    invoked_function: functionName,
    response_status: response.status,
    response: isPhotoBackfill
      ? selectPhotoBackfillResultMetadata(
        response.body,
      )
      : selectBoundedResultMetadata(
        response.body,
      ),
  };
}

async function invokeAllowedEdgeFunction(
  job: WorkerJob,
): Promise<JsonObject> {
  const payload = job.payload ?? {};

  const functionName =
    typeof payload.function_name === "string"
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

  const functionPayload = isPlainObject(
    payload.body,
  )
    ? payload.body
    : {};

  const timeoutSeconds = normalizeInteger(
    payload.timeout_seconds,
    DEFAULT_EDGE_TIMEOUT_SECONDS,
    5,
    MAX_EDGE_TIMEOUT_SECONDS,
  );

  const response = await invokeWorkerEdgeFunction({
    functionName,
    job,
    body: {
      ...functionPayload,
      worker_job_id: job.id,
    },
    timeoutSeconds,
  });

  return {
    ok: true,
    invoked_function: functionName,
    response_status: response.status,
    response: toBoundedJson(response.body),
  };
}

async function invokeWorkerEdgeFunction(input: {
  functionName: string;
  job: WorkerJob;
  body: JsonObject;
  timeoutSeconds?: number;
}): Promise<EdgeFunctionResponse> {
  const timeoutSeconds = normalizeInteger(
    input.timeoutSeconds,
    DEFAULT_EDGE_TIMEOUT_SECONDS,
    5,
    MAX_EDGE_TIMEOUT_SECONDS,
  );

  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutSeconds * 1000,
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${
        encodeURIComponent(input.functionName)
      }`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "x-worker-secret":
            WORKER_INTERNAL_SECRET,
          "x-worker-job-id": input.job.id,
          "x-worker-job-type":
            input.job.job_type,
        },
        body: JSON.stringify(input.body),
        signal: controller.signal,
      },
    );

    const responseText =
      await response.text();

    const responseBody =
      parseResponseBody(responseText);

    if (
      !response.ok ||
      (
        isPlainObject(responseBody) &&
        responseBody.success === false
      )
    ) {
      const detail =
        isPlainObject(responseBody) &&
          typeof responseBody.error === "string"
          ? responseBody.error
          : stringifyForError(responseBody);

      const message =
        `Edge Function ${input.functionName} returned ${response.status}: ${detail}`;

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      ) {
        throw new NonRetryableJobError(
          message,
        );
      }

      throw new Error(message);
    }

    return {
      status: response.status,
      body: responseBody,
    };
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `Edge Function ${input.functionName} timed out after ${timeoutSeconds} seconds`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizePhotoBackfillPayload(
  payload: JsonObject,
): JsonObject {
  const normalized: JsonObject = {};

  copyOptionalString(
    payload,
    normalized,
    "source",
    100,
    "photo.backfill",
  );

  copyOptionalString(
    payload,
    normalized,
    "cursor",
    500,
    "photo.backfill",
  );

  copyOptionalString(
    payload,
    normalized,
    "location_id",
    100,
    "photo.backfill",
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "dry_run",
    "dry_run",
    "photo.backfill",
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "dryRun",
    "dry_run",
    "photo.backfill",
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "force",
    "force",
    "photo.backfill",
  );

  copyOptionalInteger(
    payload,
    normalized,
    "batch_size",
    1,
    1000,
    "batch_size",
    "photo.backfill",
  );

  copyOptionalInteger(
    payload,
    normalized,
    "batchSize",
    1,
    1000,
    "batch_size",
    "photo.backfill",
  );

  copyOptionalInteger(
    payload,
    normalized,
    "limit",
    1,
    1000,
    "limit",
    "photo.backfill",
  );

  return normalized;
}

function normalizeWorkerPayload(
  payload: JsonObject,
  jobType: string,
): JsonObject {
  const normalized: JsonObject = {};

  copyOptionalString(
    payload,
    normalized,
    "source",
    100,
    jobType,
  );

  copyOptionalString(
    payload,
    normalized,
    "cursor",
    500,
    jobType,
  );

  copyOptionalString(
    payload,
    normalized,
    "location_id",
    100,
    jobType,
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "dry_run",
    "dry_run",
    jobType,
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "dryRun",
    "dry_run",
    jobType,
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "force",
    "force",
    jobType,
  );

  copyOptionalBoolean(
    payload,
    normalized,
    "only_missing",
    "only_missing",
    jobType,
  );

  copyOptionalInteger(
    payload,
    normalized,
    "limit",
    1,
    100,
    "limit",
    jobType,
  );

  copyOptionalInteger(
    payload,
    normalized,
    "batch_size",
    1,
    100,
    "batch_size",
    jobType,
  );

  copyOptionalInteger(
    payload,
    normalized,
    "batchSize",
    1,
    100,
    "batch_size",
    jobType,
  );

  return normalized;
}

function copyOptionalString(
  input: JsonObject,
  output: JsonObject,
  key: string,
  maximumLength: number,
  jobType: string,
  outputKey = key,
): void {
  const value = input[key];

  if (
    value === undefined ||
    value === null
  ) {
    return;
  }

  if (typeof value !== "string") {
    throw new NonRetryableJobError(
      `${jobType} payload.${key} must be a string`,
    );
  }

  const trimmed = value.trim();

  if (trimmed) {
    output[outputKey] =
      trimmed.slice(0, maximumLength);
  }
}

function copyOptionalBoolean(
  input: JsonObject,
  output: JsonObject,
  key: string,
  outputKey: string,
  jobType: string,
): void {
  const value = input[key];

  if (
    value === undefined ||
    value === null
  ) {
    return;
  }

  if (typeof value !== "boolean") {
    throw new NonRetryableJobError(
      `${jobType} payload.${key} must be a boolean`,
    );
  }

  output[outputKey] = value;
}

function copyOptionalInteger(
  input: JsonObject,
  output: JsonObject,
  key: string,
  minimum: number,
  maximum: number,
  outputKey: string,
  jobType: string,
): void {
  const value = input[key];

  if (
    value === undefined ||
    value === null
  ) {
    return;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new NonRetryableJobError(
      `${jobType} payload.${key} must be an integer from ${minimum} to ${maximum}`,
    );
  }

  output[outputKey] = parsed;
}

function selectPhotoBackfillResultMetadata(
  value: unknown,
): Json {
  return selectAllowedResultMetadata(
    value,
    [
      "success",
      "scanned",
      "updated",
      "skipped",
      "failed",
      "duration",
      "duration_ms",
      "cursor",
      "next_cursor",
      "remaining",
      "dry_run",
      "message",
    ],
  );
}

function selectBoundedResultMetadata(
  value: unknown,
): Json {
  return selectAllowedResultMetadata(
    value,
    [
      "success",
      "job_type",
      "dry_run",
      "scanned",
      "candidates",
      "generated",
      "updated",
      "skipped",
      "failed",
      "flagged",
      "candidate_groups",
      "persisted",
      "remaining",
      "remaining_hint",
      "cursor",
      "next_cursor",
      "duration",
      "duration_ms",
      "average_runtime_ms",
      "window_hours",
      "message",
    ],
  );
}

function selectAllowedResultMetadata(
  value: unknown,
  allowedKeys: string[],
): Json {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return toBoundedJson(value);
  }

  const source =
    value as Record<string, unknown>;

  const result: JsonObject = {};

  for (const key of allowedKeys) {
    if (source[key] !== undefined) {
      result[key] =
        toBoundedJson(source[key]);
    }
  }

  return result;
}

function toBoundedJson(
  value: unknown,
): Json {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, 1000);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map(toBoundedJson);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const result: JsonObject = {};

    for (
      const [key, item] of
        Object.entries(
          value as Record<string, unknown>,
        ).slice(0, 25)
    ) {
      result[key] = isSensitiveKey(key)
        ? "[REDACTED]"
        : toBoundedJson(item);
    }

    return result;
  }

  return String(value).slice(0, 1000);
}

function isSensitiveKey(
  key: string,
): boolean {
  return [
    "token",
    "secret",
    "password",
    "authorization",
    "api_key",
    "apikey",
    "service_role_key",
    "openai_api_key",
  ].includes(key.toLowerCase());
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
  result: JsonObject,
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
  error?: unknown;
}): Promise<void> {
  const backoffSeconds =
    calculateBackoffSeconds(
      input.job.attempt_count,
    );

  const { error } = await supabase.rpc(
    "fail_worker_job",
    {
      p_job_id: input.job.id,
      p_error: input.message,
      p_retryable: input.retryable,
      p_backoff_seconds:
        backoffSeconds,
      p_metadata:
        failureMetadata(input),
    },
  );

  if (error) {
    console.error(
      "Unable to record worker failure",
      {
        job_id: input.job.id,
        original_error:
          input.message,
        rpc_error: error.message,
      },
    );
  }
}

function failureMetadata(input: {
  job: WorkerJob;
  workerName: string;
  error?: unknown;
}): JsonObject {
  const metadata: JsonObject = {
    worker: input.workerName,
    job_type: input.job.job_type,
    attempt_count:
      input.job.attempt_count,
    max_attempts:
      input.job.max_attempts,
    failed_at:
      new Date().toISOString(),
  };

  if (
    input.error instanceof
      UnsupportedWorkerJobTypeError
  ) {
    metadata.code =
      "UNSUPPORTED_WORKER_JOB_TYPE";

    metadata.dispatcher =
      "production-cron-dispatcher";

    metadata.registered_job_types =
      registeredJobTypes();
  }

  return metadata;
}

function registeredJobTypes(): string[] {
  return [
    "health.check",
    "worker.noop",
    "edge_function.invoke",
    ...OPERATIONS_WORKER_JOB_TYPES,
    ...Object.keys(
      EDGE_FUNCTION_BY_JOB_TYPE,
    ),
  ]
    .filter(
      (
        value,
        index,
        values,
      ) => values.indexOf(value) === index,
    )
    .sort();
}

function calculateBackoffSeconds(
  attemptCount: number,
): number {
  const exponent = Math.max(
    0,
    attemptCount - 1,
  );

  return Math.min(
    DEFAULT_BACKOFF_SECONDS *
      2 ** exponent,
    3600,
  );
}

function getAllowedFunctions():
  Set<string> {
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

function isAuthorized(
  request: Request,
): boolean {
  return secureCompare(
    request.headers.get(
      "x-worker-secret",
    ) ?? "",
    WORKER_INTERNAL_SECRET,
  );
}

function secureCompare(
  left: string,
  right: string,
): boolean {
  if (
    !left ||
    !right ||
    left.length !== right.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < left.length;
    index++
  ) {
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
    .filter(
      (item): item is string =>
        typeof item === "string",
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
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.trunc(parsed),
    ),
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
): value is JsonObject {
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

function stringifyForError(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value.slice(0, 1000);
  }

  try {
    return JSON.stringify(value)
      .slice(0, 1000);
  } catch {
    return String(value)
      .slice(0, 1000);
  }
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
        "Content-Type":
          "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function isRetryableError(
  error: unknown,
): boolean {
  return !(
    error instanceof
      NonRetryableJobError
  );
}

function requireEnv(
  name: string,
): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

class NonRetryableJobError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "NonRetryableJobError";
  }
}

class UnsupportedWorkerJobTypeError
  extends NonRetryableJobError {
  readonly jobType: string;

  constructor(
    message: string,
    jobType: string,
  ) {
    super(message);

    this.name =
      "UnsupportedWorkerJobTypeError";

    this.jobType = jobType;
  }
}
