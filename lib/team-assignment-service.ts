import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { assignLocationsToWorkspaceUser } from "@/lib/team-tools";
import {
  assignmentScopeSummary,
  buildAssignmentTaskTitle,
  cleanAssignmentFilter,
  normalizeAssignmentWorkType,
  queueForAssignmentWorkType,
  type TeamAssignmentFilters,
} from "@/lib/team-assignment-utils";

const LOCATION_COLUMNS = "id,name,location_name,restaurant_name,activity_name,address,city,state,borough,neighborhood,market,category,location_type,updated_at";

export type AssignmentFacets = {
  markets: string[];
  cities: string[];
  boroughs: string[];
  neighborhoods: string[];
  states: string[];
};

function displayName(row: any) {
  return row.name || row.location_name || row.restaurant_name || row.activity_name || "Untitled location";
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export async function getAssignmentFacets(): Promise<AssignmentFacets> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("market,city,state,borough,neighborhood")
    .order("city")
    .limit(5000);
  if (error) throw new Error("Could not load assignment areas.");
  const rows = data || [];
  return {
    markets: unique(rows.map((row: any) => row.market)),
    cities: unique(rows.map((row: any) => row.city)),
    boroughs: unique(rows.map((row: any) => row.borough)),
    neighborhoods: unique(rows.map((row: any) => row.neighborhood)),
    states: unique(rows.map((row: any) => row.state)),
  };
}

export async function searchAssignmentLocations(filters: TeamAssignmentFilters) {
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
  let query = supabaseAdmin.from("locations").select(LOCATION_COLUMNS, { count: "exact" });

  const exactFilters: Array<[keyof TeamAssignmentFilters, string]> = [
    ["market", "market"],
    ["city", "city"],
    ["borough", "borough"],
    ["neighborhood", "neighborhood"],
    ["state", "state"],
  ];
  for (const [input, column] of exactFilters) {
    const value = cleanAssignmentFilter(filters[input]);
    if (value) query = query.eq(column, value);
  }

  const town = cleanAssignmentFilter(filters.town);
  if (town) query = query.eq("city", town);

  const q = cleanAssignmentFilter(filters.q);
  if (q) {
    const escaped = q.replace(/[%_,]/g, " ");
    query = query.or([
      `name.ilike.%${escaped}%`,
      `location_name.ilike.%${escaped}%`,
      `restaurant_name.ilike.%${escaped}%`,
      `activity_name.ilike.%${escaped}%`,
      `address.ilike.%${escaped}%`,
      `city.ilike.%${escaped}%`,
      `borough.ilike.%${escaped}%`,
      `neighborhood.ilike.%${escaped}%`,
      `market.ilike.%${escaped}%`,
    ].join(","));
  }

  const { data, error, count } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Could not search assignment locations.");
  return {
    locations: (data || []).map((row: any) => ({ ...row, display_name: displayName(row) })),
    count: count || 0,
    limited: (count || 0) > limit,
    scope: assignmentScopeSummary(filters),
  };
}

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

async function saveAssignmentTask({
  assignmentId,
  location,
  member,
  input,
  workType,
}: {
  assignmentId: string;
  location: any;
  member: any;
  input: CreateTeamAssignmentInput;
  workType: ReturnType<typeof normalizeAssignmentWorkType>;
}) {
  const now = new Date().toISOString();
  const source = "team_location_assignment";
  const taskType = workType;
  const values = {
    location_id: location.id,
    title: buildAssignmentTaskTitle(workType, displayName(location)),
    description: input.notes || input.reason || assignmentScopeSummary(input.scope || {}),
    task_type: taskType,
    queue_key: queueForAssignmentWorkType(workType),
    status: "open",
    priority: input.priority || "normal",
    assigned_to_user_id: member.user_id,
    assigned_team: member.team_type || null,
    assigned_by: input.assignedBy,
    assignment_reason: input.reason || assignmentScopeSummary(input.scope || {}),
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

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_tasks")
    .select("id,assigned_to_user_id,priority,due_at")
    .eq("source", source)
    .eq("source_record_id", assignmentId)
    .eq("task_type", taskType)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) throw new Error("Could not check the existing My Work task.");

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from("crm_tasks")
      .update(values)
      .eq("id", existing.id)
      .select("id,location_id,assigned_to_user_id,title,status,due_at")
      .single();
    if (error) throw new Error("Could not update the My Work task.");
    await supabaseAdmin.from("crm_task_history").insert({
      task_id: data.id,
      actor_user_id: input.assignedBy,
      event_type: existing.assigned_to_user_id === member.user_id ? "updated" : "reassigned",
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

  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .insert({ ...values, created_by: input.assignedBy, created_at: now })
    .select("id,location_id,assigned_to_user_id,title,status,due_at")
    .single();
  if (error) throw new Error("Could not create the My Work task.");

  const { data: history } = await supabaseAdmin.from("crm_task_history").insert({
    task_id: data.id,
    actor_user_id: input.assignedBy,
    event_type: "assigned",
    new_assignee_user_id: member.user_id,
    new_priority: input.priority || "normal",
    new_due_at: input.dueAt || null,
    reason: input.reason || assignmentScopeSummary(input.scope || {}),
    metadata: { source: "team_assignments", location_id: location.id },
  }).select("id").maybeSingle();

  await supabaseAdmin.from("crm_task_notifications").insert({
    task_id: data.id,
    recipient_user_id: member.user_id,
    notification_type: "assigned",
    title: `New assignment: ${data.title}`,
    body: input.notes || input.reason || assignmentScopeSummary(input.scope || {}),
    source_event_id: history?.id || null,
  });

  return data;
}

export async function createTeamAssignmentsAndTasks(input: CreateTeamAssignmentInput) {
  const locationIds = Array.from(new Set((input.locationIds || []).map(String).filter(Boolean)));
  if (!locationIds.length) throw new Error("Select at least one location.");
  if (locationIds.length > 500) throw new Error("A single assignment is limited to 500 locations.");

  const { data: member, error: memberError } = await supabaseAdmin
    .from("team_member_profiles")
    .select("id,user_id,team_type,status")
    .eq("id", input.assignedTo)
    .in("status", ["active", "training"])
    .single();
  if (memberError || !member?.user_id) throw new Error("Choose an active team member.");

  const { data: locations, error: locationsError } = await supabaseAdmin
    .from("locations")
    .select("id,name,location_name,restaurant_name,activity_name,city,state,market")
    .in("id", locationIds);
  if (locationsError || !locations?.length) throw new Error("The selected locations could not be loaded.");
  if (locations.length !== locationIds.length) throw new Error("One or more selected locations are unavailable.");

  const workType = normalizeAssignmentWorkType(input.workType);
  const assignment = await assignLocationsToWorkspaceUser(locationIds, member.id, {
    assignedBy: input.assignedBy,
    assignmentType: workType,
    campaign: input.campaign || "team_assignment",
    priority: input.priority || "normal",
    reason: input.reason || assignmentScopeSummary(input.scope || {}),
    notes: input.notes || null,
    nextActionType: workType,
    nextActionNote: input.notes || null,
    nextActionDueAt: input.dueAt || null,
  });

  const assignmentByLocation = new Map((assignment.rows || []).map((row: any) => [String(row.location_id), String(row.id)]));
  const tasks = [];
  for (const location of locations) {
    const assignmentId = assignmentByLocation.get(String(location.id));
    if (!assignmentId) throw new Error("An assignment record was not returned for one of the locations.");
    tasks.push(await saveAssignmentTask({ assignmentId, location, member, input, workType }));
  }

  return {
    success: true,
    assignedCount: assignment.count,
    taskCount: tasks.length,
    assignedUserId: member.user_id,
    myWorkHref: "/admin/dashboard/crm/my-work?view=my-queue",
  };
}
