import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isSupportPriority, isSupportStatus, type SupportPriority, type SupportStatus } from "./canonical";

export const SUPPORT_QUEUE_KEYS = [
  "new","mine","unassigned","waiting_on_customer","waiting_on_internal","escalated","sla_breached","urgent","billing","reservations","location_support","reopened",
] as const;

export async function getSupportOperationsSettings() {
  const [groups, slas, businessHours, macros, triggers, automations] = await Promise.all([
    supabaseAdmin.from("support_groups").select("*").order("sort_order"),
    supabaseAdmin.from("support_sla_policies").select("*").order("first_response_minutes"),
    supabaseAdmin.from("support_business_hours").select("*").order("day_of_week"),
    supabaseAdmin.from("support_macros").select("*").order("sort_order"),
    supabaseAdmin.from("support_triggers").select("*").order("sort_order"),
    supabaseAdmin.from("support_automation_rules").select("*").order("name"),
  ]);
  for (const result of [groups, slas, businessHours, macros, triggers, automations]) if (result.error) throw result.error;
  return {
    groups: groups.data ?? [], slas: slas.data ?? [], businessHours: businessHours.data ?? [], macros: macros.data ?? [], triggers: triggers.data ?? [], automations: automations.data ?? [],
  };
}

export async function setSupportGroup(ticketId: string, group: string | null) {
  const value = String(group || "").trim() || null;
  if (value) {
    const { data, error } = await supabaseAdmin.from("support_groups").select("key").eq("key", value).eq("active", true).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Unsupported support group.");
  }
  const { error } = await supabaseAdmin.from("support_tickets").update({ assigned_group: value, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw error;
}

function normalizeTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 25);
}

export async function setSupportTags(ticketId: string, tags: string[]) {
  const normalized = normalizeTags(tags);
  const { error } = await supabaseAdmin.from("support_tickets").update({ tags: normalized, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) throw error;
  return normalized;
}

export async function addSupportTags(ticketId: string, tags: string[]) {
  const { data, error } = await supabaseAdmin.from("support_tickets").select("tags").eq("id", ticketId).single();
  if (error) throw error;
  return setSupportTags(ticketId, [...(Array.isArray(data?.tags) ? data.tags.map(String) : []), ...tags]);
}

export async function getSupportMacro(key: string) {
  const { data, error } = await supabaseAdmin.from("support_macros").select("*").eq("key", key).eq("active", true).single();
  if (error) throw error;
  return data as { key: string; name: string; body: string | null; set_status: SupportStatus | null; set_priority: SupportPriority | null; assigned_group: string | null; tags: string[] | null; };
}

export function validateMacroStatus(value: unknown): SupportStatus | null { return value && isSupportStatus(value) ? value : null; }
export function validateMacroPriority(value: unknown): SupportPriority | null { return value && isSupportPriority(value) ? value : null; }
