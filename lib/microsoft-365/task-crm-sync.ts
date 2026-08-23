import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { microsoftGraphFetch } from "./graph";

type TaskDirection = "microsoft_to_theouthaven" | "theouthaven_to_microsoft" | "two_way";

type TaskPreferences = {
  task_sync_enabled: boolean;
  task_sync_direction: TaskDirection;
  task_link_to_crm: boolean;
};

type TodoRow = {
  id: string;
  user_id: string;
  provider_list_id: string;
  provider_task_id: string;
  title: string;
  body_text: string | null;
  status: string | null;
  importance: string | null;
  due_at: string | null;
  reminder_at: string | null;
  completed_at: string | null;
  matched_crm_task_id: string | null;
  graph_last_modified_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CrmTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  reminder_at: string | null;
  completed_at: string | null;
  assigned_to_user_id: string | null;
  source: string | null;
  source_record_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  version: number;
  archived_at: string | null;
};

type GraphTask = {
  id: string;
  title?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  status?: string | null;
  importance?: string | null;
  dueDateTime?: { dateTime?: string | null; timeZone?: string | null } | null;
  reminderDateTime?: { dateTime?: string | null; timeZone?: string | null } | null;
  completedDateTime?: { dateTime?: string | null; timeZone?: string | null } | null;
  lastModifiedDateTime?: string | null;
};

const CRM_TODO_LIST_NAME = "TheOutHaven CRM";

function stripHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
}

function graphStatusToCrm(status: string | null | undefined) {
  if (status === "completed") return "completed";
  if (status === "inProgress") return "in_progress";
  if (status === "waitingOnOthers") return "blocked";
  if (status === "deferred") return "blocked";
  return "open";
}

function crmStatusToGraph(status: string) {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "inProgress";
  if (status === "blocked") return "waitingOnOthers";
  if (status === "cancelled") return "deferred";
  return "notStarted";
}

function graphImportanceToCrm(value: string | null | undefined) {
  return value === "high" ? "high" : value === "low" ? "low" : "normal";
}

function crmPriorityToGraph(value: string) {
  return value === "urgent" || value === "high" ? "high" : value === "low" ? "low" : "normal";
}

function sourceRecordId(row: Pick<TodoRow, "provider_list_id" | "provider_task_id">) {
  return `todo:${row.provider_list_id}:${row.provider_task_id}`;
}

function timeValue(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sameInstant(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) return true;
  return timeValue(left) === timeValue(right);
}

function graphDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { dateTime: date.toISOString().replace(/Z$/, ""), timeZone: "UTC" };
}

async function getTaskPreferences(userId: string): Promise<TaskPreferences> {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_sync_preferences")
    .select("task_sync_enabled,task_sync_direction,task_link_to_crm")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    task_sync_enabled: data?.task_sync_enabled ?? true,
    task_sync_direction: (data?.task_sync_direction || "two_way") as TaskDirection,
    task_link_to_crm: data?.task_link_to_crm ?? true,
  };
}

function historyEvent(before: CrmTaskRow, next: { status: string; priority: string; due_at: string | null }) {
  if (before.status !== next.status) return "status_changed";
  if (before.priority !== next.priority) return "priority_changed";
  if (!sameInstant(before.due_at, next.due_at)) return "due_date_changed";
  return "updated";
}

async function createCrmTaskForTodo(userId: string, row: TodoRow) {
  const recordId = sourceRecordId(row);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_tasks")
    .select("id,title,description,status,priority,due_at,reminder_at,completed_at,assigned_to_user_id,source,source_record_id,metadata,updated_at,version,archived_at")
    .eq("source", "microsoft_365")
    .eq("source_record_id", recordId)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing as CrmTaskRow;

  const status = graphStatusToCrm(row.status);
  const priority = graphImportanceToCrm(row.importance);
  const completedAt = status === "completed" ? (row.completed_at || row.graph_last_modified_at || new Date().toISOString()) : null;
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .insert({
      title: row.title || "Untitled Microsoft To Do task",
      description: stripHtml(row.body_text) || null,
      task_type: "internal",
      status,
      priority,
      assigned_to_user_id: userId,
      assigned_by: userId,
      created_by: userId,
      due_at: row.due_at,
      reminder_at: row.reminder_at,
      completed_at: completedAt,
      completed_by: completedAt ? userId : null,
      source: "microsoft_365",
      source_record_id: recordId,
      queue_key: "general",
      category: "microsoft_365",
      subtype: "todo",
      last_assigned_at: now,
      last_status_changed_at: now,
      metadata: {
        microsoft_365: {
          provider_list_id: row.provider_list_id,
          provider_task_id: row.provider_task_id,
          list_name: row.metadata?.list_name || null,
        },
      },
    })
    .select("id,title,description,status,priority,due_at,reminder_at,completed_at,assigned_to_user_id,source,source_record_id,metadata,updated_at,version,archived_at")
    .single();
  if (error || !data?.id) throw error || new Error("M365_CRM_TASK_CREATE_FAILED");

  await supabaseAdmin.from("crm_task_history").insert({
    task_id: data.id,
    actor_user_id: userId,
    event_type: "created",
    new_status: status,
    new_assignee_user_id: userId,
    new_priority: priority,
    new_due_at: row.due_at,
    metadata: { source: "microsoft_365", provider_task_id: row.provider_task_id },
  });

  return data as CrmTaskRow;
}

async function updateCrmTaskFromTodo(userId: string, crm: CrmTaskRow, row: TodoRow) {
  const graphModified = timeValue(row.graph_last_modified_at);
  if (!graphModified || graphModified <= timeValue(crm.updated_at)) return crm;

  const status = graphStatusToCrm(row.status);
  const priority = graphImportanceToCrm(row.importance);
  const completedAt = status === "completed" ? (row.completed_at || row.graph_last_modified_at || new Date().toISOString()) : null;
  const updatedAt = row.graph_last_modified_at || new Date().toISOString();
  const patch = {
    title: row.title || "Untitled Microsoft To Do task",
    description: stripHtml(row.body_text) || null,
    status,
    priority,
    due_at: row.due_at,
    reminder_at: row.reminder_at,
    completed_at: completedAt,
    completed_by: completedAt ? userId : null,
    updated_at: updatedAt,
    version: crm.version + 1,
    ...(status !== crm.status ? { last_status_changed_at: updatedAt } : {}),
  };
  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .update(patch)
    .eq("id", crm.id)
    .eq("version", crm.version)
    .select("id,title,description,status,priority,due_at,reminder_at,completed_at,assigned_to_user_id,source,source_record_id,metadata,updated_at,version,archived_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return crm;

  await supabaseAdmin.from("crm_task_history").insert({
    task_id: crm.id,
    actor_user_id: userId,
    event_type: historyEvent(crm, patch),
    previous_status: crm.status,
    new_status: status,
    previous_assignee_user_id: crm.assigned_to_user_id,
    new_assignee_user_id: userId,
    previous_priority: crm.priority,
    new_priority: priority,
    previous_due_at: crm.due_at,
    new_due_at: row.due_at,
    reason: "Synced from Microsoft To Do",
    metadata: { source: "microsoft_365", provider_task_id: row.provider_task_id },
  });

  return data as CrmTaskRow;
}

async function linkMicrosoftTasksIntoCrm(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_todo_tasks")
    .select("id,user_id,provider_list_id,provider_task_id,title,body_text,status,importance,due_at,reminder_at,completed_at,matched_crm_task_id,graph_last_modified_at,metadata")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  let created = 0;
  let updated = 0;
  for (const raw of data || []) {
    const row = raw as TodoRow;
    let crm: CrmTaskRow | null = null;
    if (row.matched_crm_task_id) {
      const { data: linked, error: linkedError } = await supabaseAdmin
        .from("crm_tasks")
        .select("id,title,description,status,priority,due_at,reminder_at,completed_at,assigned_to_user_id,source,source_record_id,metadata,updated_at,version,archived_at")
        .eq("id", row.matched_crm_task_id)
        .maybeSingle();
      if (linkedError) throw linkedError;
      if (linked && !linked.archived_at) crm = linked as CrmTaskRow;
    }

    if (!crm) {
      crm = await createCrmTaskForTodo(userId, row);
      created += 1;
      const { error: linkError } = await supabaseAdmin
        .from("microsoft_365_todo_tasks")
        .update({ matched_crm_task_id: crm.id, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (linkError) throw linkError;
    } else {
      const beforeVersion = crm.version;
      crm = await updateCrmTaskFromTodo(userId, crm, row);
      if (crm.version !== beforeVersion) updated += 1;
    }
  }
  return { created, updated };
}

async function ensureCrmTodoList(userId: string) {
  const lists = await microsoftGraphFetch<{ value?: Array<{ id?: string; displayName?: string }> }>(userId, "/me/todo/lists?$top=100");
  const existing = (lists.value || []).find((list) => list.displayName === CRM_TODO_LIST_NAME && list.id);
  if (existing?.id) return existing.id;
  const created = await microsoftGraphFetch<{ id: string }>(userId, "/me/todo/lists", {
    method: "POST",
    body: JSON.stringify({ displayName: CRM_TODO_LIST_NAME }),
  });
  if (!created?.id) throw new Error("M365_TODO_LIST_CREATE_FAILED");
  return created.id;
}

function graphTaskPayload(crm: CrmTaskRow) {
  return {
    title: crm.title,
    body: { contentType: "html", content: escapeHtml(crm.description) || "" },
    status: crmStatusToGraph(crm.status),
    importance: crmPriorityToGraph(crm.priority),
    dueDateTime: graphDateTime(crm.due_at),
    reminderDateTime: graphDateTime(crm.reminder_at),
    isReminderOn: Boolean(crm.reminder_at),
  };
}

function stagingMatchesCrm(row: TodoRow, crm: CrmTaskRow) {
  return row.title === crm.title
    && stripHtml(row.body_text) === stripHtml(crm.description)
    && (row.status || "notStarted") === crmStatusToGraph(crm.status)
    && (row.importance || "normal") === crmPriorityToGraph(crm.priority)
    && sameInstant(row.due_at, crm.due_at)
    && sameInstant(row.reminder_at, crm.reminder_at);
}

async function persistGraphTaskMapping(userId: string, listId: string, graph: GraphTask, crm: CrmTaskRow) {
  const { error } = await supabaseAdmin.from("microsoft_365_todo_tasks").upsert({
    user_id: userId,
    provider_list_id: listId,
    provider_task_id: graph.id,
    title: graph.title || crm.title,
    body_text: graph.body?.content || crm.description || null,
    status: graph.status || crmStatusToGraph(crm.status),
    importance: graph.importance || crmPriorityToGraph(crm.priority),
    due_at: crm.due_at,
    reminder_at: crm.reminder_at,
    completed_at: crm.completed_at,
    matched_crm_task_id: crm.id,
    graph_last_modified_at: graph.lastModifiedDateTime || new Date().toISOString(),
    metadata: { list_name: CRM_TODO_LIST_NAME, source: "theouthaven_crm" },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider_list_id,provider_task_id" });
  if (error) throw error;
}

async function pushCrmTasksToMicrosoft(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("crm_tasks")
    .select("id,title,description,status,priority,due_at,reminder_at,completed_at,assigned_to_user_id,source,source_record_id,metadata,updated_at,version,archived_at")
    .eq("assigned_to_user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) throw error;

  let created = 0;
  let updated = 0;
  let crmListId: string | null = null;
  for (const raw of data || []) {
    const crm = raw as CrmTaskRow;
    const { data: mapped, error: mappedError } = await supabaseAdmin
      .from("microsoft_365_todo_tasks")
      .select("id,user_id,provider_list_id,provider_task_id,title,body_text,status,importance,due_at,reminder_at,completed_at,matched_crm_task_id,graph_last_modified_at,metadata")
      .eq("user_id", userId)
      .eq("matched_crm_task_id", crm.id)
      .maybeSingle();
    if (mappedError) throw mappedError;

    if (mapped) {
      const row = mapped as TodoRow;
      if (stagingMatchesCrm(row, crm)) continue;
      const graph = await microsoftGraphFetch<GraphTask>(
        userId,
        `/me/todo/lists/${encodeURIComponent(row.provider_list_id)}/tasks/${encodeURIComponent(row.provider_task_id)}`,
        { method: "PATCH", body: JSON.stringify(graphTaskPayload(crm)) },
      );
      await persistGraphTaskMapping(userId, row.provider_list_id, graph, crm);
      updated += 1;
      continue;
    }

    if (!crmListId) crmListId = await ensureCrmTodoList(userId);
    const graph = await microsoftGraphFetch<GraphTask>(userId, `/me/todo/lists/${encodeURIComponent(crmListId)}/tasks`, {
      method: "POST",
      body: JSON.stringify(graphTaskPayload(crm)),
    });
    await persistGraphTaskMapping(userId, crmListId, graph, crm);
    created += 1;
  }
  return { created, updated };
}

export async function syncMicrosoft365TasksWithCrm(userId: string) {
  const prefs = await getTaskPreferences(userId);
  if (!prefs.task_sync_enabled || !prefs.task_link_to_crm) {
    return { inbound: { created: 0, updated: 0 }, outbound: { created: 0, updated: 0 } };
  }

  const inbound = prefs.task_sync_direction === "theouthaven_to_microsoft"
    ? { created: 0, updated: 0 }
    : await linkMicrosoftTasksIntoCrm(userId);
  const outbound = prefs.task_sync_direction === "microsoft_to_theouthaven"
    ? { created: 0, updated: 0 }
    : await pushCrmTasksToMicrosoft(userId);

  return { inbound, outbound };
}
