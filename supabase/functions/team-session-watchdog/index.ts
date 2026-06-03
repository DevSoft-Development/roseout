import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError, unauthorized } from "../_shared/response.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const MAX_OPEN_HOURS = 12;
const WATCHDOG_NOTE = "Session was open longer than 12 hours and needs admin correction.";

type SessionRow = { id: string; admin_notes: string | null };

function appendAdminNote(existing: string | null): string {
  if (!existing) return WATCHDOG_NOTE;
  if (existing.includes(WATCHDOG_NOTE)) return existing;
  return `${existing}\n${WATCHDOG_NOTE}`;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return ok({ success: false, message: "POST is required." }, { status: 405 });

  const timer = startTimer();
  const supabase = createSupabaseAdminClient();

  try {
    requireCronSecret(req);

    const threshold = new Date(Date.now() - MAX_OPEN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: sessions, error: selectError } = await supabase
      .from("team_work_sessions")
      .select("id, admin_notes")
      .eq("status", "active")
      .lt("clock_in_at", threshold);
    if (selectError) throw selectError;

    const rows = (sessions ?? []) as SessionRow[];
    let flagged = 0;

    for (const session of rows) {
      const { error } = await supabase
        .from("team_work_sessions")
        .update({
          status: "needs_correction",
          approval_status: "needs_correction",
          admin_notes: appendAdminNote(session.admin_notes),
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      if (error) throw error;
      flagged += 1;
    }

    await logEdgeFunctionRun(supabase, {
      function_name: "team-session-watchdog",
      status: "success",
      source: "cron",
      duration_ms: timer(),
      output_summary: { checked: rows.length, flagged },
    });

    return ok({
      success: true,
      checked: rows.length,
      flagged,
      note: "Clock-in/out is time-only. This watchdog does not require GPS and does not check support tickets for proof pictures.",
    });
  } catch (error) {
    const message = safeError(error);
    await logEdgeFunctionRun(supabase, {
      function_name: "team-session-watchdog",
      status: "error",
      source: "cron",
      duration_ms: timer(),
      error_message: message,
    });
    if (message.startsWith("FORBIDDEN:")) return unauthorized(message.replace("FORBIDDEN: ", ""));
    return serverError("team-session-watchdog failed", message);
  }
});
