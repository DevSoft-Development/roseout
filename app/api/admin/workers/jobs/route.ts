import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enqueueWorkerJob, type WorkerJobType } from "@/lib/workers/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const status = request.nextUrl.searchParams.get("status");
  const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") || 50), 100));
  let query = supabaseAdmin.from("worker_jobs").select("id,job_type,status,priority,attempt_count,max_attempts,progress_current,progress_total,last_error,created_by_label,created_at,started_at,updated_at,completed_at").order("created_at", { ascending: false }).limit(limit);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, jobs: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { jobType?: WorkerJobType; payload?: Record<string, unknown>; idempotencyKey?: string };
  if (!body.jobType) return NextResponse.json({ success: false, error: "jobType is required" }, { status: 400 });
  const job = await enqueueWorkerJob({ jobType: body.jobType, payload: body.payload ?? {}, idempotencyKey: body.idempotencyKey ?? `${body.jobType}:manual:${crypto.randomUUID()}`, createdByLabel: "admin:workers" });
  return NextResponse.json({ success: true, job }, { status: 202 });
}
