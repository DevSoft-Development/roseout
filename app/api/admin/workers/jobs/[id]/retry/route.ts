import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RetryBody = {
  grant_attempt?: unknown;
  run_after?: unknown;
};

type DbError = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const ATTEMPTS_EXHAUSTED_CODES = new Set(["ATTEMPTS_EXHAUSTED", "P0001"]);

async function parseRetryBody(request: Request): Promise<{ body?: RetryBody; response?: NextResponse }> {
  const text = await request.text();
  if (!text.trim()) return { body: {} };

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { response: NextResponse.json({ success: false, code: "INVALID_JSON" }, { status: 400 }) };
    }
    return { body: parsed as RetryBody };
  } catch {
    return { response: NextResponse.json({ success: false, code: "INVALID_JSON" }, { status: 400 }) };
  }
}

function parseRunAfter(value: unknown): { value?: string | null; response?: NextResponse } {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string") {
    return { response: NextResponse.json({ success: false, code: "INVALID_RUN_AFTER" }, { status: 400 }) };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { response: NextResponse.json({ success: false, code: "INVALID_RUN_AFTER" }, { status: 400 }) };
  }
  return { value: date.toISOString() };
}

function isAttemptsExhausted(error: DbError) {
  const code = String(error.code || "");
  const message = String(error.message || "");
  const details = String(error.details || "");
  return ATTEMPTS_EXHAUSTED_CODES.has(code) || /ATTEMPTS_EXHAUSTED|attempts exhausted|used all allowed attempts/i.test(`${message} ${details}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsed = await parseRetryBody(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body ?? {};

  if (body.grant_attempt !== undefined && typeof body.grant_attempt !== "boolean") {
    return NextResponse.json({ success: false, code: "INVALID_GRANT_ATTEMPT" }, { status: 400 });
  }

  const runAfter = parseRunAfter(body.run_after);
  if (runAfter.response) return runAfter.response;

  const { data, error } = await supabaseAdmin.rpc("retry_worker_job", {
    p_job_id: id,
    p_grant_attempt: body.grant_attempt ?? false,
    p_run_after: runAfter.value,
  });

  if (error) {
    if (isAttemptsExhausted(error)) {
      return NextResponse.json(
        { success: false, code: "ATTEMPTS_EXHAUSTED", can_grant_attempt: true, error: error.message || "Worker job attempts are exhausted." },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: false, code: "RETRY_FAILED", error: error.message || "Unable to retry worker job." }, { status: 500 });
  }

  return NextResponse.json({ success: true, job: data }, { status: 202 });
}
