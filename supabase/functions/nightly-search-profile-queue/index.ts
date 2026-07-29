import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1500;
  return Math.min(10000, Math.max(1, Math.trunc(parsed)));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("CRON_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!expectedSecret || !secureCompare(suppliedSecret, expectedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase Edge Function environment variables" }, 500);
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const url = new URL(request.url);
  const limit = parseLimit(body.limit ?? url.searchParams.get("limit"));
  const startedAt = Date.now();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc(
    "enqueue_nightly_location_search_profile_run",
    { p_limit: limit },
  );

  const durationMs = Date.now() - startedAt;

  try {
    await supabase.from("edge_function_logs").insert({
      function_name: "nightly-search-profile-queue",
      status: error ? "failed" : "success",
      source: "cron",
      input_summary: { limit },
      output_summary: error ? null : data,
      error_message: error?.message ?? null,
      duration_ms: durationMs,
      metadata: { edge: true, queue_only: true },
    });
  } catch (logError) {
    console.warn("Unable to write edge function log", logError);
  }

  if (error) {
    console.error("Nightly search profile queue failed", error);
    return json({ ok: false, error: error.message, durationMs }, 500);
  }

  return json({ ok: true, result: data, durationMs });
});
