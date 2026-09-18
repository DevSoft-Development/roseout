import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type LocationToolLogFilters = {
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
};

export type LocationToolLogRow = {
  id: string;
  createdAt: string | null;
  action: string;
  status: string;
  summary: string;
  actor: string | null;
  details: unknown;
  source: "import" | "audit";
};

function text(value: unknown) {
  return String(value ?? "");
}

function includesFilter(value: unknown, filter?: string) {
  if (!filter) return true;
  return text(value).toLowerCase().includes(filter.toLowerCase());
}

export async function loadLocationToolLogs(
  filters: LocationToolLogFilters = {},
) {
  const adminDb = getAdminDatabaseClient();

  const [importsResult, auditResult] = await Promise.all([
    adminDb
      .from("import_logs")
      .select("id,job_name,run_date,created_at,meta,error")
      .order("created_at", { ascending: false })
      .limit(100),
    adminDb
      .from("admin_audit_logs")
      .select(
        "id,action,status,summary,actor_email,created_at,details",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rows: LocationToolLogRow[] = [
    ...(importsResult.data || []).map((row: any) => ({
      id: `import:${row.id}`,
      createdAt: row.created_at || row.run_date || null,
      action: row.job_name || "import",
      status: row.error ? "error" : "success",
      summary: row.error || "Import completed",
      actor: "system",
      details: row.meta || row,
      source: "import" as const,
    })),
    ...(auditResult.data || []).map((row: any) => ({
      id: `audit:${row.id}`,
      createdAt: row.created_at || null,
      action: row.action || "audit",
      status: row.status || "unknown",
      summary: row.summary || "Admin activity",
      actor: row.actor_email || null,
      details: row.details || row,
      source: "audit" as const,
    })),
  ];

  const q = (filters.q || "").trim().toLowerCase();

  return rows
    .filter((row) => {
      if (!includesFilter(row.action, filters.type)) return false;
      if (!includesFilter(row.status, filters.status)) return false;
      if (filters.from && text(row.createdAt) < filters.from) return false;
      if (filters.to && text(row.createdAt) > filters.to) return false;
      if (
        q &&
        !JSON.stringify(row).toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) =>
      text(b.createdAt).localeCompare(text(a.createdAt)),
    )
    .slice(0, 150);
}
