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
    const { error } = await supabaseAdmin.from("admin_system_logs").insert({
      category,
      level: category === "error" || category.startsWith("failed_") ? "error" : "info",
      message: JSON.stringify(payload).slice(0, 5000),
      source: "application",
      entity_type: category === "reservation_audit" ? "reservation" : null,
      entity_id:
        category === "reservation_audit" && typeof payload.reservationId === "string"
          ? payload.reservationId
          : null,
      metadata: payload,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error(
      "monitoring-log-failed",
      category,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function logError(scope: string, error: unknown, context: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  await logEvent("error", { scope, message, context });
}
