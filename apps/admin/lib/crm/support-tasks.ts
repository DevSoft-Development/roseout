import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export async function createSupportFollowupTask(input: {
  ticketId: string;
  title: string;
  description: string;
  priority: string;
  locationId?: string | null;
  actorUserId: string;
}) {
  const db = getAdminDatabaseClient();
  const { data, error } = await db.from("crm_tasks").insert({
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim() || null,
    queue_key: "support",
    task_type: "follow_up",
    priority: String(input.priority || "normal"),
    location_id: input.locationId || null,
    source: "support_ticket",
    source_record_id: input.ticketId,
    created_by: input.actorUserId,
  }).select("*").single();
  if (error) throw error;
  const { error: historyError } = await db.from("crm_task_history").insert({
    task_id: data.id,
    actor_user_id: input.actorUserId,
    event_type: "created",
    new_status: data.status,
    new_assignee_user_id: data.assigned_to_user_id,
    new_priority: data.priority,
    new_due_at: data.due_at,
  });
  if (historyError) throw historyError;
  return data;
}
