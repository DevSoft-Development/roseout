import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ success: false, error: "missing_supabase_runtime_config" }, 500);

  const body = await req.json().catch(() => ({}));
  const operation = String(body?.operation || "");
  const rpc = operation === "cleanup_expired_auth_email_tokens"
    ? "aws_cleanup_expired_auth_email_tokens_cron"
    : operation === "location_enrichment_reconcile"
      ? "aws_location_enrichment_reconcile_cron"
      : "";

  if (!rpc) return json({ success: false, error: "unsupported_operation", operation }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc(rpc);
  if (error) return json({ success: false, error: error.message, operation }, 500);
  return json({ success: true, operation, result: data ?? null });
});
