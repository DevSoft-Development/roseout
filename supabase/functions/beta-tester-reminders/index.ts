import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";

async function firstExisting(supabase: any) {
  for (const table of ["beta_testers", "beta_applications", "beta_assignments"]) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(200);
      if (!error && data) return { table, rows: data };
    } catch {
      // Try the next possible beta table.
    }
  }
  return { table: null, rows: [] };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const timer = startTimer();
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  let source = "unknown";

  try {
    const auth = await requireAdminOrCron(req, supabase);
    source = auth.source;
    const found = await firstExisting(supabase);

    if (!found.table) {
      await logCronJobRun(supabase, {
        job_name: "beta-tester-reminders",
        function_name: "beta-tester-reminders", route_path: "supabase/functions/beta-tester-reminders", description: "Sends beta testing reminder emails.", schedule_hint: "Edge Function / scheduled",
        source,
        status: "skipped",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: timer(),
        checked_count: 0,
        success_count: 0,
        skipped_count: 0,
        failed_count: 0,
        metadata: { reason: "No beta tester table found" },
      });
      return ok({ success: true, skipped: true, reason: "No beta tester table found", sent: 0, failed: 0 });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of found.rows) {
      const email = row.email || row.user_email || row.tester_email;
      const active = row.active !== undefined ? row.active : row.status ? row.status === "active" : true;
      if (!email || active === false) {
        skipped++;
        continue;
      }

      const html = `<h1>Keep testing TheOutHaven</h1><p>Please test at least 5 times this week.</p><ul><li><a href="/create">/create</a>: custom prompts, speed, restaurant + activity pairing</li><li><a href="/explore">/explore</a>: browse flows</li><li><a href="/feedback">/feedback</a>: report bugs</li><li><a href="/admin/dashboard/beta/search-lab">admin/beta/testing route</a></li></ul>`;
      try {
        const result: any = await sendEmail({
          to: email,
          subject: "TheOutHaven beta testing reminder",
          html,
          text: "Please test custom prompts, search speed, restaurant + activity pairing, and report bugs. Links: /create /explore /feedback /admin/dashboard/beta/search-lab",
        });
        if (result.sent) sent++;
        else skipped++;
      } catch {
        failed++;
      }
    }

    await logCronJobRun(supabase, {
      job_name: "beta-tester-reminders",
      function_name: "beta-tester-reminders", route_path: "supabase/functions/beta-tester-reminders", description: "Sends beta testing reminder emails.", schedule_hint: "Edge Function / scheduled",
      source,
      status: failed ? "warning" : "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: found.rows.length,
      success_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: found.rows.length ? sent / found.rows.length : null,
      metadata: { table: found.table },
    });
    await logEdgeFunctionRun(supabase, { function_name: "beta-tester-reminders", status: "success", source, duration_ms: timer(), output_summary: { table: found.table, sent, skipped, failed } });
    return ok({ success: true, table: found.table, checked: found.rows.length, sent, skipped, failed });
  } catch (error) {
    const message = safeError(error);
    await logCronJobRun(supabase, { job_name: "beta-tester-reminders", function_name: "beta-tester-reminders", route_path: "supabase/functions/beta-tester-reminders", description: "Sends beta testing reminder emails.", schedule_hint: "Edge Function / scheduled", source, status: "failed", started_at: startedAt, finished_at: new Date().toISOString(), duration_ms: timer(), failed_count: 1, error_message: message });
    await logEdgeFunctionRun(supabase, { function_name: "beta-tester-reminders", status: "error", error_message: message, duration_ms: timer() });
    return serverError("beta-tester-reminders failed", message);
  }
});
