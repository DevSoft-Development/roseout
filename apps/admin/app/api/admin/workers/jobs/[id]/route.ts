import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_JOB_FIELDS = "id,job_type,status,payload_version,idempotency_key,priority,attempt_count,max_attempts,progress_current,progress_total,run_after,lease_owner,lease_expires_at,heartbeat_at,parent_job_id,created_by_label,created_by,last_error,cancellation_requested_at,created_at,updated_at,started_at,completed_at";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("worker_jobs").select(WORKER_JOB_FIELDS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, job: data });
}
