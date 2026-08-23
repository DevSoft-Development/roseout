import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchCrmByEmails, shouldIgnoreMailboxMessage } from "./matching";
import { microsoftGraphFetch } from "./graph";

type GraphCollection<T> = { value?: T[]; "@odata.nextLink"?: string };
type GraphAddress = { emailAddress?: { address?: string | null; name?: string | null } | null };
type GraphMessage = {
  id: string;
  conversationId?: string | null;
  internetMessageId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  from?: GraphAddress | null;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  isDraft?: boolean;
  hasAttachments?: boolean;
};

type SyncPreferences = {
  email_sync_enabled: boolean;
  email_sync_mode: "crm_related_only" | "all";
  include_internal_mail: boolean;
  sync_attachments: boolean;
  queue_unmatched_email: boolean;
  calendar_sync_enabled: boolean;
  task_sync_enabled: boolean;
};

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function addressOf(value: GraphAddress | null | undefined) {
  return cleanEmail(value?.emailAddress?.address);
}
function addressesOf(values: GraphAddress[] | undefined) {
  return (values || []).map(addressOf).filter(Boolean);
}
function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

async function getPreferences(userId: string): Promise<SyncPreferences> {
  const defaults: SyncPreferences = {
    email_sync_enabled: true,
    email_sync_mode: "crm_related_only",
    include_internal_mail: false,
    sync_attachments: false,
    queue_unmatched_email: true,
    calendar_sync_enabled: true,
    task_sync_enabled: true,
  };
  const { data, error } = await supabaseAdmin.from("microsoft_365_sync_preferences").select("email_sync_enabled,email_sync_mode,include_internal_mail,sync_attachments,queue_unmatched_email,calendar_sync_enabled,task_sync_enabled").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return { ...defaults, ...(data || {}) } as SyncPreferences;
}

async function getMailbox(userId: string) {
  const { data, error } = await supabaseAdmin.from("microsoft_365_connections").select("email").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data?.email) throw new Error("M365_NOT_CONNECTED");
  return cleanEmail(data.email);
}

async function getOrCreateConversation(userId: string, message: GraphMessage, match: Awaited<ReturnType<typeof matchCrmByEmails>>) {
  const providerThread = message.conversationId || message.id;
  const key = `m365:${userId}:${providerThread}`;
  const { data: existing, error: existingError } = await supabaseAdmin.from("crm_conversations").select("id").eq("conversation_key", key).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabaseAdmin.from("crm_conversations").insert({
    conversation_key: key,
    channel: "email",
    status: "open",
    subject: message.subject || "Microsoft 365 email",
    account_id: match.accountId,
    location_id: match.locationId,
    contact_id: match.contactId,
    owner_user_id: userId,
    priority: "normal",
    is_unread: false,
    unread_count: 0,
    metadata: { provider: "microsoft_graph", provider_thread_id: providerThread, matched_by: match.reason },
  }).select("id").single();
  if (error || !data?.id) throw error || new Error("M365_CONVERSATION_CREATE_FAILED");
  return data.id as string;
}

async function persistMatchedMessage(userId: string, mailboxEmail: string, message: GraphMessage, match: Awaited<ReturnType<typeof matchCrmByEmails>>) {
  const senderEmail = addressOf(message.from);
  const to = addressesOf(message.toRecipients);
  const cc = addressesOf(message.ccRecipients);
  const outbound = senderEmail === mailboxEmail;
  const conversationId = await getOrCreateConversation(userId, message, match);
  const { data: existing, error: existingError } = await supabaseAdmin.from("crm_messages").select("id").eq("provider", "microsoft_graph").eq("provider_message_id", message.id).maybeSingle();
  if (existingError) throw existingError;

  const rawBody = message.body?.content || "";
  const isHtml = String(message.body?.contentType || "").toLowerCase() === "html";
  const bodyText = isHtml ? stripHtml(rawBody) : rawBody;
  const occurredAt = outbound ? message.sentDateTime : message.receivedDateTime;
  const payload = {
    conversation_id: conversationId,
    direction: outbound ? "outbound" : "inbound",
    channel: "email",
    message_type: "email",
    sender_user_id: outbound ? userId : null,
    contact_id: match.contactId,
    subject: message.subject || null,
    body_text: bodyText || message.bodyPreview || null,
    body_html: isHtml ? rawBody : null,
    preview_text: message.bodyPreview || null,
    provider: "microsoft_graph",
    provider_message_id: message.id,
    provider_thread_id: message.conversationId || null,
    status: outbound ? "sent" : "received",
    sent_at: outbound ? (message.sentDateTime || null) : null,
    delivered_at: outbound ? null : (message.receivedDateTime || null),
    source_system: "microsoft_365",
    source_record_id: message.id,
    metadata: { from: senderEmail, to, cc, has_attachments: Boolean(message.hasAttachments), matched_by: match.reason },
    updated_at: new Date().toISOString(),
  };
  let messageId = existing?.id as string | undefined;
  if (messageId) {
    const { error } = await supabaseAdmin.from("crm_messages").update(payload).eq("id", messageId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.from("crm_messages").insert(payload).select("id").single();
    if (error || !data?.id) throw error || new Error("M365_MESSAGE_CREATE_FAILED");
    messageId = data.id;
  }

  const now = occurredAt || new Date().toISOString();
  const conversationPatch: Record<string, unknown> = { last_message_at: now, updated_at: new Date().toISOString() };
  if (outbound) conversationPatch.last_outbound_at = now;
  else {
    conversationPatch.last_inbound_at = now;
    conversationPatch.is_unread = true;
  }
  await supabaseAdmin.from("crm_conversations").update(conversationPatch).eq("id", conversationId);

  if (!existing?.id) {
    await supabaseAdmin.from("crm_activities").insert({
      account_id: match.accountId,
      location_id: match.locationId,
      contact_id: match.contactId,
      actor_user_id: outbound ? userId : null,
      activity_type: "email",
      direction: outbound ? "outbound" : "inbound",
      channel: "email",
      subject: message.subject || null,
      summary: `${outbound ? "Email sent" : "Email received"}: ${message.subject || "(no subject)"}`,
      occurred_at: now,
      source_system: "microsoft_graph",
      source_table: "crm_messages",
      source_record_id: message.id,
      visibility: "internal",
      is_system_generated: true,
      metadata: { crm_message_id: messageId, provider_thread_id: message.conversationId || null },
    });
  }
}

async function queueUnmatched(userId: string, message: GraphMessage) {
  const senderEmail = addressOf(message.from);
  const recipients = [...addressesOf(message.toRecipients), ...addressesOf(message.ccRecipients)];
  const { error } = await supabaseAdmin.from("microsoft_365_unmatched_email").upsert({
    user_id: userId,
    provider_message_id: message.id,
    provider_thread_id: message.conversationId || null,
    internet_message_id: message.internetMessageId || null,
    sender_email: senderEmail || null,
    recipient_emails: recipients,
    subject: message.subject || null,
    preview_text: message.bodyPreview || null,
    received_at: message.receivedDateTime || message.sentDateTime || null,
    status: "pending",
    metadata: { has_attachments: Boolean(message.hasAttachments) },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider_message_id" });
  if (error) throw error;
}

async function processMessage(userId: string, mailboxEmail: string, prefs: SyncPreferences, message: GraphMessage) {
  if (!message.id || message.isDraft) return;
  const senderEmail = addressOf(message.from);
  const recipients = [...addressesOf(message.toRecipients), ...addressesOf(message.ccRecipients)];
  if (shouldIgnoreMailboxMessage({ mailboxEmail, senderEmail, recipientEmails: recipients, includeInternalMail: prefs.include_internal_mail })) return;
  const counterpartEmails = senderEmail === mailboxEmail ? recipients : [senderEmail, ...recipients.filter((e) => e !== mailboxEmail)];
  const match = await matchCrmByEmails(counterpartEmails);
  if (match.reason) {
    await persistMatchedMessage(userId, mailboxEmail, message, match);
  } else if (prefs.queue_unmatched_email) {
    await queueUnmatched(userId, message);
  }
}

async function syncMail(userId: string, mailboxEmail: string, prefs: SyncPreferences) {
  if (!prefs.email_sync_enabled) return 0;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const select = "id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isDraft,hasAttachments";
  const paths = [
    `/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime%20desc&$filter=receivedDateTime%20ge%20${encodeURIComponent(since)}&$select=${select}`,
    `/me/mailFolders/sentitems/messages?$top=100&$orderby=sentDateTime%20desc&$filter=sentDateTime%20ge%20${encodeURIComponent(since)}&$select=${select}`,
  ];
  let processed = 0;
  for (const initialPath of paths) {
    let next: string | undefined = initialPath;
    let pages = 0;
    while (next && pages < 3) {
      const page = await microsoftGraphFetch<GraphCollection<GraphMessage>>(userId, next);
      for (const message of page.value || []) {
        await processMessage(userId, mailboxEmail, prefs, message);
        processed += 1;
      }
      next = page["@odata.nextLink"];
      pages += 1;
    }
  }
  return processed;
}

async function syncCalendar(userId: string, prefs: SyncPreferences) {
  if (!prefs.calendar_sync_enabled) return 0;
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  let next: string | undefined = `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=100&$select=id,changeKey,subject,bodyPreview,start,end,location,organizer,attendees,isCancelled,isAllDay,webLink,lastModifiedDateTime`;
  let count = 0;
  let pages = 0;
  while (next && pages < 5) {
    const page = await microsoftGraphFetch<GraphCollection<any>>(userId, next);
    for (const event of page.value || []) {
      const organizerEmail = cleanEmail(event.organizer?.emailAddress?.address);
      const attendeeEmails = (event.attendees || []).map((a: any) => cleanEmail(a?.emailAddress?.address)).filter(Boolean);
      const match = await matchCrmByEmails([organizerEmail, ...attendeeEmails]);
      const { error } = await supabaseAdmin.from("microsoft_365_calendar_events").upsert({
        user_id: userId,
        provider_event_id: event.id,
        provider_change_key: event.changeKey || null,
        subject: event.subject || null,
        body_preview: event.bodyPreview || null,
        starts_at: event.start?.dateTime ? new Date(`${event.start.dateTime}${/[zZ]|[+-]\d\d:\d\d$/.test(event.start.dateTime) ? "" : "Z"}`).toISOString() : null,
        ends_at: event.end?.dateTime ? new Date(`${event.end.dateTime}${/[zZ]|[+-]\d\d:\d\d$/.test(event.end.dateTime) ? "" : "Z"}`).toISOString() : null,
        start_time_zone: event.start?.timeZone || null,
        end_time_zone: event.end?.timeZone || null,
        location_name: event.location?.displayName || null,
        organizer_email: organizerEmail || null,
        attendee_emails: attendeeEmails,
        is_cancelled: Boolean(event.isCancelled),
        is_all_day: Boolean(event.isAllDay),
        web_link: event.webLink || null,
        matched_contact_id: match.contactId,
        matched_account_id: match.accountId,
        matched_location_id: match.locationId,
        graph_last_modified_at: event.lastModifiedDateTime || null,
        metadata: { matched_by: match.reason },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider_event_id" });
      if (error) throw error;
      count += 1;
    }
    next = page["@odata.nextLink"];
    pages += 1;
  }
  return count;
}

function graphDate(value: any): string | null {
  const dateTime = value?.dateTime;
  if (!dateTime) return null;
  const parsed = new Date(dateTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function syncTasks(userId: string, prefs: SyncPreferences) {
  if (!prefs.task_sync_enabled) return 0;
  const lists = await microsoftGraphFetch<GraphCollection<any>>(userId, "/me/todo/lists?$top=100");
  let count = 0;
  for (const list of lists.value || []) {
    if (!list?.id) continue;
    let next: string | undefined = `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$top=100`;
    let pages = 0;
    while (next && pages < 5) {
      const page = await microsoftGraphFetch<GraphCollection<any>>(userId, next);
      for (const task of page.value || []) {
        if (!task?.id) continue;
        const { error } = await supabaseAdmin.from("microsoft_365_todo_tasks").upsert({
          user_id: userId,
          provider_list_id: list.id,
          provider_task_id: task.id,
          title: task.title || "Untitled Microsoft To Do task",
          body_text: task.body?.content || null,
          status: task.status || null,
          importance: task.importance || null,
          due_at: graphDate(task.dueDateTime),
          reminder_at: graphDate(task.reminderDateTime),
          completed_at: graphDate(task.completedDateTime),
          graph_last_modified_at: task.lastModifiedDateTime || null,
          metadata: { list_name: list.displayName || null },
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider_list_id,provider_task_id" });
        if (error) throw error;
        count += 1;
      }
      next = page["@odata.nextLink"];
      pages += 1;
    }
  }
  return count;
}

export async function syncMicrosoft365ForUser(userId: string) {
  const prefs = await getPreferences(userId);
  const mailboxEmail = await getMailbox(userId);
  const startedAt = new Date().toISOString();
  try {
    const [mail, calendar, tasks] = await Promise.all([
      syncMail(userId, mailboxEmail, prefs),
      syncCalendar(userId, prefs),
      syncTasks(userId, prefs),
    ]);
    await supabaseAdmin.from("microsoft_365_connections").update({ last_error: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    return { mail, calendar, tasks, startedAt, completedAt: new Date().toISOString() };
  } catch (error) {
    await supabaseAdmin.from("microsoft_365_connections").update({ last_error: error instanceof Error ? error.message.slice(0, 1000) : "Microsoft sync failed", updated_at: new Date().toISOString() }).eq("user_id", userId);
    throw error;
  }
}
