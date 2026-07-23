import { corsHeaders } from "./cors.ts";
export function json(body: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(body), { ...init, headers: { ...corsHeaders, "content-type": "application/json", ...(init.headers || {}) } }); }
