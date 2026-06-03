export function startTimer() {
  const started = Date.now();
  return () => Date.now() - started;
}

export function safeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

export async function logEdgeFunctionRun(supabase: any, payload: Record<string, unknown>) {
  try {
    await supabase.from("edge_function_logs").insert({
      function_name: payload.function_name ?? "unknown",
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
  } catch (error) {
    console.warn("edge_function_logs insert skipped", safeError(error));
  }
}
