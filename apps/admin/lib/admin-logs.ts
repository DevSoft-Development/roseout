import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type AuditLogFilters = {
  q?: string;
  actor?: string;
  target?: string;
  entity_type?: string;
  action?: string;
  from?: string;
  to?: string;
};

export type SystemLogFilters = {
  category?: string;
  level?: string;
  entity_type?: string;
  actor?: string;
  search?: string;
  limit?: string;
};

export async function loadAdminAuditLogs(filters: AuditLogFilters) {
  const adminDb = getAdminDatabaseClient();
  let query = adminDb
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  if (filters.action && filters.action !== "all") query = query.eq("action", filters.action);
  if (filters.actor) query = query.ilike("actor_email", `%${filters.actor.slice(0, 200)}%`);
  if (filters.target) {
    const target = filters.target.slice(0, 200);
    query = query.or(`target_email.ilike.%${target}%,target_user_id.eq.${target}`);
  }
  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type.slice(0, 120));
  if (filters.q) {
    const search = filters.q.slice(0, 200);
    query = query.or(
      `summary.ilike.%${search}%,target_email.ilike.%${search}%,actor_email.ilike.%${search}%,action.ilike.%${search}%`,
    );
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);

  const { data, error } = await query;
  const rows = data || [];
  const now = Date.now();
  const day = 86_400_000;

  return {
    rows,
    error: error?.message || null,
    summary: {
      userEditsToday: rows.filter(
        (row) => row.action === "user_updated" && now - new Date(row.created_at).getTime() < day,
      ).length,
      rolePlanChangesWeek: rows.filter(
        (row) =>
          ["user_role_changed", "user_plan_changed"].includes(row.action) &&
          now - new Date(row.created_at).getTime() < 7 * day,
      ).length,
      passwordResets: rows.filter((row) => row.action === "password_reset_sent").length,
      deletedDisabledUsers: rows.filter((row) => row.action === "user_deleted_or_disabled").length,
      betaApprovals: rows.filter((row) => row.action === "beta_user_approved").length,
      loginEvents: rows.filter((row) => String(row.action || "").startsWith("login_")).length,
    },
  };
}

const ADMIN_LOG_FIELDS =
  "id,category,level,message,source,actor_id,actor_email,entity_type,entity_id,request_id,created_at";

const bounded = (value: string | undefined, max = 120) => (value || "").trim().slice(0, max);

export async function loadAdminSystemLogs(filters: SystemLogFilters) {
  const adminDb = getAdminDatabaseClient();
  let query = adminDb
    .from("admin_system_logs")
    .select(ADMIN_LOG_FIELDS)
    .order("created_at", { ascending: false });

  const category = bounded(filters.category, 80);
  const level = bounded(filters.level, 40);
  const entityType = bounded(filters.entity_type, 80);
  const actor = bounded(filters.actor);
  const search = bounded(filters.search);

  if (category && category !== "all") query = query.eq("category", category);
  if (level && level !== "all") query = query.eq("level", level);
  if (entityType) query = query.eq("entity_type", entityType);
  if (actor) query = query.ilike("actor_email", `%${actor}%`);
  if (search) query = query.or(`message.ilike.%${search}%,source.ilike.%${search}%`);

  const parsedLimit = Number(filters.limit || 100);
  const limit = Number.isFinite(parsedLimit) ? Math.min(250, Math.max(1, Math.trunc(parsedLimit))) : 100;
  const { data, error } = await query.limit(limit);

  return {
    logs: data || [],
    error: error?.message || null,
  };
}
