import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronJobRun } from "../_shared/cronLogger.ts";

const cors = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("OUTING_REMINDER_CRON_SECRET")) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: cors });
  }
  const supabase = createClient(Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const now = new Date();
  const in110 = new Date(now.getTime() + 110 * 60000).toISOString();
  const in130 = new Date(now.getTime() + 130 * 60000).toISOString();
  const in20 = new Date(now.getTime() + 20 * 60000).toISOString();
  const in40 = new Date(now.getTime() + 40 * 60000).toISOString();
  const fromFollow = new Date(now.getTime() - 30 * 60000).toISOString();
  const toFollow = new Date(now.getTime() + 10 * 60000).toISOString();

  const twoHour = await supabase.from("outings").select("id").not("planned_for", "is", null).eq("outing_time_confidence", "exact").eq("reminders_enabled", true).is("reminder_2h_sent_at", null).gte("planned_for", in110).lte("planned_for", in130).not("status", "in", "(completed,cancelled)").limit(50);
  const thirty = await supabase.from("outings").select("id").not("planned_for", "is", null).eq("outing_time_confidence", "exact").eq("reminders_enabled", true).is("reminder_30m_sent_at", null).gte("planned_for", in20).lte("planned_for", in40).not("status", "in", "(completed,cancelled)").limit(50);
  const follow = await supabase.from("outings").select("id").eq("next_morning_followup_enabled", true).not("next_morning_followup_date", "is", null).is("next_morning_followup_sent_at", null).gte("next_morning_followup_date", fromFollow).lte("next_morning_followup_date", toFollow).neq("status", "cancelled").limit(50);

  for (const row of twoHour.data || []) await supabase.from("outings").update({ reminder_2h_sent_at: new Date().toISOString() }).eq("id", row.id).is("reminder_2h_sent_at", null);
  for (const row of thirty.data || []) await supabase.from("outings").update({ reminder_30m_sent_at: new Date().toISOString() }).eq("id", row.id).is("reminder_30m_sent_at", null);
  for (const row of follow.data || []) await supabase.from("outings").update({ next_morning_followup_sent_at: new Date().toISOString() }).eq("id", row.id).is("next_morning_followup_sent_at", null);

  const response = { ok: true, two_hour: twoHour.data?.length || 0, thirty_minute: thirty.data?.length || 0, next_morning_followup: follow.data?.length || 0 };
  await logCronJobRun(supabase, {
    job_name: "outing-reminders",
    function_name: "outing-reminders",
    route_path: "supabase/functions/outing-reminders",
    description: "Processes outing reminder and next-morning follow-up timestamps.",
    schedule_hint: "No repo schedule found",
    status: "success",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    checked_count: (twoHour.data?.length || 0) + (thirty.data?.length || 0) + (follow.data?.length || 0),
    success_count: (twoHour.data?.length || 0) + (thirty.data?.length || 0) + (follow.data?.length || 0),
    message: "Outing reminders processed.",
    details: response,
  });
  return new Response(JSON.stringify(response), { headers: cors });
});
