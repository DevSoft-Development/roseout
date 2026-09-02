import "server-only";
import {
  platformCoreApiConfigured,
  readCrmOperationsSnapshotViaCoreApi,
  readCrmReportSnapshotViaCoreApi,
  readSupportCaseViaCoreApi,
} from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listNormalizedClaims, getNormalizedClaim } from "./claims";

export type SearchParams = Record<string, string | undefined>;
const esc = (v: string) => v.replace(/[%_]/g, "\\$&");
export const pageSize = 25;
export function paging(p: SearchParams) { const page = Math.max(1, Number(p.page) || 1); return { page, from: (page - 1) * pageSize, to: page * pageSize - 1 }; }
export async function listClaims(p: SearchParams) { return listNormalizedClaims(p); }
export async function getClaim(id: string) { const claim = await getNormalizedClaim(id); const [{ data: codes }, { data: tasks }, { data: acts }] = await Promise.all([claim.locationId ? supabaseAdmin.from("location_claim_codes").select("*").eq("location_id", claim.locationId).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] } as any), supabaseAdmin.from("crm_tasks").select("*").eq("source_record_id", id).is("archived_at", null).limit(50), supabaseAdmin.from("crm_activities").select("*").eq("source_record_id", id).order("occurred_at", { ascending: false }).limit(100)]); return { claim, codes: codes ?? [], tasks: tasks ?? [], activities: acts ?? [] }; }
export async function listClaimCodes(p: SearchParams) { const pg = paging(p); let q = supabaseAdmin.from("location_claim_codes").select("*,locations(id,name,city,state),crm_accounts(id,name)", { count: "exact" }); if (p.status) q = q.eq("status", p.status); if (p.q) q = q.or(`claim_code.ilike.%${esc(p.q)}%,claim_url.ilike.%${esc(p.q)}%`); const { data, error, count } = await q.order("created_at", { ascending: false }).range(pg.from, pg.to); if (error) throw error; return { rows: data ?? [], count: count ?? 0, ...pg }; }
export async function listOutreach(p: SearchParams) { const pg = paging(p); let q = supabaseAdmin.from("crm_tasks").select("*,crm_accounts(id,name),locations(id,name,city,state),crm_contacts(id,full_name,email),crm_opportunities(id,name)", { count: "exact" }).in("task_type", ["social_outreach","phone_outreach","email_outreach","site_visit","follow_up","claim_code_delivery","owner_meeting"]).is("archived_at", null); if (p.status) q = q.eq("status", p.status); if (p.channel) q = q.eq("task_type", p.channel); if (p.location_id) q = q.eq("location_id", p.location_id); if (p.account_id) q = q.eq("account_id", p.account_id); if (p.contact_id) q = q.eq("contact_id", p.contact_id); if (p.opportunity_id) q = q.eq("opportunity_id", p.opportunity_id); if (p.q) q = q.ilike("title", `%${esc(p.q)}%`); const { data, error, count } = await q.order("updated_at", { ascending: false }).range(pg.from, pg.to); if (error) throw error; return { rows: data ?? [], count: count ?? 0, ...pg }; }
export async function listSupport(p: SearchParams) {
  const pg = paging(p); let q = supabaseAdmin.from("support_tickets").select("*", { count: "exact" });
  if (p.queue === "new") q = q.eq("status", "new");
  else if (p.queue === "mine" && p.assigned_to) q = q.eq("assigned_to", p.assigned_to);
  else if (p.queue === "unassigned") q = q.is("assigned_to", null);
  else if (p.queue === "waiting_on_customer") q = q.eq("status", "waiting_on_customer");
  else if (p.queue === "waiting_on_internal") q = q.eq("status", "waiting_on_internal");
  else if (p.queue === "escalated") q = q.eq("status", "escalated");
  else if (p.queue === "sla_breached") q = q.contains("metadata", { sla_breached: true });
  else if (p.queue === "urgent") q = q.eq("priority", "urgent");
  else if (p.queue === "billing") q = q.eq("assigned_group", "billing");
  else if (p.queue === "reservations") q = q.eq("assigned_group", "reservations");
  else if (p.queue === "location_support") q = q.eq("assigned_group", "location_success");
  else if (p.queue === "reopened") q = q.eq("status", "reopened");
  if (p.status) q = q.eq("status", p.status); if (p.priority) q = q.eq("priority", p.priority); if (p.category) q = q.eq("category", p.category); if (p.group) q = q.eq("assigned_group", p.group); if (p.tag) q = q.contains("tags", [p.tag]);
  if (p.q) q = q.or(`subject.ilike.%${esc(p.q)}%,email.ilike.%${esc(p.q)}%,requester_email.ilike.%${esc(p.q)}%`);
  const { data, error, count } = await q.order("updated_at", { ascending: false }).range(pg.from, pg.to); if (error) throw error; return { rows: data ?? [], count: count ?? 0, ...pg };
}

async function getSupportCaseLocally(id: string) {
  const [{ data: ticket, error }, { data: messages }, { data: acts }] = await Promise.all([
    supabaseAdmin.from("support_tickets").select("*").eq("id", id).single(),
    supabaseAdmin.from("support_ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
    supabaseAdmin.from("crm_activities").select("*").eq("record_id", id).order("occurred_at", { ascending: false }).limit(100),
  ]);
  if (error) throw error;
  return { ticket, messages: messages ?? [], activities: acts ?? [] };
}

export async function getSupportCase(id: string) {
  if (platformCoreApiConfigured()) {
    try {
      return await readSupportCaseViaCoreApi(id);
    } catch (error) {
      console.warn("Core support case unavailable; using local fallback", error);
    }
  }
  return getSupportCaseLocally(id);
}

async function operationsSnapshotLocally() {
  const [claims, hidden, support, tasks, codes] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name,claim_status,updated_at", { count: "exact", head: false }).in("claim_status", ["pending","in_review","information_needed"] as any).limit(20),
    supabaseAdmin.from("locations").select("id,name,is_searchable,is_hidden,updated_at", { count: "exact" }).or("is_searchable.eq.false,is_hidden.eq.true").limit(20),
    supabaseAdmin.from("support_tickets").select("id,subject,status,priority,updated_at", { count: "exact" }).in("status", ["new","open","pending"] as any).limit(20),
    supabaseAdmin.from("crm_tasks").select("id,title,status,priority,due_at,updated_at", { count: "exact" }).in("status", ["open","blocked","in_progress"] as any).limit(20),
    supabaseAdmin.from("location_claim_codes").select("id,claim_code,status,expires_at,updated_at", { count: "exact" }).limit(20),
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

async function reportSnapshotLocally(p: SearchParams) {
  const start = p.start || new Date(Date.now() - 30*864e5).toISOString().slice(0,10), end = p.end || new Date().toISOString().slice(0,10);
  const [opps, claims, support, outreach] = await Promise.all([
    supabaseAdmin.from("crm_opportunities").select("amount,weighted_amount,stage,forecast_category,created_at").gte("created_at", start).lte("created_at", end),
    supabaseAdmin.from("locations").select("claim_status,created_at").gte("created_at", start).lte("created_at", end),
    supabaseAdmin.from("support_tickets").select("status,priority,category,created_at,closed_at").gte("created_at", start).lte("created_at", end),
    supabaseAdmin.from("crm_tasks").select("task_type,status,created_at").in("task_type", ["social_outreach","phone_outreach","email_outreach","site_visit","follow_up","claim_code_delivery"]).gte("created_at", start).lte("created_at", end),
  ]);
  return { start, end, opps: opps.data ?? [], claims: claims.data ?? [], support: support.data ?? [], outreach: outreach.data ?? [] };
}

export async function reportSnapshot(p: SearchParams) {
  if (platformCoreApiConfigured()) {
    try {
      return await readCrmReportSnapshotViaCoreApi({ start: p.start, end: p.end });
    } catch (error) {
      console.warn("Core CRM report snapshot unavailable; using local fallback", error);
    }
  }
  return reportSnapshotLocally(p);
}
