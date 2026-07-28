import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

type ResendWebhookData = {
  email_id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  tags?: Record<string, string>;
  bounce?: {
    message?: string;
    type?: string;
    subType?: string;
  };
  error?: {
    message?: string;
    name?: string;
  };
};

type ResendWebhookEvent = {
  type: string;
  created_at: string;
  data: ResendWebhookData;
};

type DeliveryEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "deferred"
  | "failed"
  | "soft_bounce"
  | "hard_bounce"
  | "complaint"
  | "unsubscribed"
  | "suppressed";

type MessageStatus =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "failed"
  | "bounced"
  | "suppressed";

type EventMapping = {
  deliveryEventType: DeliveryEventType;
  messageStatus: MessageStatus | null;
  timestampColumn:
    | "sent_at"
    | "delivered_at"
    | "opened_at"
    | "clicked_at"
    | "replied_at"
    | "failed_at"
    | null;
  recipientStatus: string;
};

const EVENT_MAPPING: Record<string, EventMapping> = {
  "email.sent": {
    deliveryEventType: "sent",
    messageStatus: "sent",
    timestampColumn: "sent_at",
    recipientStatus: "sent",
  },

  "email.delivered": {
    deliveryEventType: "delivered",
    messageStatus: "delivered",
    timestampColumn: "delivered_at",
    recipientStatus: "delivered",
  },

  "email.opened": {
    deliveryEventType: "opened",
    messageStatus: "opened",
    timestampColumn: "opened_at",
    recipientStatus: "opened",
  },

  "email.clicked": {
    deliveryEventType: "clicked",
    messageStatus: "clicked",
    timestampColumn: "clicked_at",
    recipientStatus: "clicked",
  },

  "email.failed": {
    deliveryEventType: "failed",
    messageStatus: "failed",
    timestampColumn: "failed_at",
    recipientStatus: "failed",
  },

  "email.bounced": {
    deliveryEventType: "hard_bounce",
    messageStatus: "bounced",
    timestampColumn: "failed_at",
    recipientStatus: "bounced",
  },

  "email.complained": {
    deliveryEventType: "complaint",
    messageStatus: "suppressed",
    timestampColumn: null,
    recipientStatus: "complaint",
  },

  "email.suppressed": {
    deliveryEventType: "suppressed",
    messageStatus: "suppressed",
    timestampColumn: null,
    recipientStatus: "suppressed",
  },

  "email.delivery_delayed": {
    deliveryEventType: "deferred",
    messageStatus: null,
    timestampColumn: null,
    recipientStatus: "deferred",
  },
};

function getWebhookHeaders(request: NextRequest) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return null;
  }

  return {
    id,
    timestamp,
    signature,
  };
}

function getEventTimestamp(event: ResendWebhookEvent) {
  const value =
    event.data.created_at || event.created_at;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function getFailureReason(event: ResendWebhookEvent) {
  return (
    event.data.bounce?.message ||
    event.data.error?.message ||
    event.data.error?.name ||
    null
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findMessage(event: ResendWebhookEvent) {
  const providerMessageId = event.data.email_id;

  if (providerMessageId) {
    const { data, error } = await supabaseAdmin
      .from("crm_messages")
      .select(
        `
        id,
        conversation_id,
        contact_id,
        status,
        provider_message_id
      `,
      )
      .eq("provider", "resend")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const taggedMessageId =
    event.data.tags?.crm_message_id;

  if (taggedMessageId) {
    const { data, error } = await supabaseAdmin
      .from("crm_messages")
      .select(
        `
        id,
        conversation_id,
        contact_id,
        status,
        provider_message_id
      `,
      )
      .eq("id", taggedMessageId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data && providerMessageId && !data.provider_message_id) {
      await supabaseAdmin
        .from("crm_messages")
        .update({
          provider: "resend",
          provider_message_id: providerMessageId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }

    return data;
  }

  return null;
}

async function findRecipient(
  messageId: string,
  event: ResendWebhookEvent,
) {
  const recipients = event.data.to ?? [];

  if (recipients.length > 0) {
    for (const address of recipients) {
      const { data, error } = await supabaseAdmin
        .from("crm_message_recipients")
        .select("id, address, contact_id")
        .eq("message_id", messageId)
        .ilike("address", normalizeEmail(address))
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        return data;
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("crm_message_recipients")
    .select("id, address, contact_id")
    .eq("message_id", messageId)
    .eq("recipient_type", "to")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function addSuppression(params: {
  event: ResendWebhookEvent;
  recipientAddress: string;
  contactId: string | null;
  type:
    | "hard_bounce"
    | "spam_complaint"
    | "provider_suppression";
}) {
  const normalizedAddress = normalizeEmail(
    params.recipientAddress,
  );

  const { error } = await supabaseAdmin
    .from("crm_suppression_entries")
    .upsert(
      {
        contact_id: params.contactId,
        channel: "email",
        address: normalizedAddress,
        suppression_type: params.type,
        reason: getFailureReason(params.event),
        source: "resend_webhook",
        provider: "resend",
        provider_reference:
          params.event.data.email_id ?? null,
        is_active: true,
        metadata: {
          eventType: params.event.type,
          eventCreatedAt: params.event.created_at,
        },
      },
      {
        onConflict:
          "channel,address,suppression_type",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error("Failed to create CRM suppression", {
      type: params.type,
      address: normalizedAddress,
      error: error.message,
    });
  }
}

async function processVerifiedEvent(
  event: ResendWebhookEvent,
  webhookId: string,
) {
  const mapping = EVENT_MAPPING[event.type];

  /*
   * Other Resend events, such as domain or contact events,
   * are intentionally acknowledged without changing CRM email
   * records.
   */
  if (!mapping) {
    return {
      ignored: true,
      reason: "Unsupported event type",
    };
  }

  const message = await findMessage(event);

  if (!message) {
    /*
     * Return success so Resend does not repeatedly retry an
     * event that does not belong to a CRM-originated message.
     */
    console.info("Resend event did not match a CRM message", {
      type: event.type,
      providerMessageId: event.data.email_id,
    });

    return {
      ignored: true,
      reason: "CRM message not found",
    };
  }

  const recipient = await findRecipient(
    message.id,
    event,
  );

  const eventAt = getEventTimestamp(event);

  const { error: eventInsertError } =
    await supabaseAdmin
      .from("crm_delivery_events")
      .insert({
        message_id: message.id,
        recipient_id: recipient?.id ?? null,
        provider: "resend",
        provider_event_id: webhookId,
        event_type: mapping.deliveryEventType,
        event_at: eventAt,
        provider_payload: event,
      });

  if (eventInsertError) {
    /*
     * Unique provider event IDs make webhook processing
     * idempotent. A duplicate is safely acknowledged.
     */
    if (eventInsertError.code === "23505") {
      return {
        duplicate: true,
      };
    }

    throw eventInsertError;
  }

  const messageUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (mapping.messageStatus) {
    messageUpdate.status = mapping.messageStatus;
  }

  if (mapping.timestampColumn) {
    messageUpdate[mapping.timestampColumn] = eventAt;
  }

  const failureReason = getFailureReason(event);

  if (
    event.type === "email.failed" ||
    event.type === "email.bounced"
  ) {
    messageUpdate.failure_code = event.type;
    messageUpdate.failure_reason = failureReason;
  }

  const { error: messageUpdateError } =
    await supabaseAdmin
      .from("crm_messages")
      .update(messageUpdate)
      .eq("id", message.id);

  if (messageUpdateError) {
    throw messageUpdateError;
  }

  if (recipient) {
    const { error: recipientUpdateError } =
      await supabaseAdmin
        .from("crm_message_recipients")
        .update({
          delivery_status: mapping.recipientStatus,
        })
        .eq("id", recipient.id);

    if (recipientUpdateError) {
      throw recipientUpdateError;
    }
  }

  if (event.type === "email.delivered") {
    await supabaseAdmin
      .from("crm_conversations")
      .update({
        last_message_at: eventAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.conversation_id);
  }

  if (
    recipient?.address &&
    event.type === "email.bounced"
  ) {
    await addSuppression({
      event,
      recipientAddress: recipient.address,
      contactId:
        recipient.contact_id ?? message.contact_id ?? null,
      type: "hard_bounce",
    });
  }

  if (
    recipient?.address &&
    event.type === "email.complained"
  ) {
    await addSuppression({
      event,
      recipientAddress: recipient.address,
      contactId:
        recipient.contact_id ?? message.contact_id ?? null,
      type: "spam_complaint",
    });
  }

  if (
    recipient?.address &&
    event.type === "email.suppressed"
  ) {
    await addSuppression({
      event,
      recipientAddress: recipient.address,
      contactId:
        recipient.contact_id ?? message.contact_id ?? null,
      type: "provider_suppression",
    });
  }

  return {
    processed: true,
    messageId: message.id,
    eventType: mapping.deliveryEventType,
  };
}

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_WEBHOOK_SECRET) {
    console.error(
      "RESEND_WEBHOOK_SECRET is not configured.",
    );

    return NextResponse.json(
      {
        error: "Webhook is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  const headers = getWebhookHeaders(request);

  if (!headers) {
    return NextResponse.json(
      {
        error: "Missing webhook signature headers.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Resend signature verification must receive the raw request
   * body. Do not call request.json() before verification.
   */
  const payload = await request.text();

  let event: ResendWebhookEvent;

  try {
    event = resend.webhooks.verify({
      payload,
      headers,
      webhookSecret:
        process.env.RESEND_WEBHOOK_SECRET,
    }) as ResendWebhookEvent;
  } catch (error) {
    console.warn("Invalid Resend webhook signature", {
      error:
        error instanceof Error
          ? error.message
          : "Unknown verification error",
    });

    return NextResponse.json(
      {
        error: "Invalid webhook signature.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await processVerifiedEvent(
      event,
      headers.id,
    );

    return NextResponse.json({
      received: true,
      ...result,
    });
  } catch (error) {
    console.error("Failed to process Resend webhook", {
      type: event.type,
      providerMessageId: event.data.email_id,
      error:
        error instanceof Error
          ? error.message
          : "Unknown processing error",
    });

    return NextResponse.json(
      {
        error: "Webhook processing failed.",
      },
      {
        status: 500,
      },
    );
  }
}