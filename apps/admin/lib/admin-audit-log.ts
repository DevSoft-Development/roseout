import "server-only";

import { headers } from "next/headers";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type Actor = {
  user_id?: string | null;
  email?: string | null;
  role?: string | null;
} | null | undefined;

const SENSITIVE = /password|token|secret|key|turnstile|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : redact(entry),
      ]),
    );
  }
  return value;
}

async function requestMeta(request?: Request) {
  const requestHeaders = request?.headers ?? (await headers().catch(() => null));
  return {
    ip:
      requestHeaders?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders?.get("x-real-ip") ||
      null,
    ua: requestHeaders?.get("user-agent") || null,
  };
}

export async function logAdminAuditEvent(input: {
  actor?: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
}) {
  try {
    const meta = await requestMeta(input.request);
    const supabaseAdmin = getAdminDatabaseClient();

    await supabaseAdmin.from("admin_audit_logs").insert({
      actor_user_id: input.actor?.user_id ?? null,
      actor_email: input.actor?.email ?? null,
      actor_role: input.actor?.role ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: redact(input.metadata || {}),
      ip_address: meta.ip,
      user_agent: meta.ua,
    });
  } catch (error) {
    console.error("ADMIN_AUDIT_LOG_FAILED", error);
  }
}
