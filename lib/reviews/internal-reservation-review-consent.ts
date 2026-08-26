import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizePhone,
  sendConciergeSms,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";

const CHANNEL_NUMBER = TELNYX_CHANNEL_NUMBERS.concierge;
const ACTIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function firstName(value?: string | null) {
  const clean = String(value || "").trim();
  return clean ? clean.split(/\s+/)[0] : "";
}

function locationName(row: Record<string, unknown> | null | undefined) {
  return String(
    row?.name ||
      row?.business_name ||
      row?.restaurant_name ||
      row?.activity_name ||
      "your outing",
  );
}

function parseConsent(text: string) {
  const value = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (/^(yes|y|yeah|yep|yea|sure|ok|okay|of course|absolutely|i can|we can)\b/.test(value)) {
    return true;
  }
  if (/^(no|n|nope|nah|not now|maybe later|i can't|i cannot|rather not)\b/.test(value)) {
    return false;
  }
  return null;
}

async function logSms(params: {
  phone: string;
  reservationId: string | null;
  body: string;
  direction: "incoming" | "outgoing";
  providerMessageId?: string | null;
}) {
  await supabaseAdmin.from("sms_logs").insert({
    reservation_id: params.reservationId,
    customer_phone: params.phone,
    message_type:
      params.direction === "incoming"
        ? "incoming_concierge_review_consent"
        : "outgoing_concierge_review_consent",
    message_body: params.body,
    provider: "telnyx",
    provider_message_id: params.providerMessageId || null,
    status: params.direction === "incoming" ? "received" : "queued",
    sent_at: params.direction === "outgoing" ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  });
}

async function sendConsentSms(phone: string, reservationId: string, body: string) {
  const result = await sendConciergeSms({ to: phone, body });
  await logSms({
    phone,
    reservationId,
    body,
    direction: "outgoing",
    providerMessageId: result.id,
  });
  return result;
}

export async function startInternalReservationReviewConsent(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("location_reservations")
    .select(
      "id,location_id,status,seated_at,completed_at,customer_name,customer_phone,user_id",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation) {
    throw new Error(error?.message || "Reservation not found");
  }

  const attendanceVerified =
    ["seated", "completed"].includes(String(reservation.status || "")) ||
    Boolean(reservation.seated_at || reservation.completed_at);

  if (!attendanceVerified) {
    return {
      ok: true,
      sent: false,
      skipped: true,
      reason: "attendance_not_verified",
    };
  }

  const phone = normalizePhone(reservation.customer_phone);
  if (!phone) {
    return { ok: true, sent: false, skipped: true, reason: "sms_not_available" };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("sms_review_conversations")
    .select("id,reservation_id,status")
    .eq("phone_e164", phone)
    .eq("status", "active")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return existing.reservation_id === reservation.id
      ? {
          ok: true,
          sent: false,
          fulfilled: true,
          alreadyActive: true,
          conversationId: existing.id,
        }
      : {
          ok: true,
          sent: false,
          skipped: true,
          reason: "another_review_conversation_active",
        };
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,business_name,restaurant_name,activity_name,location_type")
    .eq("id", reservation.location_id)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) {
    return { ok: true, sent: false, skipped: true, reason: "location_not_found" };
  }

  const name = locationName(location as Record<string, unknown>);
  const context = {
    customer_name: reservation.customer_name || null,
    source: "internal_reservation",
    verification_source: "internal_reservation",
    verification_level: "system_verified",
    locations: [
      {
        id: String(location.id),
        name,
        location_type: String(location.location_type || "restaurant"),
      },
    ],
    ratings: {},
    reviews: {},
  };

  const expiresAt = new Date(Date.now() + ACTIVE_TTL_MS).toISOString();
  const { data: conversation, error: createError } = await supabaseAdmin
    .from("sms_review_conversations")
    .insert({
      phone_e164: phone,
      channel_number: CHANNEL_NUMBER,
      reservation_id: reservation.id,
      user_id: reservation.user_id || null,
      status: "active",
      stage: "review_consent",
      current_location_id: location.id,
      location_queue: [String(location.id)],
      context,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (createError) throw createError;

  const first = firstName(reservation.customer_name);
  const greeting = first ? `Hey ${first} —` : "Hey —";
  const message = `${greeting} hope you had a great time at ${name}. Would you mind doing a short review of your outing? It only takes a minute. Reply YES or NO.`;

  try {
    const sendResult = await sendConsentSms(phone, reservation.id, message);
    await supabaseAdmin
      .from("sms_review_conversations")
      .update({
        last_outbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    return {
      ok: true,
      sent: true,
      fulfilled: true,
      conversationId: conversation.id,
      providerMessageId: sendResult.id,
    };
  } catch (sendError) {
    await supabaseAdmin
      .from("sms_review_conversations")
      .update({
        status: "cancelled",
        stage: "complete",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    throw sendError;
  }
}

export async function processInternalReservationReviewConsentReply(input: {
  from: string;
  body: string;
  providerMessageId?: string | null;
}) {
  const phone = normalizePhone(input.from);
  if (!phone) return { handled: false };

  const { data: conversation, error } = await supabaseAdmin
    .from("sms_review_conversations")
    .select("*")
    .eq("phone_e164", phone)
    .eq("channel_number", CHANNEL_NUMBER)
    .eq("status", "active")
    .eq("stage", "review_consent")
    .maybeSingle();
  if (error) throw error;
  if (!conversation) return { handled: false };

  if (new Date(conversation.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("sms_review_conversations")
      .update({
        status: "expired",
        stage: "complete",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    return { handled: false, expired: true };
  }

  const rawText = String(input.body || "").trim();
  if (!rawText) return { handled: true, action: "review_consent_empty_reply" };

  await logSms({
    phone,
    reservationId: conversation.reservation_id,
    body: rawText,
    direction: "incoming",
    providerMessageId: input.providerMessageId,
  });

  const consent = parseConsent(rawText);
  if (consent === null) {
    const clarification =
      "No pressure — just reply YES if you’d like to do the short review, or NO if you’d rather skip it.";
    await sendConsentSms(phone, conversation.reservation_id, clarification);
    await supabaseAdmin
      .from("sms_review_conversations")
      .update({
        last_inbound_at: new Date().toISOString(),
        last_outbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    return { handled: true, action: "review_consent_clarification" };
  }

  if (!consent) {
    const completedAt = new Date().toISOString();
    await supabaseAdmin
      .from("sms_review_conversations")
      .update({
        status: "completed",
        stage: "complete",
        last_inbound_at: completedAt,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", conversation.id);

    await sendConsentSms(
      phone,
      conversation.reservation_id,
      "No problem at all. Thanks for using TheOutHaven.com — we hope you had a great outing. Whenever you’re ready for the next one, we’ll be here to help.",
    );
    return { handled: true, action: "review_consent_declined" };
  }

  const context =
    conversation.context && typeof conversation.context === "object"
      ? conversation.context
      : {};
  const locations = Array.isArray(context.locations) ? context.locations : [];
  const current =
    locations.find(
      (location: { id?: string }) =>
        String(location?.id || "") === String(conversation.current_location_id || ""),
    ) || locations[0];
  const currentName = String(current?.name || "your outing");
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("sms_review_conversations")
    .update({
      stage: "location_rating",
      last_inbound_at: now,
      updated_at: now,
    })
    .eq("id", conversation.id)
    .eq("status", "active");

  await sendConsentSms(
    phone,
    conversation.reservation_id,
    `Thanks — really appreciate it. First, how would you rate ${currentName} from 1–5?`,
  );
  await supabaseAdmin
    .from("sms_review_conversations")
    .update({ last_outbound_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return { handled: true, action: "review_consent_accepted" };
}
