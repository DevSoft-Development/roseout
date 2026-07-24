import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RetryBody = {
  grant_attempt?: boolean;
  run_after?: string | null;
};

function isAttemptsExhausted(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("exhausted") && normalized.includes("attempt");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (auth.error) return auth.error;

  const { id } = await params;
  let body: RetryBody = {};

  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as RetryBody) : {};
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_JSON", error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (body.grant_attempt !== undefined && typeof body.grant_attempt !== "boolean") {
    return NextResponse.json(
      { success: false, code: "INVALID_GRANT_ATTEMPT", error: "grant_attempt must be a boolean." },
      { status: 400 },
    );
  }

  let runAfter: string | null = null;
  if (body.run_after !== undefined && body.run_after !== null) {
    if (typeof body.run_after !== "string" || Number.isNaN(Date.parse(body.run_after))) {
      return NextResponse.json(
        { success: false, code: "INVALID_RUN_AFTER", error: "run_after must be a valid ISO date-time." },
        { status: 400 },
      );
    }
    runAfter = new Date(body.run_after).toISOString();
  }

  const { data, error } = await supabaseAdmin.rpc("retry_worker_job", {
    p_job_id: id,
    p_run_after: runAfter,
    p_grant_attempt: body.grant_attempt === true,
  });

  if (error) {
    if (isAttemptsExhausted(error.message)) {
      return NextResponse.json(
        {
          success: false,
          code: "ATTEMPTS_EXHAUSTED",
          error: error.message,
          can_grant_attempt: true,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, code: "RETRY_FAILED", error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      job: data,
      granted_attempt: body.grant_attempt === true,
      run_after: runAfter,
    },
    { status: 202 },
  );
}
