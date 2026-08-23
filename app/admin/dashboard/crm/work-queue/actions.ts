"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/admin-auth";
import { getAdminOrganizationPerson } from "@/lib/admin-organization-people";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { addComment, claimTask, createTask, mutateTask } from "@/lib/crm/tasks/service";

const refresh = (id?: string) => {
  revalidatePath("/admin/dashboard/crm/work-queue");
  revalidatePath("/admin/dashboard/crm/my-work");
  revalidatePath("/admin/dashboard/crm/today");
  if (id) revalidatePath(`/admin/dashboard/crm/work-queue/${id}`);
};

async function validatedAssignee(raw: FormDataEntryValue | null) {
  const userId = String(raw || "").trim();
  if (!userId) return null;
  const person = await getAdminOrganizationPerson(userId);
  if (!person) throw new Error("Selected assignee is not an active TheOutHaven organization user.");
  return person.userId;
}

export async function taskMutationAction(form: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const id = String(form.get("id"));
  const version = Number(form.get("version"));
  const operation = String(form.get("operation"));

  if (operation === "claim") {
    await claimTask(id, version, actor);
  } else if (operation === "assign") {
    const assignee = await validatedAssignee(form.get("assigned_to_user_id"));
    await mutateTask(id, version, { assigned_to_user_id: assignee }, actor, assignee ? "Assigned from task workspace" : "Task unassigned");
  } else {
    const patches: Record<string, Record<string, unknown>> = {
      start: { status: "in_progress", started_at: new Date().toISOString() },
      block: { status: "blocked", blocked_reason: String(form.get("reason") || "Blocked") },
      unblock: { status: "in_progress", blocked_reason: null },
      escalate: {
        escalation_level: String(form.get("level") || "manager"),
        escalation_reason: String(form.get("reason") || "Operational attention required"),
        escalated_at: new Date().toISOString(),
        escalated_by: actor.user_id,
      },
      deescalate: { escalation_level: "none", escalation_reason: null, escalated_at: null, escalated_by: null },
      complete: {
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: actor.user_id,
        completion_notes: String(form.get("notes") || ""),
        resolution_summary: String(form.get("resolution_summary") || ""),
      },
      reopen: { status: "open", completed_at: null, completed_by: null },
      cancel: { status: "cancelled" },
      archive: { archived_at: new Date().toISOString() },
    };
    await mutateTask(id, version, patches[operation] || {}, actor, String(form.get("reason") || ""));
  }

  refresh(id);
}

export async function addCommentAction(form: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const id = String(form.get("id"));
  await addComment(id, String(form.get("body") || ""), [], actor);
  refresh(id);
}

export async function createTaskAction(form: FormData) {
  const actor = await requireAdminRole(CRM_WRITE_ROLES);
  const assignee = await validatedAssignee(form.get("assigned_to_user_id"));
  const task = await createTask({
    title: form.get("title"),
    description: form.get("description") || null,
    queue_key: form.get("queue_key") || "general",
    task_type: form.get("task_type") || "other",
    priority: form.get("priority") || "normal",
    due_at: form.get("due_at") || null,
    account_id: form.get("account_id") || null,
    location_id: form.get("location_id") || null,
    contact_id: form.get("contact_id") || null,
    opportunity_id: form.get("opportunity_id") || null,
    assigned_team: form.get("assigned_team") || null,
    assigned_to_user_id: assignee,
  }, actor);
  refresh();
  redirect(`/admin/dashboard/crm/work-queue/${task.id}`);
}
