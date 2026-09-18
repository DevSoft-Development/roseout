import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  assignmentScopeSummary,
  buildAssignmentTaskTitle,
  normalizeAssignmentWorkType,
  queueForAssignmentWorkType,
  type TeamAssignmentFilters,
} from "@/lib/team-assignment-utils";

export type CreateTeamAssignmentInput = {
  locationIds: string[];
  assignedTo: string;
  assignedBy: string;
  workType: string;
  priority?: string;
  dueAt?: string | null;
  reason?: string | null;
  notes?: string | null;
  campaign?: string | null;
  scope?: TeamAssignmentFilters;
};

function displayName(row: Record<string, unknown>) {
  return String(
    row.name ||
      row.location_name ||
      row.restaurant_name ||
      row.activity_name ||
      "Untitled location",
  );
}

async function saveAssignmentTask({
  assignmentId,
  location,
  member,
  input,
  workType,
}: {
  assignmentId: string;
  location: Record<string, unknown>;
  member: { user_id: string; team_type: string | null };
  input: CreateTeamAssignmentInput;
  workType: ReturnType<typeof normalizeAssignmentWorkType>;
}) {
  const adminDb = getAdminDatabaseClient();
  const now = new Date().toISOString();
  const source = "team_location_assignment";
  const values = {
    location_id: location.id,
    title: buildAssignmentTaskTitle(workType, displayName(location)),
    description:
      input.notes ||
      input.reason ||
      assignmentScopeSummary(input.scope || {}),
    task_type: workType,
    queue_key: queueForAssignmentWorkType(workType),
    status: "open",
    priority: input.priority || "normal",
    assigned_to_user_id: member.user_id,
    assigned_team: member.team_type || null,
    assigned_by: input.assignedBy,
    assignment_reason:
      input.reason || assignmentScopeSummary(input.scope || {}),
    due_at: input.dueAt || null,
    service_level_due_at: input.dueAt || null,
    last_assigned_at: now,
    source,
    source_record_id: assignmentId,
    metadata: {
      team_location_assignment_id: assignmentId,
      assignment_scope: input.scope || {},
      campaign: input.campaign || "team_assignment",
    },
    updated_at: now,
  };

  const { data: existing, error: existingError } = await adminDb
    .from("crm_tasks")
    .select("id,assigned_to_user_id,priority,due_at")
    .eq("source", source)
    .eq("source_record_id", assignmentId)
    .eq("task_type", workType)
    .is("archived_at", null)
    .maybeSingle();

  if (existingError) throw new Error("Could not check the existing My Work task.");

  if (existing?.id) {
    const { data, error } = await adminDb
      .from("crm_tasks")
      .update(values)
      .eq("id", existing.id)
      .select("id,location_id,assigned_to_user_id,title,status,due_at")
      .single();
    if (error) throw new Error("Could not update the My Work task.");

    await adminDb.from("crm_task_history").insert({
      task_id: data.id,
      actor_user_id: input.assignedBy,
      event_type:
        existing.assigned_to_user_id === member.user_id ? "updated" : "reassigned",
      previous_assignee_user_id: existing.assigned_to_user_id,
      new_assignee_user_id: member.user_id,
      previous_priority: existing.priority,
      new_priority: input.priority || "normal",
      previous_due_at: existing.due_at,
      new_due_at: input.dueAt || null,
      reason: input.reason || assignmentScopeSummary(input.scope || {}),
      metadata: { source: "team_assignments", location_id: location.id },
    });

    return data;
  }

  const { data, error } = await adminDb
    .from("crm_tasks")
    .insert({ ...values, created_by: input.assignedBy, created_at: now })
    .select("id,location_id,assigned_to_user_id,title,status,due_at")
    .single();

  if (error) throw new Error("Could not create the My Work task.");

  const { data: history } = await adminDb
    .from("crm_task_history")
    .insert({
      task_id: data.id,
      actor_user_id: input.assignedBy,
      event_type: "assigned",
      new_assignee_user_id: member.user_id,
      new_priority: input.priority || "normal",
      new_due_at: input.dueAt || null,
      reason: input.reason || assignmentScopeSummary(input.scope || {}),
      metadata: { source: "team_assignments", location_id: location.id },
    })
    .select("id")
    .maybeSingle();

  await adminDb.from("crm_task_notifications").insert({
    task_id: data.id,
    recipient_user_id: member.user_id,
    notification_type: "assigned",
    title: `New assignment: ${data.title}`,
    body:
      input.notes ||
      input.reason ||
      assignmentScopeSummary(input.scope || {}),
    source_event_id: history?.id || null,
  });

  return data;
}

async function upsertLocationAssignments(
  locationIds: string[],
  memberId: string,
  input: CreateTeamAssignmentInput,
  workType: ReturnType<typeof normalizeAssignmentWorkType>,
) {
  const adminDb = getAdminDatabaseClient();
  const now = new Date().toISOString();
  const rows: Array<{ id: string; location_id: string }> = [];

  for (const locationId of locationIds) {
    const row = {
      location_id: locationId,
      team_member_id: memberId,
      assigned_by: input.assignedBy,
      assignment_type: workType,
      priority: input.priority || "normal",
      status: "active",
      reason: input.reason || assignmentScopeSummary(input.scope || {}),
      notes: input.notes || null,
      campaign: input.campaign || "team_assignment",
      next_action_type: workType,
      next_action_note: input.notes || null,
      next_action_due_at: input.dueAt || null,
      updated_at: now,
    };

    const { data: existing, error: existingError } = await adminDb
      .from("team_location_assignments")
      .select("id")
      .eq("location_id", locationId)
      .eq("team_member_id", memberId)
      .eq("assignment_type", workType)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      const { data, error } = await adminDb
        .from("team_location_assignments")
        .update(row)
        .eq("id", existing.id)
        .select("id,location_id")
        .single();
      if (error) throw error;
      rows.push(data);
    } else {
      const { data, error } = await adminDb
        .from("team_location_assignments")
        .insert({ ...row, created_at: now })
        .select("id,location_id")
        .single();
      if (error) throw error;
      rows.push(data);
    }
  }

  return rows;
}

export async function createTeamAssignmentsAndTasks(
  input: CreateTeamAssignmentInput,
) {
  const adminDb = getAdminDatabaseClient();
  const locationIds = Array.from(
    new Set((input.locationIds || []).map(String).filter(Boolean)),
  );

  if (!locationIds.length) throw new Error("Select at least one location.");
  if (locationIds.length > 500) {
    throw new Error("A single assignment is limited to 500 locations.");
  }

  const { data: member, error: memberError } = await adminDb
    .from("team_member_profiles")
    .select("id,user_id,team_type,status")
    .eq("id", input.assignedTo)
    .in("status", ["active", "training"])
    .single();

  if (memberError || !member?.user_id) {
    throw new Error("Choose an active team member.");
  }

  const { data: locations, error: locationsError } = await adminDb
    .from("locations")
    .select("id,name,location_name,restaurant_name,activity_name,city,state,market")
    .in("id", locationIds);

  if (locationsError || !locations?.length) {
    throw new Error("The selected locations could not be loaded.");
  }

  if (locations.length !== locationIds.length) {
    throw new Error("One or more selected locations are unavailable.");
  }

  const workType = normalizeAssignmentWorkType(input.workType);
  const assignmentRows = await upsertLocationAssignments(
    locationIds,
    String(member.id),
    input,
    workType,
  );
  const assignmentByLocation = new Map(
    assignmentRows.map((row) => [String(row.location_id), String(row.id)]),
  );

  const tasks = [];
  for (const location of locations) {
    const assignmentId = assignmentByLocation.get(String(location.id));
    if (!assignmentId) {
      throw new Error(
        "An assignment record was not returned for one of the locations.",
      );
    }

    tasks.push(
      await saveAssignmentTask({
        assignmentId,
        location,
        member: {
          user_id: String(member.user_id),
          team_type: member.team_type || null,
        },
        input,
        workType,
      }),
    );
  }

  return {
    success: true,
    assignedCount: assignmentRows.length,
    taskCount: tasks.length,
    assignedUserId: member.user_id,
    myWorkHref: "/admin/dashboard/crm/my-work?view=my-queue",
  };
}
