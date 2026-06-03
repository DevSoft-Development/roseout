import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  try {
    const { data: sessions, error: selectError } = await supabase
      .from("team_work_sessions")
      .select("id, clock_in_at, admin_notes")
      .eq("status", "active")
      .lte("clock_in_at", cutoff);

    if (selectError) {
      throw selectError;
    }

    const openSessions = sessions ?? [];
    let flagged = 0;

    for (const session of openSessions) {
      const note = `Auto-flagged by session watchdog: session open longer than 12 hours at ${new Date().toISOString()}.`;
      const adminNotes = session.admin_notes ? `${session.admin_notes}\n${note}` : note;

      const { error: updateError } = await supabase
        .from("team_work_sessions")
        .update({
          status: "needs_correction",
          approval_status: "needs_correction",
          admin_notes: adminNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      if (!updateError) {
        flagged += 1;
      }
    }

    return jsonResponse({
      success: true,
      checked: openSessions.length,
      flagged,
      cutoff,
      message: "Team session watchdog completed.",
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
