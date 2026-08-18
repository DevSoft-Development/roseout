"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createTask } from "@/lib/crm/tasks/service";
import {
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  addCanonicalSupportMessage,
  assignCanonicalSupportTicket,
  isSupportPriority,
  isSupportStatus,
  markCanonicalSupportEscalated,
  updateCanonicalSupportPriority,
  updateCanonicalSupportStatus,
} from "@/lib/support/canonical";

function refresh(ticketId: string) {
  revalidatePath(`/admin/dashboard/crm/support/${ticketId}`);
  revalidatePath("/admin/dashboard/crm/support");
  revalidatePath("/admin/dashboard/support");
  revalidatePath("/admin/dashboard/team/support-work");
}

export async function supportCaseAction(formData: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const operation = String(formData.get("operation") || "").trim();
  if (!ticketId) throw new Error("Ticket is required.");

  if (operation === "assign_self") {
    await assignCanonicalSupportTicket(ticketId, {
      userId: actor.user_id,
      email: actor.email || null,
      name: actor.full_name || actor.email || "Support agent",
      actorUserId: actor.user_id,
    });
  } else if (operation === "unassign") {
    await assignCanonicalSupportTicket(ticketId, { actorUserId: actor.user_id });
  } else if (operation === "status") {
    const status = String(formData.get("status") || "");
    if (!isSupportStatus(status)) throw new Error(`Unsupported status. Use one of: ${SUPPORT_STATUSES.join(", ")}`);
    await updateCanonicalSupportStatus(ticketId, status, actor.user_id);
  } else if (operation === "priority") {
    const priority = String(formData.get("priority") || "");
    if (!isSupportPriority(priority)) throw new Error(`Unsupported priority. Use one of: ${SUPPORT_PRIORITIES.join(", ")}`);
    await updateCanonicalSupportPriority(ticketId, priority, actor.user_id);
  } else if (operation === "internal_note" || operation === "reply") {
    await addCanonicalSupportMessage({
      ticketId,
      body: String(formData.get("body") || ""),
      actorUserId: actor.user_id,
      actorName: actor.full_name || actor.email || "TheOutHaven Support",
      actorEmail: actor.email || null,
      internalNote: operation === "internal_note",
      senderRole: "admin",
    });
  } else if (operation === "escalate") {
    await markCanonicalSupportEscalated(ticketId, actor.user_id);
  } else if (operation === "resolve") {
    await updateCanonicalSupportStatus(ticketId, "resolved", actor.user_id);
  } else if (operation === "reopen") {
    await updateCanonicalSupportStatus(ticketId, "reopened", actor.user_id);
  } else if (operation === "create_task") {
    const locationId = String(formData.get("location_id") || "").trim() || null;
    await createTask({
      title: String(formData.get("title") || `Follow up on support ticket ${ticketId}`),
      description: String(formData.get("description") || `Created from support ticket ${ticketId}`),
      queue_key: "support",
      task_type: "follow_up",
      priority: String(formData.get("task_priority") || "normal"),
      location_id: locationId,
      source: "support_ticket",
      source_record_id: ticketId,
    }, actor);
    await addCanonicalSupportMessage({
      ticketId,
      body: "CRM follow-up task created from this support case.",
      actorUserId: actor.user_id,
      actorName: actor.full_name || actor.email || "TheOutHaven Support",
      actorEmail: actor.email || null,
      internalNote: true,
      senderRole: "admin",
    });
  } else {
    throw new Error("Unsupported support action.");
  }

  refresh(ticketId);
}
