import { handleOptions } from "../_shared/cors.ts";
import { forbidden, ok, serverError } from "../_shared/response.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const timer = startTimer();
  const supabase = createSupabaseAdminClient();

  try {
    requireCronSecret(req);

    const body = await req.json().catch(() => ({}));
    const maxOpenHours = Math.min(Math.max(Number(body.maxOpenHours ?? 12), 1), 48);
    const threshold = new Date(Date.now() - maxOpenHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("team_work_sessions")
      .update({
        status: "needs_correction",
        approval_status: "needs_correction",
        admin_notes: `Session was open longer than ${maxOpenHours} hours.`,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "active")
      .lt("clock_in_at", threshold)
      .select("id");
    if (error) throw error;

    const sessionsFlagged = data?.length ?? 0;
    await logEdgeFunctionRun(supabase, {
      function_name: "team-session-watchdog",
      status: "success",
      source: "cron",
      duration_ms: timer(),
      output_summary: { sessionsFlagged, maxOpenHours },
    });

    return ok({
      success: true,
      sessionsFlagged,
      maxOpenHours,
      note: "Support ticket sessions are not flagged for missing proof or location.",
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
    if (message.startsWith("FORBIDDEN:")) return forbidden(message.replace("FORBIDDEN: ", ""));
    return serverError("team-session-watchdog failed", message);
  }
});
