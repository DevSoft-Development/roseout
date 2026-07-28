"use server";import { revalidatePath } from "next/cache";import { requireAdminRole } from "@/lib/admin-auth";import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";import { updateTaskStatus } from "@/lib/crm/tasks";
export async function completeTaskAction(form:FormData){const actor=await requireAdminRole(CRM_WRITE_ROLES);await updateTaskStatus(String(form.get("id")),"completed",actor,String(form.get("notes")||""));revalidatePath("/admin/dashboard/crm/work-queue")}

