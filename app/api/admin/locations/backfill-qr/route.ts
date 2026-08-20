import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const JOB_TYPE = "claim.qr_repair";

async function isAllowed(req: Request) {
  const secret =
    req.headers.get("x-internal-import-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && (secret === process.env.IMPORT_SECRET || secret === process.env.CRON_SECRET)) {
    return true;
  }

  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.import);
    return true;
  } catch {
    return false;
  }
}

function serializeJob(job: Record<string, unknown>) {
  return {
    id: job.id,
    status: job.status,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    progressCurrent: job.progress_current,
    progressTotal: job.progress_total,
    checkpoint: job.checkpoint || {},
    result: job.result || {},
    lastError: job.last_error,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at,
  };
}

export async function GET(req: Request) {
  if (!(await isAllowed(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing repair job id." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("worker_jobs")
    .select(
      "id,status,attempt_count,max_attempts,progress_current,progress_total,checkpoint,result,last_error,created_at,updated_at,completed_at",
    )
    .eq("id", jobId)
    .eq("job_type", JOB_TYPE)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Repair job not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job: serializeJob(data) });
}

export async function POST(req: Request) {
  if (!(await isAllowed(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: activeJob } = await supabaseAdmin
    .from("worker_jobs")
    .select(
      "id,status,attempt_count,max_attempts,progress_current,progress_total,checkpoint,result,last_error,created_at,updated_at,completed_at",
    )
    .eq("job_type", JOB_TYPE)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeJob) {
    return NextResponse.json({ ok: true, reused: true, job: serializeJob(activeJob) });
  }

  const { data, error } = await supabaseAdmin.rpc("enqueue_worker_job", {
    p_job_type: JOB_TYPE,
    p_payload: {
      batch_size: 25,
      source: "admin_claim_qr_maintenance",
    },
    p_payload_version: 1,
    p_idempotency_key: null,
    p_priority: 20,
    p_max_attempts: 200,
    p_run_after: new Date().toISOString(),
    p_parent_job_id: null,
    p_created_by_label: "admin.claim-qrs",
    p_created_by: null,
  });

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to queue claim QR repair." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reused: false, job: serializeJob(data) });
}
