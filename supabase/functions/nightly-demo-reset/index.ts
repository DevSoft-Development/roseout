import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError, unauthorized } from "../_shared/response.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const DEMO_TABLES = [
  "team_proofs",
  "ambassador_social_outreach",
  "ambassador_site_visits",
  "team_follow_ups",
  "team_work_activities",
  "team_work_sessions",
  "crm_demo_session_locations",
] as const;

type ResetError = { sessionId: string; table: string; message: string };
type DeletedCounts = Record<(typeof DEMO_TABLES)[number], number>;

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("does not exist");
}

function emptyDeletedCounts(): DeletedCounts {
  return Object.fromEntries(DEMO_TABLES.map((table) => [table, 0])) as DeletedCounts;
}

async function safeDeleteByDemoSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: (typeof DEMO_TABLES)[number],
  demoSessionId: string,
): Promise<{ deleted: number; error?: ResetError }> {
  let query = supabase.from(table).delete({ count: "exact" }).eq("demo_session_id", demoSessionId);
  if (table === "team_work_sessions") {
    query = query.eq("is_demo", true);
  }

  const { count, error } = await query;
  if (!error) return { deleted: count ?? 0 };
  if (isMissingTableError(error)) return { deleted: 0 };
  return { deleted: 0, error: { sessionId: demoSessionId, table, message: error.message } };
}

async function insertResetLogIfPresent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("crm_demo_reset_logs").insert(values);
  if (error && !isMissingTableError(error)) throw error;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return ok({ success: false, message: "POST is required." }, { status: 405 });

  const timer = startTimer();
  const supabase = createSupabaseAdminClient();
  const started = new Date().toISOString();
  const errors: ResetError[] = [];
  const deletedCounts = emptyDeletedCounts();

  try {
    requireCronSecret(req);

    const { data: expired, error: expiredError } = await supabase
      .from("crm_demo_sessions")
      .select("id")
      .eq("status", "active")
      .lte("expires_at", new Date().toISOString());
    if (expiredError) throw expiredError;

    const sessionIds = (expired ?? []).map((row: { id: string }) => row.id);
    let sessionsReset = 0;

    for (const sessionId of sessionIds) {
      for (const table of DEMO_TABLES) {
        const result = await safeDeleteByDemoSession(supabase, table, sessionId);
        deletedCounts[table] += result.deleted;
        if (result.error) errors.push(result.error);
      }

      const { error: updateError } = await supabase
        .from("crm_demo_sessions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (updateError) {
        errors.push({ sessionId, table: "crm_demo_sessions", message: updateError.message });
      } else {
        sessionsReset += 1;
      }
    }

    const status = errors.length ? "partial" : "success";
    await insertResetLogIfPresent(supabase, {
      reset_type: "nightly_expired_sessions",
      status,
      sessions_deleted: sessionsReset,
      records_deleted: deletedCounts,
      error_message: errors.length ? JSON.stringify(errors) : null,
      started_at: started,
      finished_at: new Date().toISOString(),
    });

    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-demo-reset",
      status,
      source: "cron",
      duration_ms: timer(),
      output_summary: { sessionsFound: sessionIds.length, sessionsReset, errors: errors.length, deletedCounts },
    });

    return ok({
      success: errors.length === 0,
      sessionsFound: sessionIds.length,
      sessionsReset,
      errors,
      deletedCounts,
      safety: "Only demo/session-scoped tables were touched; public.locations and public.crm_demo_locations were not deleted.",
    });
  } catch (error) {
    const message = safeError(error);
    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-demo-reset",
      status: "error",
      source: "cron",
      duration_ms: timer(),
      error_message: message,
    });
    if (message.startsWith("FORBIDDEN:")) return unauthorized(message.replace("FORBIDDEN: ", ""));
    return serverError("nightly-demo-reset failed", message);
  }
});
