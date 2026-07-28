"use server";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createOpportunity, transitionStage } from "@/lib/crm/opportunities";
import type { PipelineKey } from "@/lib/crm/pipelines";
export async function createOpportunityAction(form: FormData) { const actor = await requireAdminRole(CRM_WRITE_ROLES); const row = await createOpportunity({ account_id: String(form.get("account_id") ?? ""), name: String(form.get("name") ?? ""), pipeline_key: String(form.get("pipeline_key") ?? "reserve_pro") as PipelineKey, amount: Number(form.get("amount")) || null, expected_close_date: String(form.get("expected_close_date") ?? "") || null, owner_user_id: actor.user_id }, actor); redirect(`/admin/dashboard/crm/opportunities/${row.id}`); }
export async function transitionOpportunityAction(form: FormData) { const actor = await requireAdminRole(CRM_WRITE_ROLES); const id = String(form.get("id")); await transitionStage(id, Number(form.get("version")), String(form.get("stage")), actor, { override: form.get("override") === "true", reason: String(form.get("reason") ?? "") || undefined }); redirect(`/admin/dashboard/crm/opportunities/${id}`); }
