"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_READ_ROLES } from "@/lib/crm/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function markCrmMessageNotificationRead(notificationId: string) {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("crm_message_notifications")
    .update({ read_at: now, read_by: actor.user_id })
    .eq("id", notificationId)
    .is("dismissed_at", null);

  if (error) throw error;
  revalidatePath("/admin/dashboard/crm/notifications");
}

export async function dismissCrmMessageNotification(notificationId: string) {
  const actor = await requireAdminRole(CRM_READ_ROLES);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("crm_message_notifications")
    .update({ dismissed_at: now, dismissed_by: actor.user_id })
    .eq("id", notificationId);

  if (error) throw error;
  revalidatePath("/admin/dashboard/crm/notifications");
}
