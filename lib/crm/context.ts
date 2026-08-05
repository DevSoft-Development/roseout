import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CrmRecordContext = { accountId?: string; contactId?: string; locationId?: string; opportunityId?: string; claimId?: string; supportCaseId?: string; taskId?: string; returnTo?: string };
export const CRM_CONTEXT_PARAMS = ["account_id","contact_id","location_id","opportunity_id","claim_id","support_case_id","task_id"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const aliases: Record<string, keyof CrmRecordContext> = { account_id:"accountId", accountId:"accountId", account:"accountId", contact_id:"contactId", contactId:"contactId", location_id:"locationId", locationId:"locationId", location:"locationId", selectedLocation:"locationId", business_id:"locationId", opportunity_id:"opportunityId", opportunityId:"opportunityId", claim_id:"claimId", claimId:"claimId", support_case_id:"supportCaseId", supportCaseId:"supportCaseId", task_id:"taskId", taskId:"taskId" };
export function isUuid(v: unknown): v is string { return typeof v === "string" && UUID.test(v); }
export function safeCrmReturnTo(v?: string | null) { if (!v) return "/admin/dashboard/crm"; try { const decoded = decodeURIComponent(v); if (decoded.startsWith("/admin/dashboard/crm") && !decoded.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return decoded; } catch {} return "/admin/dashboard/crm"; }
export function parseCrmContextSearchParams(p: Record<string,string|undefined>): CrmRecordContext { const out: CrmRecordContext = {}; for (const [k,v] of Object.entries(p)) { const key = aliases[k]; if (key && v && isUuid(v)) (out as any)[key] = v; } out.returnTo = safeCrmReturnTo(p.return_to); return out; }
export function toCrmSearchParams(ctx: CrmRecordContext) { const p = new URLSearchParams(); if (ctx.accountId) p.set("account_id",ctx.accountId); if (ctx.contactId) p.set("contact_id",ctx.contactId); if (ctx.locationId) p.set("location_id",ctx.locationId); if (ctx.opportunityId) p.set("opportunity_id",ctx.opportunityId); if (ctx.claimId) p.set("claim_id",ctx.claimId); if (ctx.supportCaseId) p.set("support_case_id",ctx.supportCaseId); if (ctx.taskId) p.set("task_id",ctx.taskId); if (ctx.returnTo) p.set("return_to", safeCrmReturnTo(ctx.returnTo)); return p; }
export function withCrmContext(path: string, ctx: CrmRecordContext = {}, extra: Record<string,string|undefined> = {}) { const p = toCrmSearchParams(ctx); for (const [k,v] of Object.entries(extra)) if (v) p.set(k,v); const qs = p.toString(); return `${path}${qs?`?${qs}`:""}`; }
export function withReturnTo(path: string, returnTo: string) { const sep = path.includes("?") ? "&" : "?"; return `${path}${sep}return_to=${encodeURIComponent(safeCrmReturnTo(returnTo))}`; }
export const buildLocationCrmHref = (id:string, ctx:CrmRecordContext={}) => withCrmContext(`/admin/dashboard/crm/${id}`, {...ctx, locationId:id});
export const buildAccountCrmHref = (id:string, ctx:CrmRecordContext={}) => withCrmContext(`/admin/dashboard/crm/accounts/${id}`, {...ctx, accountId:id});
export const buildClaimsHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/claims", ctx);
export const buildOutreachHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/outreach", ctx);
export const buildOpportunitiesHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/opportunities", ctx);
export const buildSupportHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/support", ctx);
export const buildTasksHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/tasks", ctx);
export const buildActivityHref = (ctx:CrmRecordContext={}) => withCrmContext("/admin/dashboard/crm/activity-audit", ctx);
export async function resolveCrmContext(input: CrmRecordContext) { const ctx = {...input};
 if (ctx.locationId && !ctx.accountId) { const {data} = await supabaseAdmin.from("crm_account_locations").select("account_id").eq("location_id",ctx.locationId).eq("status","active").limit(1).maybeSingle(); if (data?.account_id) ctx.accountId=data.account_id; }
 if (ctx.opportunityId) { const {data} = await supabaseAdmin.from("crm_opportunities").select("account_id,primary_contact_id,primary_location_id").eq("id",ctx.opportunityId).maybeSingle(); if (data) { ctx.accountId ||= data.account_id; ctx.contactId ||= data.primary_contact_id; ctx.locationId ||= data.primary_location_id; } }
 return ctx;
}
