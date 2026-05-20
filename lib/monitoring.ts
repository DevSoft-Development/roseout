import { supabaseAdmin } from "@/lib/supabase-admin";

type LogCategory =
  | "error"
  | "failed_api"
  | "failed_stripe"
  | "failed_email_sms"
  | "admin_activity"
  | "reservation_audit";

export async function logEvent(category: LogCategory, payload: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("admin_logs").insert({
      category,
      message: JSON.stringify(payload).slice(0, 5000),
      created_at: new Date().toISOString(),
    });
  } catch {
    console.error("monitoring-log-failed", category, payload);
  }
}

export async function logError(scope: string, error: unknown, context: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  await logEvent("error", { scope, message, context });
}
