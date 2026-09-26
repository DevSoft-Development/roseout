import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type TrustIncident = {
  id: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  request_id: string | null;
  surface: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  resolved_at: string | null;
};

async function safeCount(work: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const result = await work;
    return result.error ? null : result.count ?? 0;
  } catch {
    return null;
  }
}

export async function loadTrustOperations() {
  const db = getAdminDatabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [verifiedVisits, openIncidents, searchIssues, incidentRows] = await Promise.all([
    safeCount(
      db.from("location_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("verified_visit", true),
    ),
    safeCount(
      db.from("trust_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "investigating"]),
    ),
    safeCount(
      db.from("search_health_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .in("severity", ["warning", "error", "critical"]),
    ),
    db.from("trust_incidents")
      .select("id,category,severity,status,title,summary,request_id,surface,provider,model,created_at,resolved_at")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data, error }) => ({
        rows: error ? [] : ((data ?? []) as TrustIncident[]),
        warning: error ? "Trust incident storage is unavailable until the migration is applied." : null,
      }))
      .catch(() => ({ rows: [] as TrustIncident[], warning: "Trust incident storage is temporarily unavailable." })),
  ]);

  return {
    verifiedVisits,
    openIncidents,
    searchIssues24h: searchIssues,
    incidents: incidentRows.rows,
    warning: incidentRows.warning,
  };
}
