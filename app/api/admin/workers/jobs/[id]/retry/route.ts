import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RetryRequestBody = {
  grant_attempt?: boolean;
  run_after?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as RetryRequestBody;
  const grantAttempt = body.grant_attempt === true;
  const runAfter = body.run_after ? new Date(body.run_after) : null;

  if (runAfter && Number.isNaN(runAfter.getTime())) {
    return NextResponse.json(
      { success: false, error: "run_after must be a valid ISO date-time" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("retry_worker_job", {
    p_job_id: id,
    p_run_after: runAfter?.toISOString() ?? new Date().toISOString(),
    p_grant_attempt: grantAttempt,
  });

  if (error) {
    const exhausted = error.message.includes("has exhausted its attempts");
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: exhausted ? "ATTEMPTS_EXHAUSTED" : "RETRY_FAILED",
        can_grant_attempt: exhausted,
      },
      { status: exhausted ? 409 : 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      job: data,
      granted_attempt: grantAttempt,
    },
    { status: 202 },
  );
}
