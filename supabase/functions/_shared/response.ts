import { corsHeaders } from "./cors.ts";

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const ok = (data: unknown = {}, status = 200) => jsonResponse(data, status);
export const badRequest = (message: string, details?: unknown) => jsonResponse({ success: false, error: message, details }, 400);
export const unauthorized = (message = "Unauthorized") => jsonResponse({ success: false, error: message }, 401);
export const forbidden = (message = "Forbidden") => jsonResponse({ success: false, error: message }, 403);
export const notFound = (message = "Not found") => jsonResponse({ success: false, error: message }, 404);
export const serverError = (message = "Server error", details?: unknown) => jsonResponse({ success: false, error: message, details }, 500);
