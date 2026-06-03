import { corsHeaders } from "./cors.ts";

export function jsonResponse(data: unknown, status = 200, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export const ok = (data: unknown, init?: ResponseInit) => jsonResponse(data, init?.status ?? 200, init);
export const badRequest = (message: string, details?: unknown) => jsonResponse({ success: false, error: "bad_request", message, details }, 400);
export const unauthorized = (message = "Unauthorized") => jsonResponse({ success: false, error: "unauthorized", message }, 401);
export const forbidden = (message = "Forbidden") => jsonResponse({ success: false, error: "forbidden", message }, 403);
export const notFound = (message = "Not found") => jsonResponse({ success: false, error: "not_found", message }, 404);
export const serverError = (message: string, details?: unknown) => jsonResponse({ success: false, error: "server_error", message, details }, 500);
