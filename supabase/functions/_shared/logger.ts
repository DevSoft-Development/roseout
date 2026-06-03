import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type EdgeFunctionLogPayload = {
  function_name: string;
  status: string;
  source?: string | null;
  request_id?: string | null;
  user_id?: string | null;
  input_summary?: unknown;
  output_summary?: unknown;
  error_message?: string | null;
  duration_ms?: number | null;
  metadata?: unknown;
};

export function startTimer(): () => number {
  const started = Date.now();
  return () => Date.now() - started;
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

export async function logEdgeFunctionRun(supabase: SupabaseClient, payload: EdgeFunctionLogPayload): Promise<void> {
  try {
    const { error } = await supabase.from("edge_function_logs").insert({
      function_name: payload.function_name,
      status: payload.status ?? "success",
      source: payload.source ?? null,
      request_id: payload.request_id ?? null,
      user_id: payload.user_id ?? null,
      input_summary: payload.input_summary ?? null,
      output_summary: payload.output_summary ?? null,
      error_message: payload.error_message ?? null,
      duration_ms: payload.duration_ms ?? null,
      metadata: payload.metadata ?? null,
    });
    if (error) console.warn("[edge-log] skipped", error.message);
  } catch (error) {
    console.warn("[edge-log] unavailable", safeError(error));
  }
}
