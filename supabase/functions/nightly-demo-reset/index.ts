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
  const started = new Date().toISOString();

  try {
    requireCronSecret(req);

    const { data: expired, error: expiredError } = await supabase
      .from("crm_demo_sessions")
      .select("id")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());
    if (expiredError) throw expiredError;

    const ids = (expired ?? []).map((row: { id: string }) => row.id);
    let failed = 0;

    for (const id of ids) {
      const { error } = await supabase.rpc("reset_demo_session", { p_demo_session_id: id });
      if (error) {
        failed += 1;
        console.warn("[nightly-demo-reset] reset failed", id, error.message);
      }
    }

    const status = failed ? "partial" : "success";
    const finished = new Date().toISOString();
    const recordsDeleted = { crm_demo_sessions: ids.length, reset_failures: failed };

    await supabase.from("crm_demo_reset_logs").insert({
      reset_type: "nightly_expired_sessions",
      status,
      sessions_deleted: ids.length - failed,
      records_deleted: recordsDeleted,
      started_at: started,
      finished_at: finished,
    });

    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-demo-reset",
      status,
      source: "cron",
      duration_ms: timer(),
      output_summary: { checked: ids.length, reset: ids.length - failed, failed },
    });

    return ok({ success: true, checked: ids.length, sessionsReset: ids.length - failed, failed });
  } catch (error) {
    const message = safeError(error);
    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-demo-reset",
      status: "error",
      source: "cron",
      duration_ms: timer(),
      error_message: message,
    });
    if (message.startsWith("FORBIDDEN:")) return forbidden(message.replace("FORBIDDEN: ", ""));
    return serverError("nightly-demo-reset failed", message);
  }
});
