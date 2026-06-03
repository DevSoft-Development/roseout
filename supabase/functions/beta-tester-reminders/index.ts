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
  const functionName = "beta-tester-reminders";
  let supabase: any = null;

  try {
    supabase = createSupabaseAdminClient();
    const auth = await requireAdminOrCron(req, supabase);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => ({}));
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://theouthaven.com";
    const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);

    let testers: any[] = [];
    let tableUsed = "beta_testers";
    const result = await supabase.from("beta_testers").select("id,email,name,status").eq("status", "active").limit(limit);
    if (result.error) {
      tableUsed = "beta_applications";
      const fallback = await supabase.from("beta_applications").select("id,email,name,status").in("status", ["approved", "active"]).limit(limit);
      testers = fallback.data ?? [];
    } else testers = result.data ?? [];

    let sent = 0, skipped = 0, failed = 0;
    for (const tester of testers) {
      if (!tester.email) { skipped++; continue; }
      const email = await sendEmail({
        to: tester.email,
        subject: "TheOutHaven beta test reminder",
        text: `Please test TheOutHaven today: ${siteUrl}/create, ${siteUrl}/explore, and ${siteUrl}/feedback. Try a custom prompt and report anything confusing.`,
        html: `<p>Please test TheOutHaven today.</p><ul><li><a href="${siteUrl}/create">/create</a></li><li><a href="${siteUrl}/explore">/explore</a></li><li><a href="${siteUrl}/feedback">/feedback</a></li></ul><p>Try a custom prompt and report anything confusing.</p>`,
      });
      if (email.sent) sent++; else if (email.skipped) skipped++; else failed++;
    }

    const summary = { tableUsed, checked: testers.length, sent, skipped, failed };
    await supabase.from("cron_job_runs").insert({ job_name: functionName, status: failed ? "partial" : "success", checked_count: testers.length, success_count: sent, skipped_count: skipped, failed_count: failed, finished_at: new Date().toISOString(), duration_ms: elapsed(), metadata: summary });
    await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: elapsed(), output_summary: summary });
    return ok({ success: true, ...summary });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: functionName, status: "error", duration_ms: elapsed(), error_message: safeError(error).message });
    return serverError("beta-tester-reminders failed", safeError(error));
  }
});
