import { supabaseAdmin } from "@/lib/supabase-admin";

type AdminLogLevel = "info" | "warning" | "error" | "critical" | string;

type Input = {
  category: string;
  action?: string | null;
  level?: AdminLogLevel;
  message: string;
  source?: string | null;
  actor_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
};

export async function logAdminEvent(input: Input) {
  try {
    const metadata = input.metadata && JSON.stringify(input.metadata).length < 3000 ? input.metadata : {};
    const actorUserId = input.actor_user_id || input.actor_id || null;

    await supabaseAdmin.from("admin_system_logs").insert({
      category: input.category,
      action: input.action || input.category,
      level: input.level || "info",
      message: input.message,
      source: input.source || null,
      actor_user_id: actorUserId,
      actor_id: actorUserId,
      actor_email: input.actor_email || null,
      entity_type: input.entity_type || null,
      entity_id: input.entity_id || null,
      request_id: input.request_id || null,
      ip: input.ip || null,
      user_agent: input.user_agent || null,
      metadata,
    });
  } catch (error) {
    console.error("Failed to write admin log", error);
  }
}
