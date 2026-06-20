import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Actor = { user_id?: string | null; email?: string | null; role?: string | null } | null | undefined;
const SENSITIVE = /password|token|secret|key|turnstile|authorization|cookie/i;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : redact(v)]));
  }
  return value;
}
async function requestMeta(request?: Request) {
  const h = request?.headers ?? (await headers().catch(() => null as any));
  return { ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || null, ua: h?.get("user-agent") || null };
}
export async function logAdminAuditEvent(input: { actor?: Actor; targetUserId?: string | null; targetEmail?: string | null; action: string; entityType: string; entityId?: string | null; summary?: string | null; beforeData?: unknown; afterData?: unknown; metadata?: Record<string, unknown>; request?: Request }) {
  try {
    const meta = await requestMeta(input.request);
    await supabaseAdmin.from("admin_audit_logs").insert({
      actor_user_id: input.actor?.user_id ?? null,
      actor_email: input.actor?.email ?? null,
      actor_role: input.actor?.role ?? null,
      target_user_id: input.targetUserId ?? null,
      target_email: input.targetEmail ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? input.targetUserId ?? null,
      summary: input.summary ?? null,
      before_data: redact(input.beforeData) ?? null,
      after_data: redact(input.afterData) ?? null,
      metadata: redact(input.metadata || {}) as any,
      ip_address: meta.ip,
      user_agent: meta.ua,
    });
  } catch (error) { console.error("ADMIN_AUDIT_LOG_FAILED", error); }
}
