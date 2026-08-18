import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const SUPPORT_STATUSES = [
  "new",
  "open",
  "pending",
  "waiting_on_customer",
  "waiting_on_internal",
  "escalated",
  "resolved",
  "closed",
  "reopened",
] as const;

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export function isSupportStatus(value: unknown): value is SupportStatus {
  return SUPPORT_STATUSES.includes(String(value || "") as SupportStatus);
}

export function isSupportPriority(value: unknown): value is SupportPriority {
  return SUPPORT_PRIORITIES.includes(String(value || "") as SupportPriority);
}

export function normalizeSupportStatus(value: unknown): SupportStatus {
  const raw = String(value || "open").trim().toLowerCase();
  if (raw === "waiting") return "waiting_on_customer";
  if (raw === "complete" || raw === "completed") return "resolved";
  return isSupportStatus(raw) ? raw : "open";
}

export async function getCanonicalSupportTicket(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();
  if (error) throw error;
  return data;
}

async function appendSystemEvent(ticketId: string, body: string, metadata: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    actor_type: "system",
    sender_role: "system",
    author_name: "TheOutHaven Support",
    body,
    message: body,
    internal_note: true,
    metadata,
    created_at: now,
  });
  if (error) throw error;
}

export async function updateCanonicalSupportStatus(ticketId: string, status: SupportStatus, actorUserId?: string | null) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
    last_message_at: now,
  };
  if (status === "resolved") patch.resolved_at = now;
  if (status === "closed") patch.closed_at = now;
  if (status === "reopened") patch.reopened_at = now;
  if (status !== "closed") patch.closed_at = null;

  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw error;

  await appendSystemEvent(ticketId, `Ticket status changed to ${status.replaceAll("_", " ")}.`, {
    event: "status_changed",
    status,
    actor_user_id: actorUserId || null,
  });
  return data;
}

export async function updateCanonicalSupportPriority(ticketId: string, priority: SupportPriority, actorUserId?: string | null) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .update({ priority, updated_at: now })
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw error;
  await appendSystemEvent(ticketId, `Priority changed to ${priority}.`, {
    event: "priority_changed",
    priority,
    actor_user_id: actorUserId || null,
  });
  return data;
}

export async function assignCanonicalSupportTicket(ticketId: string, input: { userId?: string | null; email?: string | null; name?: string | null; actorUserId?: string | null }) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
    assigned_to: input.userId || null,
    assigned_admin_email: input.email || null,
    assigned_admin_name: input.name || null,
  };
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw error;
  await appendSystemEvent(ticketId, input.email ? `Ticket assigned to ${input.name || input.email}.` : "Ticket unassigned.", {
    event: "assignment_changed",
    assigned_to: input.userId || null,
    assigned_email: input.email || null,
    actor_user_id: input.actorUserId || null,
  });
  return data;
}

export async function addCanonicalSupportMessage(input: {
  ticketId: string;
  body: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  internalNote?: boolean;
  senderRole?: string;
}) {
  const body = String(input.body || "").trim();
  if (!body) throw new Error("Message is required.");
  const now = new Date().toISOString();
  const senderRole = input.senderRole || "admin";
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: input.ticketId,
      actor_type: senderRole === "admin" ? "admin" : senderRole,
      sender_user_id: input.actorUserId || null,
      sender_role: senderRole,
      author_name: input.actorName || null,
      author_email: input.actorEmail || null,
      body,
      message: body,
      internal_note: Boolean(input.internalNote),
      direction: input.internalNote ? "internal" : "outbound",
      created_by: input.actorUserId || null,
      created_at: now,
    })
    .select("*")
    .single();
  if (error) throw error;

  const ticketPatch: Record<string, unknown> = { updated_at: now, last_message_at: now };
  if (!input.internalNote) {
    ticketPatch.status = "waiting_on_customer";
    ticketPatch.first_response_at = now;
  }
  await supabaseAdmin.from("support_tickets").update(ticketPatch).eq("id", input.ticketId);
  return data;
}

export async function markCanonicalSupportEscalated(ticketId: string, actorUserId?: string | null) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .update({ status: "escalated", updated_at: now, last_message_at: now, metadata: { support_escalated: true, escalated_at: now } })
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw error;
  await appendSystemEvent(ticketId, "Ticket escalated for additional attention.", {
    event: "escalated",
    actor_user_id: actorUserId || null,
  });
  return data;
}
