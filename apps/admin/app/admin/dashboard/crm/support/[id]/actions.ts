"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createSupportFollowupTask } from "@/lib/crm/support-tasks";
import { replyToSupportCustomer } from "@/lib/support/replies";
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
import {
  addSupportTags,
  getSupportMacro,
  setSupportGroup,
  setSupportTags,
  validateMacroPriority,
  validateMacroStatus,
} from "@/lib/support/operations";

function refresh(id: string) {
  revalidatePath(`/admin/dashboard/crm/support/${id}`);
  revalidatePath("/admin/dashboard/crm/support");
  revalidatePath("/admin/dashboard/support");
  revalidatePath("/admin/dashboard/team/support-work");
}

async function replyToCustomer(ticketId: string, body: string, actor: any) {
  return replyToSupportCustomer({
    ticketId,
    body,
    actorUserId: actor.user_id,
    authorName: actor.full_name || actor.email || "TheOutHaven Support",
    authorEmail: actor.email || null,
  });
}

export async function supportCaseAction(formData: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const actorAny = actor as any;
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const operation = String(formData.get("operation") || "").trim();
  if (!ticketId) throw new Error("Ticket is required.");

  if (operation === "assign_self") {
    await assignCanonicalSupportTicket(ticketId, {
      userId: actorAny.user_id,
      email: actorAny.email || null,
      name: actorAny.full_name || actorAny.email || "Support agent",
      actorUserId: actorAny.user_id,
    });
  } else if (operation === "unassign") {
    await assignCanonicalSupportTicket(ticketId, { actorUserId: actorAny.user_id });
  } else if (operation === "group") {
    await setSupportGroup(ticketId, String(formData.get("group") || "") || null);
  } else if (operation === "tags") {
    await setSupportTags(ticketId, String(formData.get("tags") || "").split(","));
  } else if (operation === "status") {
    const status = String(formData.get("status") || "");
    if (!isSupportStatus(status)) {
      throw new Error(`Unsupported status. Use one of: ${SUPPORT_STATUSES.join(", ")}`);
    }
    await updateCanonicalSupportStatus(ticketId, status, actorAny.user_id);
  } else if (operation === "priority") {
    const priority = String(formData.get("priority") || "");
    if (!isSupportPriority(priority)) {
      throw new Error(`Unsupported priority. Use one of: ${SUPPORT_PRIORITIES.join(", ")}`);
    }
    await updateCanonicalSupportPriority(ticketId, priority, actorAny.user_id);
  } else if (operation === "reply") {
    await replyToCustomer(ticketId, String(formData.get("body") || ""), actorAny);
  } else if (operation === "internal_note") {
    await addCanonicalSupportMessage({
      ticketId,
      body: String(formData.get("body") || ""),
      actorUserId: actorAny.user_id,
      actorName: actorAny.full_name || actorAny.email || "TheOutHaven Support",
      actorEmail: actorAny.email || null,
      internalNote: true,
      senderRole: "admin",
    });
  } else if (operation === "macro") {
    const macro = await getSupportMacro(String(formData.get("macro_key") || ""));
    if (macro.body) await replyToCustomer(ticketId, macro.body, actorAny);
    const status = validateMacroStatus(macro.set_status);
    const priority = validateMacroPriority(macro.set_priority);
    if (status) await updateCanonicalSupportStatus(ticketId, status, actorAny.user_id);
    if (priority) await updateCanonicalSupportPriority(ticketId, priority, actorAny.user_id);
    if (macro.assigned_group) await setSupportGroup(ticketId, macro.assigned_group);
    if (macro.tags?.length) await addSupportTags(ticketId, macro.tags);
  } else if (operation === "escalate") {
    await markCanonicalSupportEscalated(ticketId, actorAny.user_id);
  } else if (operation === "resolve") {
    await updateCanonicalSupportStatus(ticketId, "resolved", actorAny.user_id);
  } else if (operation === "reopen") {
    await updateCanonicalSupportStatus(ticketId, "reopened", actorAny.user_id);
  } else if (operation === "create_task") {
    await createSupportFollowupTask({
      ticketId,
      title: String(formData.get("title") || `Follow up on support ticket ${ticketId}`),
      description: String(formData.get("description") || `Created from support ticket ${ticketId}`),
      priority: String(formData.get("task_priority") || "normal"),
      locationId: String(formData.get("location_id") || "").trim() || null,
      actorUserId: actorAny.user_id,
    });
    await addCanonicalSupportMessage({
      ticketId,
      body: "CRM follow-up task created from this support case.",
      actorUserId: actorAny.user_id,
      actorName: actorAny.full_name || actorAny.email || "TheOutHaven Support",
      actorEmail: actorAny.email || null,
      internalNote: true,
      senderRole: "admin",
    });
  } else {
    throw new Error("Unsupported support action.");
  }

  refresh(ticketId);
}
