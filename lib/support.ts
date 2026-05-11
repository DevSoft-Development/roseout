import crypto from "crypto";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getAdminNotifyEmail, sendNotification } from "@/lib/notifications";

export type SupportActor = "creator" | "admin" | "system";

export type SupportTicket = {
  id: string;
  ticket_number: string | null;
  subject: string;
  topic: string | null;
  status: string | null;
  priority: string | null;
  requester_name: string | null;
  requester_email: string;
  requester_phone: string | null;
  source: string | null;
  public_access_token: string;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  actor_type: SupportActor | string;
  author_name: string | null;
  author_email: string | null;
  author_phone: string | null;
  body: string;
  created_at: string;
};

export type CreateSupportTicketInput = {
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  subject?: string;
  message: string;
  source?: string;
};

export type CreateSupportReplyInput = {
  ticketId: string;
  token?: string;
  actorType?: SupportActor;
  authorName?: string;
  authorEmail?: string;
  authorPhone?: string;
  message: string;
};

type SupportEventRow = {
  id?: string | null;
  event_type?: string | null;
  event_name?: string | null;
  metadata?: unknown;
  created_at?: string | null;
};

type SupportEventMetadata = {
  support_ticket_id?: string;
  ticket?: Partial<SupportTicket>;
  message?: Partial<SupportMessage>;
};

const SUPPORT_CREATED_EVENT = "support_ticket_created";
const SUPPORT_REPLY_EVENT = "support_ticket_reply";
const SUPPORT_STATUS_EVENT = "support_ticket_status";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(value: string) {
  return htmlEscape(value).replace(/\n/g, "<br />");
}

export function supportEmailFrom() {
  if (process.env.SUPPORT_EMAIL_FROM) return process.env.SUPPORT_EMAIL_FROM;

  const configuredFrom = process.env.EMAIL_FROM || "hello@theouthaven.com";
  const emailMatch = configuredFrom.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1] : configuredFrom;

  return `TheOutHaven Support <${email}>`;
}

export function renderSupportEmail({
  title,
  greeting = "Hi there,",
  bodyHtml,
  ctaUrl,
  ctaLabel,
  footerText = "Sent by the TheOutHaven admin team.",
}: {
  title: string;
  greeting?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerText?: string;
}) {
  const cta = ctaUrl && ctaLabel
    ? `<p style="margin:56px 0 0;"><a href="${ctaUrl}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;border-radius:999px;padding:18px 28px;font-size:18px;font-weight:900;letter-spacing:0.02em;">${htmlEscape(ctaLabel)}</a></p>`
    : "";

  return `
    <div style="margin:0;padding:0;background:#ffffff;color:#141414;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:920px;margin:0 auto;padding:24px 56px 44px;">
        <h1 style="margin:0 0 150px;font-size:64px;line-height:1.05;font-weight:900;letter-spacing:-0.06em;color:#000000;">${htmlEscape(title)}</h1>
        <p style="margin:0 0 72px;font-size:28px;line-height:1;font-weight:900;letter-spacing:0.16em;color:#e11d48;">THEOUTHAVEN</p>
        <p style="margin:0 0 150px;font-size:48px;line-height:1.2;font-weight:400;color:#141414;">${htmlEscape(greeting)}</p>
        <div style="font-size:48px;line-height:1.55;font-weight:400;color:#141414;letter-spacing:-0.035em;">
          ${bodyHtml}
          ${cta}
          <p style="margin:150px 0 0;">— TheOutHaven Team</p>
        </div>
        <hr style="border:0;border-top:3px solid #eeeeee;margin:78px 0 44px;" />
        <p style="margin:0;font-size:36px;line-height:1.4;color:#777777;">${htmlEscape(footerText)}</p>
      </div>
    </div>
  `;
}

function metadataFromRow(row: SupportEventRow): SupportEventMetadata {
  if (!row.metadata || typeof row.metadata !== "object") return {};
  return row.metadata as SupportEventMetadata;
}

function ticketFromEventRow(row: SupportEventRow): SupportTicket | null {
  const metadata = metadataFromRow(row);
  const ticket = metadata.ticket;

  if (!ticket?.id || !ticket.requester_email || !ticket.public_access_token || !ticket.subject) {
    return null;
  }

  return {
    id: ticket.id,
    ticket_number: ticket.ticket_number || null,
    subject: ticket.subject,
    topic: ticket.topic || null,
    status: ticket.status || "open",
    priority: ticket.priority || "normal",
    requester_name: ticket.requester_name || null,
    requester_email: ticket.requester_email,
    requester_phone: ticket.requester_phone || null,
    source: ticket.source || "support_event_fallback",
    public_access_token: ticket.public_access_token,
    created_at: ticket.created_at || row.created_at || new Date().toISOString(),
    updated_at: ticket.updated_at || null,
    last_message_at: ticket.last_message_at || row.created_at || null,
  } satisfies SupportTicket;
}

function messageFromEventRow(row: SupportEventRow): SupportMessage | null {
  const metadata = metadataFromRow(row);
  const message = metadata.message;

  if (!message?.ticket_id || !message.body) return null;

  return {
    id: message.id || row.id || crypto.randomUUID(),
    ticket_id: message.ticket_id,
    actor_type: message.actor_type || "creator",
    author_name: message.author_name || null,
    author_email: message.author_email || null,
    author_phone: message.author_phone || null,
    body: message.body,
    created_at: message.created_at || row.created_at || new Date().toISOString(),
  } satisfies SupportMessage;
}

function buildInitialSupportMessage({
  ticket,
  requesterName,
  requesterEmail,
  requesterPhone,
  message,
  createdAt,
}: {
  ticket: SupportTicket;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  message: string;
  createdAt: string;
}) {
  return {
    id: crypto.randomUUID(),
    ticket_id: ticket.id,
    actor_type: "creator",
    author_name: requesterName,
    author_email: requesterEmail,
    author_phone: requesterPhone || null,
    body: message,
    created_at: createdAt,
  } satisfies SupportMessage;
}

export function getSupportSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  );
}

export function makeTicketUrl(ticket: Pick<SupportTicket, "id" | "public_access_token">) {
  return `${getSupportSiteUrl()}/support/tickets/${ticket.id}?key=${ticket.public_access_token}`;
}

export function makeAdminTicketUrl(ticketId: string) {
  return `${getSupportSiteUrl()}/admin/dashboard/support/${ticketId}`;
}

export function makeSupportReplyAddress(ticket: Pick<SupportTicket, "id" | "public_access_token">) {
  const domain = process.env.SUPPORT_REPLY_EMAIL_DOMAIN;
  if (!domain) return process.env.SUPPORT_REPLY_TO_EMAIL || process.env.EMAIL_FROM;

  return `support+${ticket.id}.${ticket.public_access_token}@${domain}`;
}

export async function isSupportRequestAdmin() {
  const requestHeaders = await headers();
  const adminSecret = process.env.SUPPORT_INBOUND_SECRET;
  const providedSecret = requestHeaders.get("x-support-secret");

  if (adminSecret && providedSecret === adminSecret) {
    return true;
  }

  const auth = requestHeaders.get("authorization") || "";
  if (adminSecret && auth === `Bearer ${adminSecret}`) {
    return true;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return false;
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  return Boolean(adminUser);
}

async function insertSupportEvent({
  eventType,
  ticket,
  message,
}: {
  eventType: typeof SUPPORT_CREATED_EVENT | typeof SUPPORT_REPLY_EVENT | typeof SUPPORT_STATUS_EVENT;
  ticket: SupportTicket;
  message: SupportMessage;
}) {
  const { error } = await supabaseAdmin.from("user_activity_events").insert({
    user_id: null,
    session_id: null,
    event_type: eventType,
    event_name: ticket.id,
    page_path: eventType === SUPPORT_CREATED_EVENT ? ticket.source || "/support" : "/support/reply",
    metadata: {
      support_ticket_id: ticket.id,
      ticket,
      message,
    },
  });

  if (error) throw error;
}

async function getFallbackSupportTicket(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_activity_events")
    .select("id, event_type, event_name, metadata, created_at")
    .in("event_type", [SUPPORT_CREATED_EVENT, SUPPORT_STATUS_EVENT])
    .eq("event_name", ticketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return ticketFromEventRow(data as SupportEventRow);
}

async function getFallbackSupportTicketMessages(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_activity_events")
    .select("id, event_type, event_name, metadata, created_at")
    .in("event_type", [SUPPORT_CREATED_EVENT, SUPPORT_REPLY_EVENT, SUPPORT_STATUS_EVENT])
    .eq("event_name", ticketId)
    .order("created_at", { ascending: true });

  if (error) return [];

  return ((data || []) as SupportEventRow[])
    .map(messageFromEventRow)
    .filter((message): message is SupportMessage => Boolean(message));
}

export async function listSupportTickets(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(limit);

  const primaryTickets = error ? [] : (data || []) as SupportTicket[];

  const { data: fallbackData, error: fallbackError } = await supabaseAdmin
    .from("user_activity_events")
    .select("id, event_type, event_name, metadata, created_at")
    .in("event_type", [SUPPORT_CREATED_EVENT, SUPPORT_STATUS_EVENT])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && fallbackError) throw error;

  const fallbackTickets = fallbackError
    ? []
    : ((fallbackData || []) as SupportEventRow[])
        .map(ticketFromEventRow)
        .filter((ticket): ticket is SupportTicket => Boolean(ticket));

  const ticketsById = new Map<string, SupportTicket>();

  for (const ticket of fallbackTickets) {
    if (!ticketsById.has(ticket.id)) {
      ticketsById.set(ticket.id, ticket);
    }
  }

  for (const ticket of primaryTickets) {
    ticketsById.set(ticket.id, ticket);
  }

  return Array.from(ticketsById.values())
    .sort((a, b) => {
      const aDate = a.last_message_at || a.created_at;
      const bDate = b.last_message_at || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, limit);
}

export async function getSupportTicket(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();

  const primaryTicket = !error && data ? data as SupportTicket : null;
  const fallbackTicket = await getFallbackSupportTicket(ticketId);

  if (primaryTicket && fallbackTicket) {
    const primaryDate = primaryTicket.last_message_at || primaryTicket.updated_at || primaryTicket.created_at;
    const fallbackDate = fallbackTicket.last_message_at || fallbackTicket.updated_at || fallbackTicket.created_at;

    return new Date(fallbackDate).getTime() > new Date(primaryDate).getTime()
      ? fallbackTicket
      : primaryTicket;
  }

  if (primaryTicket) return primaryTicket;
  if (fallbackTicket) return fallbackTicket;

  if (error) throw error;
  return null;
}

export async function getSupportTicketMessages(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const fallbackMessages = await getFallbackSupportTicketMessages(ticketId);

  if (error) return fallbackMessages;

  const tableMessages = (data || []) as SupportMessage[];
  if (!tableMessages.length) return fallbackMessages;

  const tableIds = new Set(tableMessages.map((message) => message.id));
  return [
    ...tableMessages,
    ...fallbackMessages.filter((message) => !tableIds.has(message.id)),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  const requesterName = clean(input.name);
  const requesterEmail = normalizeEmail(input.email);
  const requesterPhone = clean(input.phone);
  const topic = clean(input.topic) || "General Support";
  const message = clean(input.message);
  const subject = clean(input.subject) || `${topic}: ${message.slice(0, 72)}`;
  const source = clean(input.source) || "support_form";

  if (!requesterName || !requesterEmail || !message) {
    throw new Error("Name, email, and message are required.");
  }

  const createdAt = new Date().toISOString();
  const publicAccessToken = crypto.randomBytes(24).toString("hex");
  const ticketNumber = `RO-${Date.now().toString(36).toUpperCase()}`;
  const baseTicket = {
    id: crypto.randomUUID(),
    ticket_number: ticketNumber,
    requester_name: requesterName,
    requester_email: requesterEmail,
    requester_phone: requesterPhone || null,
    topic,
    subject,
    status: "open",
    priority: "normal",
    source,
    public_access_token: publicAccessToken,
    created_at: createdAt,
    updated_at: createdAt,
    last_message_at: createdAt,
  } satisfies SupportTicket;

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      id: baseTicket.id,
      ticket_number: ticketNumber,
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_phone: requesterPhone || null,
      topic,
      subject,
      status: "open",
      priority: "normal",
      source,
      public_access_token: publicAccessToken,
      last_message_at: createdAt,
    })
    .select("*")
    .single();

  if (ticketError) {
    const fallbackMessage = buildInitialSupportMessage({
      ticket: baseTicket,
      requesterName,
      requesterEmail,
      requesterPhone,
      message,
      createdAt,
    });

    await insertSupportEvent({
      eventType: SUPPORT_CREATED_EVENT,
      ticket: baseTicket,
      message: fallbackMessage,
    });

    await notifySupportTicketCreated(baseTicket, message);

    return baseTicket;
  }

  const createdTicket = ticket as SupportTicket;

  const { error: messageError } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: createdTicket.id,
      actor_type: "creator",
      author_name: requesterName,
      author_email: requesterEmail,
      author_phone: requesterPhone || null,
      body: message,
    });

  if (messageError) {
    const fallbackMessage = buildInitialSupportMessage({
      ticket: createdTicket,
      requesterName,
      requesterEmail,
      requesterPhone,
      message,
      createdAt,
    });

    await insertSupportEvent({
      eventType: SUPPORT_CREATED_EVENT,
      ticket: createdTicket,
      message: fallbackMessage,
    });
  }

  await notifySupportTicketCreated(createdTicket, message);

  return createdTicket;
}


export async function closeSupportTicket(ticketId: string) {
  const ticket = await getSupportTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found.");

  const closedAt = new Date().toISOString();
  const closedTicket = {
    ...ticket,
    status: "closed",
    updated_at: closedAt,
    last_message_at: closedAt,
  } satisfies SupportTicket;

  const { error: updateError } = await supabaseAdmin
    .from("support_tickets")
    .update({
      status: "closed",
      updated_at: closedAt,
      last_message_at: closedAt,
    })
    .eq("id", ticket.id);

  const closeMessage = {
    id: crypto.randomUUID(),
    ticket_id: ticket.id,
    actor_type: "system",
    author_name: "TheOutHaven Support",
    author_email: getAdminNotifyEmail(),
    author_phone: null,
    body: "Ticket closed by TheOutHaven Support.",
    created_at: closedAt,
  } satisfies SupportMessage;

  let fallbackStored = false;

  try {
    await insertSupportEvent({
      eventType: SUPPORT_STATUS_EVENT,
      ticket: closedTicket,
      message: closeMessage,
    });
    fallbackStored = true;
  } catch (fallbackError) {
    if (updateError) throw updateError;
    console.error("Support ticket close fallback event failed", fallbackError);
  }

  if (updateError && !fallbackStored) {
    throw updateError;
  }

  return { ticket: closedTicket, message: closeMessage };
}

export async function createSupportReply(input: CreateSupportReplyInput) {
  const message = clean(input.message);
  const ticketId = clean(input.ticketId);
  const token = clean(input.token);

  if (!ticketId || !message) {
    throw new Error("Ticket and reply message are required.");
  }

  const ticket = await getSupportTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found.");
  if (ticket.status === "closed") throw new Error("This support ticket is closed.");

  const actorType = input.actorType || "creator";
  const adminActor = actorType === "admin";

  if (!adminActor && token !== ticket.public_access_token) {
    throw new Error("Invalid ticket access key.");
  }

  const createdAt = new Date().toISOString();
  const authorName = clean(input.authorName) || (adminActor ? "TheOutHaven Support" : ticket.requester_name || "Ticket requester");
  const authorEmail = normalizeEmail(input.authorEmail) || (adminActor ? getAdminNotifyEmail() : ticket.requester_email);
  const authorPhone = clean(input.authorPhone) || null;
  const fallbackMessage = {
    id: crypto.randomUUID(),
    ticket_id: ticket.id,
    actor_type: actorType,
    author_name: authorName,
    author_email: authorEmail,
    author_phone: authorPhone,
    body: message,
    created_at: createdAt,
  } satisfies SupportMessage;

  const { data: createdMessage, error: messageError } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      actor_type: actorType,
      author_name: authorName,
      author_email: authorEmail,
      author_phone: authorPhone,
      body: message,
    })
    .select("*")
    .single();

  if (messageError) {
    await insertSupportEvent({
      eventType: SUPPORT_REPLY_EVENT,
      ticket,
      message: fallbackMessage,
    });
  }

  await supabaseAdmin
    .from("support_tickets")
    .update({
      status: adminActor ? "waiting_on_customer" : "open",
      last_message_at: createdAt,
      updated_at: createdAt,
    })
    .eq("id", ticket.id);

  await notifySupportReply(ticket, message, actorType);

  return messageError ? fallbackMessage : createdMessage as SupportMessage;
}

async function notifySupportTicketCreated(ticket: SupportTicket, message: string) {
  const ticketUrl = makeTicketUrl(ticket);
  const adminTicketUrl = makeAdminTicketUrl(ticket.id);
  const replyTo = makeSupportReplyAddress(ticket);

  const adminEmail = getAdminNotifyEmail();
  const adminPhone = process.env.ADMIN_NOTIFY_PHONE;

  if (adminEmail || adminPhone) {
    await sendNotification({
      toEmail: adminEmail,
      toPhone: adminPhone,
      replyTo,
      subject: `New support ticket ${ticket.ticket_number || ""}: ${ticket.subject}`,
      from: supportEmailFrom(),
      emailHtml: renderSupportEmail({
        title: "New support ticket",
        greeting: "Hi team,",
        bodyHtml: `
          <p style="margin:0 0 44px;">A new support ticket is ready for review.</p>
          <p style="margin:0 0 18px;"><strong>Ticket:</strong> ${htmlEscape(ticket.ticket_number || ticket.id)}</p>
          <p style="margin:0 0 18px;"><strong>From:</strong> ${htmlEscape(ticket.requester_name || "")} &lt;${htmlEscape(ticket.requester_email)}&gt;</p>
          <p style="margin:0 0 18px;"><strong>Phone:</strong> ${htmlEscape(ticket.requester_phone || "Not provided")}</p>
          <p style="margin:0 0 18px;"><strong>Topic:</strong> ${htmlEscape(ticket.topic || "General Support")}</p>
          <p style="margin:0 0 44px;"><strong>Subject:</strong> ${htmlEscape(ticket.subject)}</p>
          <p style="margin:0 0 18px;"><strong>Message:</strong></p>
          <p style="margin:0;">${nl2br(message)}</p>
        `,
        ctaUrl: adminTicketUrl,
        ctaLabel: "Open admin ticket",
      }),
      smsBody: `TheOutHaven support ${ticket.ticket_number || ticket.id}: ${ticket.subject}. Open: ${adminTicketUrl}`,
    });
  }

  await sendNotification({
    toEmail: ticket.requester_email,
    toPhone: ticket.requester_phone,
    replyTo,
    subject: `We received your TheOutHaven ticket ${ticket.ticket_number || ""}`,
    from: supportEmailFrom(),
    emailHtml: renderSupportEmail({
      title: "We received your ticket",
      greeting: `Hi ${ticket.requester_name || "there"},`,
      bodyHtml: `
        <p style="margin:0 0 44px;">Your ticket is open and our team has been notified. Reply to this email if you need to add more details.</p>
        <p style="margin:0 0 18px;"><strong>Ticket:</strong> ${htmlEscape(ticket.ticket_number || ticket.id)}</p>
        <p style="margin:0;"><strong>Subject:</strong> ${htmlEscape(ticket.subject)}</p>
      `,
      ctaUrl: ticketUrl,
      ctaLabel: "View or reply to ticket",
    }),
    smsBody: `TheOutHaven: We received ticket ${ticket.ticket_number || ticket.id}. View/reply: ${ticketUrl}`,
  });
}

async function notifySupportReply(ticket: SupportTicket, message: string, actorType: SupportActor) {
  const ticketUrl = makeTicketUrl(ticket);
  const adminTicketUrl = makeAdminTicketUrl(ticket.id);
  const replyTo = makeSupportReplyAddress(ticket);
  const adminEmail = getAdminNotifyEmail();
  const adminPhone = process.env.ADMIN_NOTIFY_PHONE;
  const creatorIsRecipient = actorType === "admin";

  await sendNotification({
    toEmail: creatorIsRecipient ? ticket.requester_email : adminEmail,
    toPhone: creatorIsRecipient ? ticket.requester_phone : adminPhone,
    replyTo,
    subject: `New reply on TheOutHaven ticket ${ticket.ticket_number || ""}`,
    from: supportEmailFrom(),
    emailHtml: renderSupportEmail({
      title: "New ticket reply",
      greeting: creatorIsRecipient ? `Hi ${ticket.requester_name || "there"},` : "Hi team,",
      bodyHtml: `
        <p style="margin:0 0 44px;">There is a new reply on this TheOutHaven support ticket. Reply to this email to continue the conversation.</p>
        <p style="margin:0 0 18px;"><strong>Ticket:</strong> ${htmlEscape(ticket.ticket_number || ticket.id)}</p>
        <p style="margin:0;">${nl2br(message)}</p>
      `,
      ctaUrl: creatorIsRecipient ? ticketUrl : adminTicketUrl,
      ctaLabel: "Open ticket",
    }),
    smsBody: `TheOutHaven ticket ${ticket.ticket_number || ticket.id} has a new reply. Open: ${creatorIsRecipient ? ticketUrl : adminTicketUrl}`,
  });
}

export function extractTicketReplyAddress(value: string) {
  const match = value.match(/support\+([a-f0-9-]+)\.([a-f0-9]+)@/i);
  if (!match) return null;

  return {
    ticketId: match[1],
    token: match[2],
  };
}
