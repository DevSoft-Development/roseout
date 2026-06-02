import "server-only";

import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/users/roles";

type AdminUserLike = {
  user_id?: string | null;
  id?: string | null;
  email?: string | null;
  role?: AdminRole | string | null;
};

type AuditInput = {
  adminUser: AdminUserLike | null;
  locationId: string;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown> | null;
  request?: Request | NextRequest | null;
};

function sanitize(value: unknown) {
  if (!value || typeof value !== "object") return value ?? null;
  const blocked = /secret|token|password|key|webhook|stripe|turnstile/i;
  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) => (blocked.test(key) ? "[redacted]" : nestedValue)),
  );
}

async function headerValue(name: string) {
  try {
    const store = await headers();
    return store.get(name);
  } catch {
    return null;
  }
}

export async function logAdminLocationAction({
  adminUser,
  locationId,
  actionType,
  targetType,
  targetId,
  beforeData,
  afterData,
  metadata,
  request,
}: AuditInput) {
  try {
    const ipAddress =
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request?.headers.get("x-real-ip") ||
      (await headerValue("x-forwarded-for"))?.split(",")[0]?.trim() ||
      (await headerValue("x-real-ip"));
    const userAgent = request?.headers.get("user-agent") || (await headerValue("user-agent"));

    const { error } = await supabaseAdmin.from("admin_location_action_logs").insert({
      admin_user_id: adminUser?.user_id || adminUser?.id || null,
      admin_email: adminUser?.email || null,
      admin_role: adminUser?.role ? String(adminUser.role) : null,
      location_id: locationId,
      action_type: actionType,
      target_type: targetType || null,
      target_id: targetId || null,
      before_data: sanitize(beforeData),
      after_data: sanitize(afterData),
      metadata: sanitize(metadata || {}),
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    if (error) console.warn("Admin location audit log insert failed", error.message);
    return { success: !error, error };
  } catch (error) {
    console.warn("Admin location audit log failed", error);
    return { success: false, error };
  }
}
