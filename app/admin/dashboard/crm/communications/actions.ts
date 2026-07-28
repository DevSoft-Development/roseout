"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";

import { resolveLoggedInEmailSender } from "@/lib/crm/communications/resolve-logged-in-email-sender";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

const COMMUNICATION_TYPES = [
  "transactional",
  "marketing",
  "sales",
  "support",
  "reservation",
  "claim",
  "billing",
  "onboarding",
  "renewal",
  "partnership",
] as const;

type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

type SendCrmEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  communicationType: CommunicationType;

  contactId?: string | null;
  accountId?: string | null;
  locationId?: string | null;
  opportunityId?: string | null;
  taskId?: string | null;

  conversationId?: string | null;
  templateId?: string | null;
  templateVersionId?: string | null;

  isAiAssisted?: boolean;
};

export type SendCrmEmailResult =
  | {
      success: true;
      messageId: string;
      conversationId: string;
      providerMessageId: string;
    }
  | {
      success: false;
      error: string;
      code:
        | "UNAUTHENTICATED"
        | "INVALID_INPUT"
        | "UNAUTHORIZED"
        | "CONSENT_DENIED"
        | "SUPPRESSED"
        | "NOT_CONFIGURED"
        | "DATABASE_ERROR"
        | "PROVIDER_ERROR";
    };

type ContactRecord = {
  id: string;
  email: string | null;
  archived_at?: string | null;
  do_not_contact?: boolean | null;
  do_not_contact_reason?: string | null;
};

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("NOT_CONFIGURED");
  }

  return new Resend(apiKey);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function stripHtml(html: string): string {
  return html
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanNullableUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
}

function isCommunicationType(
  value: string,
): value is CommunicationType {
  return COMMUNICATION_TYPES.includes(
    value as CommunicationType,
  );
}

function revalidateCommunicationPages(
  conversationId: string,
  input: SendCrmEmailInput,
): void {
  revalidatePath("/admin/dashboard/crm/communications");
  revalidatePath("/admin/dashboard/crm/communications/inbox");
  revalidatePath(
    `/admin/dashboard/crm/communications/${conversationId}`,
  );

  if (input.accountId) {
    revalidatePath(
      `/admin/dashboard/crm/accounts/${input.accountId}`,
    );
  }

  if (input.locationId) {
    revalidatePath(
      `/admin/dashboard/crm/${input.locationId}`,
    );
  }

  if (input.opportunityId) {
    revalidatePath(
      `/admin/dashboard/crm/opportunities/${input.opportunityId}`,
    );
  }

  if (input.taskId) {
    revalidatePath(
      `/admin/dashboard/crm/work-queue/${input.taskId}`,
    );
  }
}

async function verifyCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHENTICATED");
  }

  return user;
}

async function resolveContactByEmail(
  to: string,
  suppliedContactId: string | null,
): Promise<ContactRecord | null> {
  if (suppliedContactId) {
    const { data, error } = await supabaseAdmin
      .from("crm_contacts")
      .select("id, email, archived_at")
      .eq("id", suppliedContactId)
      .maybeSingle();

    if (error) {
      throw new Error("DATABASE_ERROR");
    }

    if (!data || data.archived_at) {
      throw new Error("INVALID_INPUT");
    }

    if (
      data.email &&
      normalizeEmail(data.email) !== normalizeEmail(to)
    ) {
      throw new Error("INVALID_INPUT");
    }

    return data as ContactRecord;
  }

  const { data, error } = await supabaseAdmin
    .from("crm_contacts")
    .select("id, email, archived_at")
    .ilike("email", normalizeEmail(to))
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("DATABASE_ERROR");
  }

  return (data as ContactRecord | null) ?? null;
}

async function assertConsentAndSuppression(params: {
  to: string;
  contactId: string | null;
  communicationType: CommunicationType;
}) {
  const normalizedTo = normalizeEmail(params.to);

  const { data: suppression, error: suppressionError } =
    await supabaseAdmin
      .from("crm_suppression_entries")
      .select("id, suppression_type, reason")
      .eq("channel", "email")
      .eq("is_active", true)
      .ilike("address", normalizedTo)
      .limit(1)
      .maybeSingle();

  if (suppressionError) {
    throw new Error("DATABASE_ERROR");
  }

  if (suppression) {
    throw new Error("SUPPRESSED");
  }

  if (!params.contactId) {
    const consentRequired = [
      "marketing",
      "sales",
      "renewal",
      "partnership",
    ].includes(params.communicationType);

    if (consentRequired) {
      throw new Error("CONSENT_DENIED");
    }

    return {
      consentSnapshot: {
        status: "not_required",
        reason: "No CRM contact record",
        communicationType: params.communicationType,
      },
      suppressionSnapshot: {
        suppressed: false,
        checkedAddress: normalizedTo,
      },
    };
  }

  const { data: preference, error: preferenceError } =
    await supabaseAdmin
      .from("crm_contact_preferences")
      .select(
        [
          "status",
          "source",
          "captured_at",
          "expires_at",
          "communication_type",
        ].join(","),
      )
      .eq("contact_id", params.contactId)
      .eq("channel", "email")
      .eq("communication_type", params.communicationType)
      .maybeSingle();

  if (preferenceError) {
    throw new Error("DATABASE_ERROR");
  }

  const consentRequired = [
    "marketing",
    "sales",
    "renewal",
    "partnership",
  ].includes(params.communicationType);

  if (
    preference?.status === "denied" ||
    (consentRequired && preference?.status !== "granted")
  ) {
    throw new Error("CONSENT_DENIED");
  }

  if (
    preference?.expires_at &&
    new Date(preference.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("CONSENT_DENIED");
  }

  return {
    consentSnapshot: {
      status:
        preference?.status ??
        (consentRequired ? "unknown" : "not_required"),
      source: preference?.source ?? null,
      capturedAt: preference?.captured_at ?? null,
      expiresAt: preference?.expires_at ?? null,
      communicationType: params.communicationType,
    },
    suppressionSnapshot: {
      suppressed: false,
      checkedAddress: normalizedTo,
    },
  };
}

async function getOrCreateConversation(params: {
  input: SendCrmEmailInput;
  senderUserId: string;
  contactId: string | null;
}): Promise<string> {
  if (params.input.conversationId) {
    const { data, error } = await supabaseAdmin
      .from("crm_conversations")
      .select("id, archived_at")
      .eq("id", params.input.conversationId)
      .maybeSingle();

    if (error) {
      throw new Error("DATABASE_ERROR");
    }

    if (!data || data.archived_at) {
      throw new Error("INVALID_INPUT");
    }

    return data.id;
  }

  const conversationKey = [
    "email",
    params.contactId ?? normalizeEmail(params.input.to),
    params.input.accountId ?? "no-account",
    params.input.locationId ?? "no-location",
    params.input.opportunityId ?? "no-opportunity",
  ].join(":");

  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from("crm_conversations")
      .select("id")
      .eq("conversation_key", conversationKey)
      .is("archived_at", null)
      .maybeSingle();

  if (existingError) {
    throw new Error("DATABASE_ERROR");
  }

  if (existing?.id) {
    return existing.id;
  }

  const hasRelationship =
    Boolean(params.input.accountId) ||
    Boolean(params.input.locationId) ||
    Boolean(params.contactId) ||
    Boolean(params.input.opportunityId) ||
    Boolean(params.input.taskId);

  if (!hasRelationship) {
    throw new Error("INVALID_INPUT");
  }

  const { data: created, error: createError } =
    await supabaseAdmin
      .from("crm_conversations")
      .insert({
        conversation_key: conversationKey,
        channel: "email",
        status: "waiting_on_customer",
        subject: params.input.subject,
        account_id: params.input.accountId ?? null,
        location_id: params.input.locationId ?? null,
        contact_id: params.contactId,
        opportunity_id: params.input.opportunityId ?? null,
        task_id: params.input.taskId ?? null,
        owner_user_id: params.senderUserId,
        priority: "normal",
        is_unread: false,
        unread_count: 0,
        metadata: {
          createdFrom: "crm_email_composer",
        },
      })
      .select("id")
      .single();

  if (createError || !created?.id) {
    throw new Error("DATABASE_ERROR");
  }

  return created.id;
}

async function insertCrmActivity(params: {
  input: SendCrmEmailInput;
  userId: string;
  contactId: string | null;
  messageId: string;
}): Promise<void> {
  const hasActivityRelationship =
    Boolean(params.input.accountId) ||
    Boolean(params.input.locationId) ||
    Boolean(params.contactId) ||
    Boolean(params.input.opportunityId) ||
    Boolean(params.input.taskId);

  if (!hasActivityRelationship) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("crm_activities")
    .insert({
      account_id: params.input.accountId ?? null,
      location_id: params.input.locationId ?? null,
      contact_id: params.contactId,
      opportunity_id: params.input.opportunityId ?? null,
      task_id: params.input.taskId ?? null,
      actor_user_id: params.userId,
      activity_type: "email",
      direction: "outbound",
      channel: "email",
      subject: params.input.subject,
      summary: `Email sent: ${params.input.subject}`,
      occurred_at: new Date().toISOString(),
      source_system: "crm_communications",
      source_table: "crm_messages",
      source_record_id: params.messageId,
      visibility: "internal",
      is_system_generated: false,
      metadata: {
        communicationType: params.input.communicationType,
      },
    });

  if (error) {
    console.error("Failed to write CRM email activity", {
      messageId: params.messageId,
      error: error.message,
    });
  }
}

async function insertAuditEvent(params: {
  userId: string;
  messageId: string;
  conversationId: string;
  communicationType: CommunicationType;
  recipientDomain: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_audit_logs")
    .insert({
      actor_user_id: params.userId,
      action: "crm.email.sent",
      entity_type: "crm_message",
      entity_id: params.messageId,
      metadata: {
        conversationId: params.conversationId,
        communicationType: params.communicationType,
        recipientDomain: params.recipientDomain,
      },
    });

  if (error) {
    console.warn("Unable to write CRM email audit event", {
      messageId: params.messageId,
      error: error.message,
    });
  }
}

function mapError(error: unknown): SendCrmEmailResult {
  const message =
    error instanceof Error ? error.message : "UNKNOWN";

  switch (message) {
    case "UNAUTHENTICATED":
      return {
        success: false,
        code: "UNAUTHENTICATED",
        error: "You must be signed in to send email.",
      };

    case "UNAUTHORIZED":
      return {
        success: false,
        code: "UNAUTHORIZED",
        error: "You are not authorized to send this email.",
      };

    case "CONSENT_DENIED":
      return {
        success: false,
        code: "CONSENT_DENIED",
        error:
          "The recipient has not granted permission for this type of email.",
      };

    case "SUPPRESSED":
      return {
        success: false,
        code: "SUPPRESSED",
        error:
          "This recipient is suppressed or marked do not contact.",
      };

    case "NOT_CONFIGURED":
      return {
        success: false,
        code: "NOT_CONFIGURED",
        error: "CRM email sending is not configured.",
      };

    case "DATABASE_ERROR":
      return {
        success: false,
        code: "DATABASE_ERROR",
        error: "The CRM could not save the email record.",
      };

    case "INVALID_INPUT":
      return {
        success: false,
        code: "INVALID_INPUT",
        error:
          "The email information or related CRM record is invalid.",
      };

    default:
      return {
        success: false,
        code: "PROVIDER_ERROR",
        error:
          error instanceof Error
            ? error.message
            : "The email provider could not send the message.",
      };
  }
}

export async function sendCrmEmailAction(
  input: SendCrmEmailInput,
): Promise<SendCrmEmailResult> {
  let messageId: string | null = null;
  let conversationIdForLogging: string | null = null;

  try {
    const resend = getResendClient();
    const user = await verifyCurrentUser();
    const sender = await resolveLoggedInEmailSender();

    if (sender.userId !== user.id) {
      throw new Error("UNAUTHORIZED");
    }

    const to = normalizeEmail(input.to);
    const subject = input.subject.trim();
    const html = input.html.trim();
    const text = input.text?.trim() || stripHtml(html);

    if (
      !to ||
      !isValidEmail(to) ||
      !subject ||
      !html ||
      subject.length > 998 ||
      html.length > 500_000
    ) {
      throw new Error("INVALID_INPUT");
    }

    if (!isCommunicationType(input.communicationType)) {
      throw new Error("INVALID_INPUT");
    }

    if (
      !sender.allowedCommunicationTypes.includes(
        input.communicationType,
      )
    ) {
      throw new Error("UNAUTHORIZED");
    }

    const normalizedInput: SendCrmEmailInput = {
      ...input,
      to,
      subject,
      html,
      text,
      contactId: cleanNullableUuid(input.contactId),
      accountId: cleanNullableUuid(input.accountId),
      locationId: cleanNullableUuid(input.locationId),
      opportunityId: cleanNullableUuid(input.opportunityId),
      taskId: cleanNullableUuid(input.taskId),
      conversationId: cleanNullableUuid(input.conversationId),
      templateId: cleanNullableUuid(input.templateId),
      templateVersionId: cleanNullableUuid(
        input.templateVersionId,
      ),
    };

    const contact = await resolveContactByEmail(
      to,
      normalizedInput.contactId ?? null,
    );

    const contactId = contact?.id ?? null;

    const {
      consentSnapshot,
      suppressionSnapshot,
    } = await assertConsentAndSuppression({
      to,
      contactId,
      communicationType: normalizedInput.communicationType,
    });

    /*
     * This local constant is always a string.
     * Keep the outer nullable variable only for catch-block logging.
     */
    const resolvedConversationId =
      await getOrCreateConversation({
        input: normalizedInput,
        senderUserId: user.id,
        contactId,
      });

    conversationIdForLogging = resolvedConversationId;

    messageId = randomUUID();

    const recipientId = randomUUID();
    const queuedAt = new Date().toISOString();

    const { error: messageError } = await supabaseAdmin
      .from("crm_messages")
      .insert({
        id: messageId,
        conversation_id: resolvedConversationId,
        direction: "outbound",
        channel: "email",
        message_type: normalizedInput.communicationType,
        sender_user_id: user.id,
        contact_id: contactId,
        subject,
        body_text: text,
        body_html: html,
        preview_text: text.slice(0, 240),
        provider: "resend",
        status: "queued",
        queued_at: queuedAt,
        template_id: normalizedInput.templateId ?? null,
        template_version_id:
          normalizedInput.templateVersionId ?? null,
        source_system: "crm_composer",
        source_record_id: `crm-email:${messageId}`,
        is_ai_assisted: Boolean(
          normalizedInput.isAiAssisted,
        ),
        is_internal: false,
        metadata: {
          senderEmail: sender.emailAddress,
          replyTo: sender.replyTo,
          communicationType:
            normalizedInput.communicationType,
        },
      });

    if (messageError) {
      throw new Error("DATABASE_ERROR");
    }

    const { error: recipientError } = await supabaseAdmin
      .from("crm_message_recipients")
      .insert({
        id: recipientId,
        message_id: messageId,
        contact_id: contactId,
        recipient_type: "to",
        address: to,
        delivery_status: "queued",
        consent_snapshot: consentSnapshot,
        suppression_snapshot: suppressionSnapshot,
      });

    if (recipientError) {
      await supabaseAdmin
        .from("crm_messages")
        .delete()
        .eq("id", messageId);

      throw new Error("DATABASE_ERROR");
    }

    const { error: queuedEventError } =
      await supabaseAdmin
        .from("crm_delivery_events")
        .insert({
          message_id: messageId,
          recipient_id: recipientId,
          provider: "resend",
          provider_event_id: `local:queued:${messageId}`,
          event_type: "queued",
          event_at: queuedAt,
          provider_payload: {
            source: "crm_send_action",
          },
        });

    if (queuedEventError) {
      console.warn("Unable to record queued delivery event", {
        messageId,
        error: queuedEventError.message,
      });
    }

    const { data, error: resendError } =
      await resend.emails.send({
        from: sender.from,
        to: [to],
        replyTo: sender.replyTo,
        subject,
        html,
        text,
        tags: [
          {
            name: "crm_message_id",
            value: messageId,
          },
          {
            name: "crm_conversation_id",
            value: resolvedConversationId,
          },
        ],
      });

    if (resendError || !data?.id) {
      const failedAt = new Date().toISOString();
      const providerMessage =
        resendError?.message ||
        "Resend returned no message ID.";

      await Promise.all([
        supabaseAdmin
          .from("crm_messages")
          .update({
            status: "failed",
            failed_at: failedAt,
            failure_code: "resend_send_failed",
            failure_reason: providerMessage,
            updated_at: failedAt,
          })
          .eq("id", messageId),

        supabaseAdmin
          .from("crm_message_recipients")
          .update({
            delivery_status: "failed",
          })
          .eq("id", recipientId),

        supabaseAdmin
          .from("crm_delivery_events")
          .insert({
            message_id: messageId,
            recipient_id: recipientId,
            provider: "resend",
            provider_event_id: `local:failed:${messageId}`,
            event_type: "failed",
            event_at: failedAt,
            provider_payload: {
              source: "crm_send_action",
              error: providerMessage,
            },
          }),
      ]);

      throw new Error(providerMessage);
    }

    const sentAt = new Date().toISOString();

    const { error: sentUpdateError } = await supabaseAdmin
      .from("crm_messages")
      .update({
        status: "sent",
        provider_message_id: data.id,
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq("id", messageId);

    if (sentUpdateError) {
      console.error(
        "Email sent but CRM message update failed",
        {
          messageId,
          providerMessageId: data.id,
          error: sentUpdateError.message,
        },
      );
    }

    await Promise.all([
      supabaseAdmin
        .from("crm_message_recipients")
        .update({
          delivery_status: "sent",
        })
        .eq("id", recipientId),

      supabaseAdmin
        .from("crm_conversations")
        .update({
          subject,
          status: "waiting_on_customer",
          owner_user_id: user.id,
          last_message_at: sentAt,
          last_outbound_at: sentAt,
          is_unread: false,
          updated_at: sentAt,
        })
        .eq("id", resolvedConversationId),

      supabaseAdmin
        .from("crm_delivery_events")
        .insert({
          message_id: messageId,
          recipient_id: recipientId,
          provider: "resend",
          provider_event_id: `local:sent:${messageId}`,
          event_type: "sent",
          event_at: sentAt,
          provider_payload: {
            source: "crm_send_action",
            providerMessageId: data.id,
          },
        }),

      insertCrmActivity({
        input: normalizedInput,
        userId: user.id,
        contactId,
        messageId,
      }),

      insertAuditEvent({
        userId: user.id,
        messageId,
        conversationId: resolvedConversationId,
        communicationType:
          normalizedInput.communicationType,
        recipientDomain: to.split("@")[1] ?? "unknown",
      }),
    ]);

    revalidateCommunicationPages(
      resolvedConversationId,
      normalizedInput,
    );

    return {
      success: true,
      messageId,
      conversationId: resolvedConversationId,
      providerMessageId: data.id,
    };
  } catch (error) {
    if (messageId) {
      const failedAt = new Date().toISOString();

      await supabaseAdmin
        .from("crm_messages")
        .update({
          status: "failed",
          failed_at: failedAt,
          failure_reason:
            error instanceof Error
              ? error.message
              : "Unknown send error",
          updated_at: failedAt,
        })
        .eq("id", messageId)
        .eq("status", "queued");
    }

    console.error("CRM email send failed", {
      messageId,
      conversationId: conversationIdForLogging,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

    return mapError(error);
  }
}