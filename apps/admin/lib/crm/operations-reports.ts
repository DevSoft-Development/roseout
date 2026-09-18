import "server-only";

import {
  platformCoreApiConfigured,
  readCrmOperationsSnapshotViaCoreApi,
  readCrmReportSnapshotViaCoreApi,
} from "@/lib/aws/core-api";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type SearchParams = Record<string, string | undefined>;

async function operationsSnapshotLocally() {
  const db = getAdminDatabaseClient();
  const [claims, hidden, support, tasks, codes] = await Promise.all([
    db.from("locations").select("id,name,claim_status,updated_at", { count: "exact", head: false }).in("claim_status", ["pending","in_review","information_needed"] as any).limit(20),
    db.from("locations").select("id,name,is_searchable,is_hidden,updated_at", { count: "exact" }).or("is_searchable.eq.false,is_hidden.eq.true").limit(20),
    db.from("support_tickets").select("id,subject,status,priority,updated_at", { count: "exact" }).in("status", ["new","open","pending"] as any).limit(20),
    db.from("crm_tasks").select("id,title,status,priority,due_at,updated_at,assigned_to_user_id", { count: "exact" }).in("status", ["open","blocked","in_progress"] as any).limit(20),
    db.from("location_claim_codes").select("id,claim_code,status,expires_at,updated_at", { count: "exact" }).limit(20),
  ]);
  return { claims, hidden, support, tasks, codes };
}

export async function operationsSnapshot() {
  if (platformCoreApiConfigured()) {
    try {
      return await readCrmOperationsSnapshotViaCoreApi();
    } catch (error) {
      console.warn("Core CRM operations snapshot unavailable; using local fallback", error);
    }
  }
  return operationsSnapshotLocally();
}

async function reportSnapshotLocally(params: SearchParams) {
  const db = getAdminDatabaseClient();
  const start = params.start || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const end = params.end || new Date().toISOString().slice(0, 10);
  const [opps, claims, support, outreach] = await Promise.all([
    db.from("crm_opportunities").select("amount,weighted_amount,stage,forecast_category,created_at").gte("created_at", start).lte("created_at", end),
    db.from("locations").select("claim_status,created_at").gte("created_at", start).lte("created_at", end),
    db.from("support_tickets").select("status,priority,category,created_at,closed_at").gte("created_at", start).lte("created_at", end),
    db.from("crm_tasks").select("task_type,status,created_at").in("task_type", ["social_outreach","phone_outreach","email_outreach","site_visit","follow_up","claim_code_delivery"]).gte("created_at", start).lte("created_at", end),
  ]);
  return {
    start,
    end,
    opps: opps.data ?? [],
    claims: claims.data ?? [],
    support: support.data ?? [],
    outreach: outreach.data ?? [],
  };
}

export async function reportSnapshot(params: SearchParams) {
  if (platformCoreApiConfigured()) {
    try {
      return await readCrmReportSnapshotViaCoreApi({ start: params.start, end: params.end });
    } catch (error) {
      console.warn("Core CRM report snapshot unavailable; using local fallback", error);
    }
  }
  return reportSnapshotLocally(params);
}
