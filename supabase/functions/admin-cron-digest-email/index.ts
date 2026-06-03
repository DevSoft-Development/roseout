import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const elapsed = startTimer();
  const functionName = "admin-cron-digest-email";
  let supabase: any = null;

  try {
    supabase = createSupabaseAdminClient();
    const auth = await requireAdminOrCron(req, supabase);
    if (auth.response) return auth.response;
    const body = await req.json().catch(() => ({}));
    const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const [edgeLogs, cronRuns] = await Promise.all([
      supabase.from("edge_function_logs").select("function_name,status,error_message,duration_ms,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(250),
      supabase.from("cron_job_runs").select("job_name,status,checked_count,success_count,skipped_count,failed_count,error_message,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(250),
    ]);

    const logs = edgeLogs.data ?? [];
    const jobs = cronRuns.data ?? [];
    const failures = [...logs, ...jobs].filter((row: any) => !["success", "skipped"].includes(String(row.status ?? "")));
    const digest = {
      hours,
      edgeLogCount: logs.length,
      cronRunCount: jobs.length,
      successCount: [...logs, ...jobs].filter((row: any) => row.status === "success").length,
      skippedCount: [...logs, ...jobs].filter((row: any) => row.status === "skipped").length,
      failedCount: failures.length,
      topErrors: failures.slice(0, 10).map((row: any) => row.error_message).filter(Boolean),
    };

    let emailResult: any = { sent: false, skipped: true, reason: "sendEmail=false" };
    if (body.sendEmail !== false) {
      emailResult = await sendEmail({
        to: Deno.env.get("ADMIN_EMAIL") ?? "",
        subject: "TheOutHaven cron/import digest",
        text: JSON.stringify(digest, null, 2),
        html: `<h2>TheOutHaven cron/import digest</h2><pre>${JSON.stringify(digest, null, 2)}</pre>`,
      });
    }

    await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), output_summary: { digest, emailResult } });
    return ok({ success: true, digest, email: emailResult });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: functionName, status: "error", duration_ms: elapsed(), error_message: safeError(error).message });
    return serverError("admin-cron-digest-email failed", safeError(error));
  }
});
