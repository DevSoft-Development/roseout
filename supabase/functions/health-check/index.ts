import { handleOptions } from "../_shared/cors.ts";
import { ok } from "../_shared/response.ts";
Deno.serve((req) => {
  const options = handleOptions(req); if (options) return options;
  return ok({ success: true, function: "health-check", project: "TheOutHaven", timestamp: new Date().toISOString(), env: { hasSupabaseUrl: Boolean(Deno.env.get("SUPABASE_URL")), hasServiceRole: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")), hasResend: Boolean(Deno.env.get("RESEND_API_KEY")), hasOpenAI: Boolean(Deno.env.get("OPENAI_API_KEY")), hasGooglePlaces: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")) } });
});
