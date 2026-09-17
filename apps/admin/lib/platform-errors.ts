import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type PlatformErrorFilters = {
  q?: string;
  route?: string;
  type?: string;
  severity?: string;
  visible?: string;
  from?: string;
  to?: string;
};

export async function loadPlatformErrors(filters: PlatformErrorFilters) {
  const adminDb = getAdminDatabaseClient();
  const since24 = new Date(Date.now() - 86_400_000).toISOString();

  let query = adminDb
    .from("platform_error_events")
    .select("id,occurred_at,environment,error_type,severity,message,user_visible,route,url,source,status_code,request_id,user_id,anonymous_id,session_id,fingerprint,stack,metadata")
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.visible === "yes") query = query.eq("user_visible", true);
  if (filters.visible === "no") query = query.eq("user_visible", false);
  if (filters.route) query = query.ilike("route", `%${filters.route.slice(0, 200)}%`);
  if (filters.type) query = query.ilike("error_type", `%${filters.type.slice(0, 100)}%`);
  if (filters.q) query = query.ilike("message", `%${filters.q.slice(0, 200)}%`);
  if (filters.from) query = query.gte("occurred_at", filters.from);
  if (filters.to) query = query.lte("occurred_at", `${filters.to}T23:59:59.999Z`);

  const [{ data, error }, total24, visible24, critical24] = await Promise.all([
    query,
    adminDb.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24),
    adminDb.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24).eq("user_visible", true),
    adminDb.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since24).eq("severity", "critical"),
  ]);

  const rows = data || [];
  const recent = rows.filter((row) => new Date(row.occurred_at).getTime() >= Date.now() - 86_400_000);
  const uniqueIncidents = new Set(
    recent.map((row) => row.fingerprint || `${row.error_type}|${row.route}|${row.message}`),
  ).size;
  const affectedRoutes = new Set(recent.map((row) => row.route).filter(Boolean)).size;

  const grouped = new Map<
    string,
    { message: string; route: string; type: string; severity: string; count: number; visible: number }
  >();

  for (const row of recent) {
    const key = row.fingerprint || `${row.error_type}|${row.route}|${row.message}`;
    const item = grouped.get(key) || {
      message: row.message,
      route: row.route || "Unknown route",
      type: row.error_type,
      severity: row.severity,
      count: 0,
      visible: 0,
    };
    item.count += 1;
    if (row.user_visible) item.visible += 1;
    grouped.set(key, item);
  }

  return {
    rows,
    error: error?.message || null,
    summary: {
      total24: total24.count || 0,
      visible24: visible24.count || 0,
      critical24: critical24.count || 0,
      uniqueIncidents,
      affectedRoutes,
    },
    topIncidents: [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
