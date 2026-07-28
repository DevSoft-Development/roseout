"use server";
import { revalidatePath } from "next/cache";import { redirect } from "next/navigation";import { requireAdminRole } from "@/lib/admin-auth";import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";import { createAccount } from "@/lib/crm/accounts";
export async function createAccountAction(form:FormData){const actor=await requireAdminRole(CRM_WRITE_ROLES);const account=await createAccount({name:String(form.get("name")||""),accountType:String(form.get("account_type")||"independent_business"),lifecycleStage:String(form.get("lifecycle_stage")||"prospect")},actor);revalidatePath("/admin/dashboard/crm/accounts");redirect(`/admin/dashboard/crm/accounts/${account.id}`)}

