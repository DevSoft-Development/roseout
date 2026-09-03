import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchCrmByEmails, shouldIgnoreMailboxMessage } from "./matching";
import { microsoftGraphFetch } from "./graph";
import { ensureMicrosoft365Subscriptions } from "./subscriptions";

type GraphCollection<T> = { value?: T[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
type GraphAddress = { emailAddress?: { address?: string | null; name?: string | null } | null };
type GraphMessage = {
  id: string;
  "@removed"?: { reason?: string };
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

type SyncResource = "mail_inbox" | "mail_sent" | "calendar" | "todo_lists" | "todo_tasks";

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

async function getDeltaLink(userId: string, resource: SyncResource, resourceKey = "default") {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_sync_state")
    .select("delta_link")
    .eq("user_id", userId)
    .eq("resource", resource)
    .eq("resource_key", resourceKey)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.delta_link === "string" && data.delta_link ? data.delta_link : null;
}

async function saveDeltaState(userId: string, resource: SyncResource, resourceKey: string, deltaLink: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("microsoft_365_sync_state").upsert({
    user_id: userId,
    resource,
    resource_key: resourceKey,
    delta_link: deltaLink,
    last_synced_at: now,
    last_success_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: "user_id,resource,resource_key" });
  if (error) throw error;
}

async function recordDeltaError(userId: string, resource: SyncResource, resourceKey: string, error: unknown) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("microsoft_365_sync_state").upsert({
    user_id: userId,
    resource,
    resource_key: resourceKey,
    last_synced_at: now,
    last_error: error instanceof Error ? error.message.slice(0, 1000) : "Microsoft delta sync failed",
    updated_at: now,
  }, { onConflict: "user_id,resource,resource_key" });
}

async function runDelta<T>(options: {
  userId: string;
  resource: SyncResource;
  resourceKey?: string;
  initialPath: string;
  maxPages?: number;
  process: (item: T) => Promise<void>;
}) {
  const resourceKey = options.resourceKey || "default";
  let next: string | undefined = (await getDeltaLink(options.userId, options.resource, resourceKey)) || options.initialPath;
  let pages = 0;
  let processed = 0;
  try {
    while (next && pages < (options.maxPages || 10)) {
      const page = await microsoftGraphFetch<GraphCollection<T>>(options.userId, next);
      for (const item of page.value || []) {
        await options.process(item);
        processed += 1;
      }
      if (page["@odata.deltaLink"]) {
        await saveDeltaState(options.userId, options.resource, resourceKey, page["@odata.deltaLink"]!);
        next = undefined;
      } else {
        next = page["@odata.nextLink"];
      }
      pages += 1;
    }
    return processed;
  } catch (error) {
    await recordDeltaError(options.userId, options.resource, resourceKey, error).catch(() => undefined);
    throw error;
  }
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
  if (!message.id || message.isDraft || message["@removed"]) return;
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
  const folders: Array<{ folder: string; resource: SyncResource }> = [
    { folder: "inbox", resource: "mail_inbox" },
    { folder: "sentitems", resource: "mail_sent" },
  ];
  let processed = 0;
  for (const entry of folders) {
    const initialPath = `/me/mailFolders/${entry.folder}/messages/delta?$top=100&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$select=${select}`;
    processed += await runDelta<GraphMessage>({
      userId,
      resource: entry.resource,
      initialPath,
      maxPages: 10,
      process: (message) => processMessage(userId, mailboxEmail, prefs, message),
    });
  }
  return processed;
}

async function syncCalendar(userId: string, prefs: SyncPreferences) {
  if (!prefs.calendar_sync_enabled) return 0;
  const anchor = new Date().toISOString().slice(0, 10);
  const resourceKey = `window:${anchor}`;
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const initialPath = `/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  const count = await runDelta<any>({
    userId,
    resource: "calendar",
    resourceKey,
    initialPath,
    maxPages: 10,
    process: async (event) => {
      if (!event?.id) return;
      if (event["@removed"]) {
        await supabaseAdmin.from("microsoft_365_calendar_events").delete().eq("user_id", userId).eq("provider_event_id", event.id);
        return;
      }
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
    },
  });
  const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from("microsoft_365_sync_state").delete().eq("user_id", userId).eq("resource", "calendar").neq("resource_key", resourceKey).lt("updated_at", staleBefore);
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
  const lists: GraphCollection<any> = await microsoftGraphFetch<GraphCollection<any>>(userId, "/me/todo/lists?$top=100");
  let count = 0;
  for (const list of lists.value || []) {
    if (!list?.id) continue;
    count += await runDelta<any>({
      userId,
      resource: "todo_tasks",
      resourceKey: String(list.id),
      initialPath: `/me/todo/lists/${encodeURIComponent(list.id)}/tasks/delta?$top=100`,
      maxPages: 10,
      process: async (task) => {
        if (!task?.id) return;
        if (task["@removed"]) {
          await supabaseAdmin.from("microsoft_365_todo_tasks").delete().eq("user_id", userId).eq("provider_list_id", list.id).eq("provider_task_id", task.id);
          return;
        }
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
      },
    });
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
    const subscriptions = await ensureMicrosoft365Subscriptions(userId);
    await supabaseAdmin.from("microsoft_365_connections").update({ last_error: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    return { mail, calendar, tasks, subscriptions, startedAt, completedAt: new Date().toISOString() };
  } catch (error) {
    await supabaseAdmin.from("microsoft_365_connections").update({ last_error: error instanceof Error ? error.message.slice(0, 1000) : "Microsoft sync failed", updated_at: new Date().toISOString() }).eq("user_id", userId);
    throw error;
  }
}
