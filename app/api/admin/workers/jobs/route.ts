import { after, NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  enqueueWorkerJob,
  type WorkerJobType,
} from "@/lib/workers/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CreateWorkerJobBody = {
  jobType?: WorkerJobType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

type DispatcherResult = {
  success?: boolean;
  worker?: string;
  claimed?: number;
  succeeded?: number;
  failed?: number;
  error?: string;
};

const DEFAULT_JOB_LIMIT = 1;
const DISPATCH_TIMEOUT_MS = 55_000;

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(
    ADMIN_PAGE_ACCESS.searchHealth,
  );

  if (auth.error) {
    return auth.error;
  }

  const status = request.nextUrl.searchParams.get("status");
  const requestedLimit = Number(
    request.nextUrl.searchParams.get("limit") || 50,
  );
  const limit = Math.max(
    1,
    Math.min(
      Number.isFinite(requestedLimit) ? requestedLimit : 50,
      100,
    ),
  );

  let query = supabaseAdmin
    .from("worker_jobs")
    .select(
      [
        "id",
        "job_type",
        "status",
        "priority",
        "attempt_count",
        "max_attempts",
        "progress_current",
        "progress_total",
        "last_error",
        "created_by_label",
        "created_at",
        "started_at",
        "updated_at",
        "completed_at",
        "run_after",
        "lease_owner",
        "lease_expires_at",
        "heartbeat_at",
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    jobs: data || [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(
    ADMIN_PAGE_ACCESS.import,
  );

  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => ({}))) as
    CreateWorkerJobBody;

  if (!body.jobType) {
    return NextResponse.json(
      {
        success: false,
        error: "jobType is required",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const job = await enqueueWorkerJob({
      jobType: body.jobType,
      payload: body.payload ?? {},
      idempotencyKey:
        body.idempotencyKey ??
        `${body.jobType}:manual:${crypto.randomUUID()}`,
      createdByLabel: "admin:workers",
    });

    const dispatcherConfiguration =
      getDispatcherConfiguration();

    if (!dispatcherConfiguration.ok) {
      console.error(
        "Worker job was queued, but the dispatcher could not be triggered",
        {
          job_id: job.id,
          job_type: body.jobType,
          error: dispatcherConfiguration.error,
        },
      );

      return NextResponse.json(
        {
          success: true,
          job,
          dispatcher_triggered: false,
          warning:
            "The job was queued, but the worker dispatcher is not configured. Add SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and WORKER_INTERNAL_SECRET to the server environment.",
        },
        {
          status: 202,
        },
      );
    }

    /*
     * Run the dispatcher after the HTTP response is committed.
     *
     * The previous implementation only inserted the worker_jobs row.
     * That left manually started jobs in QUEUED until an external cron
     * happened to invoke worker-dispatcher. `after()` keeps this work tied
     * to the request lifecycle without making the admin button wait for the
     * entire background job to finish.
     */
    after(async () => {
      try {
        const result = await triggerWorkerDispatcher({
          supabaseUrl: dispatcherConfiguration.supabaseUrl,
          workerSecret: dispatcherConfiguration.workerSecret,
          serviceRoleKey:
            dispatcherConfiguration.serviceRoleKey,
          jobType: body.jobType as WorkerJobType,
          workerName: `admin-run-now-${job.id}`,
        });

        console.info("Worker dispatcher triggered", {
          job_id: job.id,
          job_type: body.jobType,
          claimed: result.claimed ?? 0,
          succeeded: result.succeeded ?? 0,
          failed: result.failed ?? 0,
        });
      } catch (error) {
        console.error(
          "Unable to trigger worker dispatcher after enqueue",
          {
            job_id: job.id,
            job_type: body.jobType,
            error: errorMessage(error),
          },
        );
      }
    });

    return NextResponse.json(
      {
        success: true,
        job,
        dispatcher_triggered: true,
      },
      {
        status: 202,
      },
    );
  } catch (error) {
    console.error("Unable to enqueue worker job", {
      job_type: body.jobType,
      error: errorMessage(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}

function getDispatcherConfiguration():
  | {
      ok: true;
      supabaseUrl: string;
      workerSecret: string;
      serviceRoleKey: string | null;
    }
  | {
      ok: false;
      error: string;
    } {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  const workerSecret = (
    process.env.WORKER_INTERNAL_SECRET || ""
  ).trim();

  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  const missing: string[] = [];

  if (!supabaseUrl) {
    missing.push(
      "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
    );
  }

  if (!workerSecret) {
    missing.push("WORKER_INTERNAL_SECRET");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing server environment variable${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}`,
    };
  }

  return {
    ok: true,
    supabaseUrl,
    workerSecret,
    serviceRoleKey: serviceRoleKey || null,
  };
}

async function triggerWorkerDispatcher(input: {
  supabaseUrl: string;
  workerSecret: string;
  serviceRoleKey: string | null;
  jobType: WorkerJobType;
  workerName: string;
}): Promise<DispatcherResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DISPATCH_TIMEOUT_MS,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-worker-secret": input.workerSecret,
  };

  /*
   * Supabase projects can have Edge Function JWT verification enabled.
   * Include the service role credentials when available while retaining
   * x-worker-secret as the dispatcher's application-level authorization.
   */
  if (input.serviceRoleKey) {
    headers.apikey = input.serviceRoleKey;
    headers.Authorization =
      `Bearer ${input.serviceRoleKey}`;
  }

  try {
    const response = await fetch(
      `${input.supabaseUrl}/functions/v1/worker-dispatcher`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          limit: DEFAULT_JOB_LIMIT,
          lease_seconds: 120,
          job_types: [input.jobType],
          worker_name: input.workerName,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );

    const responseText = await response.text();
    const responseBody = parseJsonResponse(responseText);

    if (!response.ok) {
      throw new Error(
        `worker-dispatcher returned ${response.status}: ${
          readDispatcherError(responseBody)
        }`,
      );
    }

    if (
      isRecord(responseBody) &&
      responseBody.success === false
    ) {
      throw new Error(
        readDispatcherError(responseBody),
      );
    }

    return isRecord(responseBody)
      ? (responseBody as DispatcherResult)
      : {
          success: true,
        };
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `worker-dispatcher did not respond within ${
          Math.round(DISPATCH_TIMEOUT_MS / 1000)
        } seconds`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResponse(value: string): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      raw: value.slice(0, 1_000),
    };
  }
}

function readDispatcherError(value: unknown): string {
  if (
    isRecord(value) &&
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error.trim();
  }

  if (
    isRecord(value) &&
    typeof value.raw === "string" &&
    value.raw.trim()
  ) {
    return value.raw.trim();
  }

  return "Unknown dispatcher error";
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
