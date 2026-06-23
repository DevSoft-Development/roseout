import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { logCronJobRun } from "../_shared/cronLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isAuthorized(req: Request) {
  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");

  if (!expected) {
    return false;
  }

  return provided === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ success: false, error: "Unauthorized cron request" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Missing Supabase environment variables" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const startedAt = new Date().toISOString();
  const summary = {
    success: true,
    source: "nightly-demo-reset",
    startedAt,
    finishedAt: null as string | null,
    sessionsFound: 0,
    sessionsReset: 0,
    errors: [] as string[],
  };

  try {
    const { data: sessions, error: sessionsError } = await supabase
      .from("crm_demo_sessions")
      .select("id")
      .eq("status", "active")
      .lte("expires_at", new Date().toISOString());

    if (sessionsError) {
      throw sessionsError;
    }

    const expiredSessions = sessions ?? [];
    summary.sessionsFound = expiredSessions.length;

    for (const session of expiredSessions) {
      const demoSessionId = session.id;

      const deleteSteps = [
        supabase.from("team_proofs").delete().eq("demo_session_id", demoSessionId),
        supabase.from("ambassador_social_outreach").delete().eq("demo_session_id", demoSessionId),
        supabase.from("ambassador_site_visits").delete().eq("demo_session_id", demoSessionId),
        supabase.from("team_follow_ups").delete().eq("demo_session_id", demoSessionId),
        supabase.from("team_work_activities").delete().eq("demo_session_id", demoSessionId),
        supabase.from("team_work_sessions").delete().eq("demo_session_id", demoSessionId).eq("is_demo", true),
        supabase.from("crm_demo_session_locations").delete().eq("demo_session_id", demoSessionId),
      ];

      for (const step of deleteSteps) {
        const { error } = await step;
        if (error) {
          summary.errors.push(`Session ${demoSessionId}: ${error.message}`);
        }
      }

      const { error: updateError } = await supabase
        .from("crm_demo_sessions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", demoSessionId);

      if (updateError) {
        summary.errors.push(`Session ${demoSessionId} update failed: ${updateError.message}`);
      } else {
        summary.sessionsReset += 1;
      }
    }

    summary.finishedAt = new Date().toISOString();

    await supabase.from("crm_demo_reset_logs").insert({
      reset_type: "nightly",
      status: summary.errors.length ? "partial_success" : "success",
      sessions_deleted: summary.sessionsReset,
      records_deleted: {
        sessionsFound: summary.sessionsFound,
        sessionsReset: summary.sessionsReset,
      },
      error_message: summary.errors.length ? summary.errors.join("; ") : null,
      started_at: startedAt,
      finished_at: summary.finishedAt,
    });

    await logCronJobRun(supabase, {
      job_name: "nightly-demo-reset",
      function_name: "nightly-demo-reset", route_path: "supabase/functions/nightly-demo-reset", description: "Resets demo data overnight.", schedule_hint: "Edge Function / nightly",
      source: "cron",
      status: summary.errors.length ? "warning" : "success",
      started_at: startedAt,
      finished_at: summary.finishedAt,
      duration_ms: new Date(summary.finishedAt).getTime() - new Date(startedAt).getTime(),
      checked_count: summary.sessionsFound,
      success_count: summary.sessionsReset,
      skipped_count: Math.max(summary.sessionsFound - summary.sessionsReset, 0),
      failed_count: summary.errors.length,
      success_rate: summary.sessionsFound ? summary.sessionsReset / summary.sessionsFound : null,
      error_message: summary.errors.length ? summary.errors.join("; ") : null,
      metadata: { sessionsFound: summary.sessionsFound, sessionsReset: summary.sessionsReset },
    });

    return jsonResponse(summary);
  } catch (error) {
    summary.finishedAt = new Date().toISOString();
    summary.success = false;
    summary.errors.push(error instanceof Error ? error.message : String(error));

    try {
      await supabase.from("crm_demo_reset_logs").insert({
        reset_type: "nightly",
        status: "failed",
        sessions_deleted: summary.sessionsReset,
        records_deleted: {
          sessionsFound: summary.sessionsFound,
          sessionsReset: summary.sessionsReset,
        },
        error_message: summary.errors.join("; "),
        started_at: startedAt,
        finished_at: summary.finishedAt,
      });
    } catch {
      // Ignore reset-log insert failure.
    }

    await logCronJobRun(supabase, {
      job_name: "nightly-demo-reset",
      function_name: "nightly-demo-reset", route_path: "supabase/functions/nightly-demo-reset", description: "Resets demo data overnight.", schedule_hint: "Edge Function / nightly",
      source: "cron",
      status: "failed",
      started_at: startedAt,
      finished_at: summary.finishedAt,
      duration_ms: new Date(summary.finishedAt).getTime() - new Date(startedAt).getTime(),
      checked_count: summary.sessionsFound,
      success_count: summary.sessionsReset,
      failed_count: Math.max(summary.errors.length, 1),
      error_message: summary.errors.join("; "),
      metadata: { sessionsFound: summary.sessionsFound, sessionsReset: summary.sessionsReset },
    });

    return jsonResponse(summary, 500);
  }
});
