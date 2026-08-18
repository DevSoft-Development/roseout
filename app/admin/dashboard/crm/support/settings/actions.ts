"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isSupportPriority, isSupportStatus } from "@/lib/support/canonical";

const refresh = () => { revalidatePath("/admin/dashboard/crm/support/settings"); revalidatePath("/admin/dashboard/crm/support"); };
const checked = (value: FormDataEntryValue | null) => value === "on" || value === "true";
const splitTags = (value: FormDataEntryValue | null) => [...new Set(String(value || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
const positive = (value: FormDataEntryValue | null) => { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error("Minutes must be greater than zero."); return Math.trunc(n); };
function tableFor(entity: string) { if (entity === "group") return "support_groups"; if (entity === "sla") return "support_sla_policies"; if (entity === "business_hours") return "support_business_hours"; if (entity === "macro") return "support_macros"; if (entity === "trigger") return "support_triggers"; if (entity === "automation") return "support_automation_rules"; throw new Error("Unsupported support setting."); }
async function save(table: string, id: string, payload: Record<string, unknown>) { const query = id ? supabaseAdmin.from(table).update(payload).eq("id", id) : supabaseAdmin.from(table).insert(payload); const { error } = await query; if (error) throw error; }

export async function supportSettingsAction(formData: FormData) {
  await requireAdminRole(CRM_WRITE_ROLES);
  const entity = String(formData.get("entity") || ""); const operation = String(formData.get("operation") || "save"); const id = String(formData.get("id") || "").trim(); const now = new Date().toISOString();
  if (operation === "delete") { if (!id) throw new Error("Record id is required."); const { error } = await supabaseAdmin.from(tableFor(entity)).delete().eq("id", id); if (error) throw error; refresh(); return; }
  if (entity === "group") {
    const key = String(formData.get("key") || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); const name = String(formData.get("name") || "").trim(); if (!key || !name) throw new Error("Group key and name are required.");
    await save("support_groups", id, { key, name, description: String(formData.get("description") || "").trim() || null, active: checked(formData.get("active")), sort_order: Number(formData.get("sort_order") || 100), updated_at: now });
  } else if (entity === "sla") {
    const priority = String(formData.get("priority") || ""); if (!isSupportPriority(priority)) throw new Error("Invalid SLA priority.");
    await save("support_sla_policies", id, { priority, first_response_minutes: positive(formData.get("first_response_minutes")), resolution_minutes: positive(formData.get("resolution_minutes")), active: checked(formData.get("active")), updated_at: now });
  } else if (entity === "business_hours") {
    const day = Number(formData.get("day_of_week")); if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("Invalid day.");
    const start = String(formData.get("start_time") || "09:00"); const end = String(formData.get("end_time") || "17:00"); if (start >= end) throw new Error("End time must be after start time.");
    await save("support_business_hours", id, { day_of_week: day, start_time: start, end_time: end, timezone: String(formData.get("timezone") || "America/New_York").trim() || "America/New_York", active: checked(formData.get("active")), updated_at: now });
  } else if (entity === "macro") {
    const setStatus = String(formData.get("set_status") || "") || null; const setPriority = String(formData.get("set_priority") || "") || null; if (setStatus && !isSupportStatus(setStatus)) throw new Error("Invalid macro status."); if (setPriority && !isSupportPriority(setPriority)) throw new Error("Invalid macro priority.");
    const key = String(formData.get("key") || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); const name = String(formData.get("name") || "").trim(); if (!key || !name) throw new Error("Macro key and name are required.");
    await save("support_macros", id, { key, name, body: String(formData.get("body") || "").trim() || null, set_status: setStatus, set_priority: setPriority, assigned_group: String(formData.get("assigned_group") || "").trim() || null, tags: splitTags(formData.get("tags")), active: checked(formData.get("active")), sort_order: Number(formData.get("sort_order") || 100), updated_at: now });
  } else if (entity === "trigger") {
    const setPriority = String(formData.get("set_priority") || "") || null; if (setPriority && !isSupportPriority(setPriority)) throw new Error("Invalid trigger priority.");
    const key = String(formData.get("key") || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); const name = String(formData.get("name") || "").trim(); if (!key || !name) throw new Error("Trigger key and name are required.");
    const requireLocationRaw = String(formData.get("require_location") || "any");
    const requireLocation = requireLocationRaw === "true" ? true : requireLocationRaw === "false" ? false : null;
    await save("support_triggers", id, { key, name, category_contains: String(formData.get("category_contains") || "").trim() || null, source_contains: String(formData.get("source_contains") || "").trim() || null, requester_type: String(formData.get("requester_type") || "").trim() || null, require_location: requireLocation, target_group: String(formData.get("target_group") || "").trim() || null, set_priority: setPriority, add_tags: splitTags(formData.get("add_tags")), active: checked(formData.get("active")), sort_order: Number(formData.get("sort_order") || 100), updated_at: now });
  } else if (entity === "automation") {
    const ruleType = String(formData.get("rule_type") || ""); if (!["auto_close_resolved","waiting_reminder"].includes(ruleType)) throw new Error("Invalid automation type.");
    const key = String(formData.get("key") || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); const name = String(formData.get("name") || "").trim(); if (!key || !name) throw new Error("Automation key and name are required.");
    await save("support_automation_rules", id, { key, name, rule_type: ruleType, minutes_after: positive(formData.get("minutes_after")), enabled: checked(formData.get("enabled")), config: ruleType === "waiting_reminder" ? { status: String(formData.get("status") || "waiting_on_customer") } : {}, updated_at: now });
  } else throw new Error("Unsupported support setting.");
  refresh();
}
