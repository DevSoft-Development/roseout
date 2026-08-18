import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/sms/telnyx";
import { sendSms } from "@/lib/sms/sendSms";
import { checkReservationAvailability } from "@/lib/reservations/availability";
import { canCancelReservation, canModifyReservation } from "@/lib/reservations/status";
import { parseReservationSmsIntent, type ReservationSmsIntent } from "@/lib/reservations/sms-intent";
import { appendReservationMessage } from "@/lib/communications/reservation-thread";
import { getLocationName } from "@/lib/locationName";
import { sendReservationCancelledEmail, sendWaitlistAvailableEmail } from "@/lib/email/reservation-emails";
import { sendReservationCancelledSMS, sendWaitlistSMS } from "@/lib/sms/reservation-sms";
import { trackLocationAnalyticsEvent } from "@/lib/analytics/business-analytics";
import { logEvent } from "@/lib/monitoring";
import { stripeRequest } from "@/lib/stripe/server";

const SESSION_MINUTES = 20;
const ACTIVE_STATUSES = ["pending", "confirmed", "checked_in", "waiting", "arrived", "seated", "occupied", "waitlisted"];

type Reservation = {
  id: string;
  location_id: string;
  location_type?: string | null;
  user_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size?: number | null;
  status?: string | null;
  deposit_status?: string | null;
  stripe_payment_intent_id?: string | null;
  confirmation_code?: string | null;
  customer_token?: string | null;
};

type SmsSession = {
  phone_e164: string;
  reservation_id: string | null;
  state: string;
  pending_action: string | null;
  pending_data: Record<string, any> | null;
  expires_at: string;
};

function expiresAt() {
  return new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
}

function formatTime(value?: string | null) {
  const [hourRaw, minuteRaw = "00"] = String(value || "00:00").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  return `${hour % 12 || 12}:${minuteRaw} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatDate(value?: string | null) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : raw;
}

function reservationSummary(reservation: Reservation, locationName?: string) {
  return `${locationName ? `${locationName} - ` : ""}${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)} for ${Number(reservation.party_size || 2)} guest${Number(reservation.party_size || 2) === 1 ? "" : "s"}`;
}

async function locationName(locationId: string) {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,business_name")
    .eq("id", locationId)
    .maybeSingle();
  return getLocationName(data || {}, "TheOutHaven location");
}

async function saveSession(phone: string, input: Partial<SmsSession> & Pick<SmsSession, "state">) {
  await supabaseAdmin.from("reservation_sms_sessions").upsert({
    phone_e164: phone,
    reservation_id: input.reservation_id || null,
    state: input.state,
    pending_action: input.pending_action || null,
    pending_data: input.pending_data || {},
    expires_at: expiresAt(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_e164" });
}

async function clearSession(phone: string) {
  await supabaseAdmin.from("reservation_sms_sessions").delete().eq("phone_e164", phone);
}

async function getSession(phone: string): Promise<SmsSession | null> {
  const { data } = await supabaseAdmin
    .from("reservation_sms_sessions")
    .select("phone_e164,reservation_id,state,pending_action,pending_data,expires_at")
    .eq("phone_e164", phone)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await clearSession(phone);
    return null;
  }
  return data as SmsSession;
}

async function activeReservations(phone: string): Promise<Reservation[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,location_type,user_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,deposit_status,stripe_payment_intent_id,confirmation_code,customer_token")
    .eq("customer_phone", phone)
    .gte("reservation_date", today)
    .in("status", ACTIVE_STATUSES)
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data || []) as Reservation[];
}

async function reservationById(id: string | null) {
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,location_type,user_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,deposit_status,stripe_payment_intent_id,confirmation_code,customer_token")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Reservation | null;
}

async function reply(phone: string, reservation: Reservation | null, body: string, source: string) {
  const result = await sendSms({ to: phone, body });
  if (reservation) {
    await appendReservationMessage({
      reservation,
      direction: "outbound",
      channel: "sms",
      body,
      provider: "telnyx",
      providerMessageId: result.id || null,
      sourceRecordId: `reservation-sms-action:${source}:${crypto.randomUUID()}`,
      recipientAddress: phone,
      metadata: { source: "reservation_sms_action", action: source },
    });
  }
}

async function askWhichReservation(phone: string, reservations: Reservation[], pendingAction: string, pendingData: Record<string, any> = {}) {
  const lines = await Promise.all(reservations.slice(0, 5).map(async (reservation, index) => {
    const name = await locationName(reservation.location_id);
    return `${index + 1}. ${reservationSummary(reservation, name)}`;
  }));
  const actionLabel = pendingAction === "cancel" ? "cancel" : pendingAction === "details" ? "review" : "change";
  await saveSession(phone, { state: "select_reservation", pending_action: pendingAction, pending_data: { ...pendingData, reservation_ids: reservations.slice(0, 5).map((r) => r.id) } });
  await reply(phone, null, `I found a few upcoming reservations. Which one would you like to ${actionLabel}?\n\n${lines.join("\n")}\n\nReply with the reservation number, or NO to exit.`, "select_reservation");
}

async function prepareCancel(phone: string, reservation: Reservation) {
  if (!canCancelReservation(reservation.status)) {
    await reply(phone, reservation, "I can’t cancel that reservation by text anymore. Please contact the location and they can help you with the next step.", "cancel_blocked");
    return;
  }
  const name = await locationName(reservation.location_id);
  await saveSession(phone, { reservation_id: reservation.id, state: "confirm_cancel", pending_action: "cancel" });
  await reply(phone, reservation, `Just to confirm: you want to cancel your ${name} reservation on ${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)}. Reply YES to cancel it, or NO to keep it.`, "confirm_cancel");
}

async function prepareChange(phone: string, reservation: Reservation, intent?: ReservationSmsIntent) {
  if (!canModifyReservation(reservation.status)) {
    await reply(phone, reservation, "I can’t change that reservation by text anymore. Please contact the location and they can help you with the next step.", "change_blocked");
    return;
  }

  if (intent?.intent === "change_time" && intent.requested_time) {
    return prepareSpecificChange(phone, reservation, { reservation_time: intent.requested_time });
  }
  if (intent?.intent === "change_date" && intent.requested_date) {
    return prepareSpecificChange(phone, reservation, { reservation_date: intent.requested_date });
  }
  if (intent?.intent === "change_party" && intent.requested_party_size) {
    return prepareSpecificChange(phone, reservation, { party_size: intent.requested_party_size });
  }

  const name = await locationName(reservation.location_id);
  await saveSession(phone, { reservation_id: reservation.id, state: "choose_change", pending_action: "change" });
  await reply(phone, reservation, `Got it — what would you like to update for your ${name} reservation on ${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)}?\n\nYou can say things naturally, like “move it to 8:30 PM,” “change it to Friday,” or “make it for 4 people.” You can also reply TIME, DATE, or PARTY.`, "choose_change");
}

async function prepareSpecificChange(phone: string, reservation: Reservation, changes: Record<string, any>) {
  const reservationDate = changes.reservation_date || reservation.reservation_date;
  const reservationTime = String(changes.reservation_time || reservation.reservation_time).slice(0, 5);
  const partySize = Math.max(Number(changes.party_size || reservation.party_size || 2), 1);

  const availability = await checkReservationAvailability({
    location_id: reservation.location_id,
    location_type: reservation.location_type || undefined,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    party_size: partySize,
    exclude_reservation_id: reservation.id,
    user_id: reservation.user_id || null,
    customer_email: reservation.customer_email || null,
  });

  if (!availability.available) {
    await reply(phone, reservation, `That option isn’t available${availability.reason ? ` because ${availability.reason}` : ""}. Tell me another date, time, or party size and I’ll check it for you.`, "change_unavailable");
    return;
  }

  const next = { reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize };
  await saveSession(phone, { reservation_id: reservation.id, state: "confirm_change", pending_action: "change", pending_data: next });
  const name = await locationName(reservation.location_id);
  await reply(phone, reservation, `I can make that change. Your ${name} reservation would be ${formatDate(reservationDate)} at ${formatTime(reservationTime)} for ${partySize} guest${partySize === 1 ? "" : "s"}. Reply YES to confirm, or NO to keep your current reservation.`, "confirm_change");
}

async function applyChange(phone: string, reservation: Reservation, data: Record<string, any>) {
  if (!canModifyReservation(reservation.status)) {
    await clearSession(phone);
    await reply(phone, reservation, "That reservation can’t be changed anymore. Please contact the location for help.", "change_expired");
    return;
  }
  const reservationDate = String(data.reservation_date || reservation.reservation_date);
  const reservationTime = String(data.reservation_time || reservation.reservation_time).slice(0, 5);
  const partySize = Math.max(Number(data.party_size || reservation.party_size || 2), 1);
  const availability = await checkReservationAvailability({
    location_id: reservation.location_id,
    location_type: reservation.location_type || undefined,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    party_size: partySize,
    exclude_reservation_id: reservation.id,
    user_id: reservation.user_id || null,
    customer_email: reservation.customer_email || null,
  });
  if (!availability.available) {
    await clearSession(phone);
    await reply(phone, reservation, `That option became unavailable before I could confirm it${availability.reason ? ` because ${availability.reason}` : ""}. Reply CHANGE and I’ll help you choose another option.`, "change_race_lost");
    return;
  }

  const oldDate = reservation.reservation_date;
  const oldTime = String(reservation.reservation_time).slice(0, 5);
  const { data: updated, error } = await supabaseAdmin
    .from("location_reservations")
    .update({ reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize, updated_at: new Date().toISOString() })
    .eq("id", reservation.id)
    .select("id,location_id,location_type,user_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,deposit_status,stripe_payment_intent_id,confirmation_code,customer_token")
    .single();
  if (error) throw error;

  if (oldDate !== reservationDate || oldTime !== reservationTime) {
    await supabaseAdmin.from("reservation_slot_locks").delete().eq("location_id", reservation.location_id).eq("reservation_date", oldDate).eq("reservation_time", oldTime);
  }
  await supabaseAdmin.from("reservation_activity_logs").insert({
    location_id: reservation.location_id,
    reservation_id: reservation.id,
    action: "customer_sms_rescheduled",
    details: { from: { date: oldDate, time: oldTime, party_size: reservation.party_size }, to: { date: reservationDate, time: reservationTime, party_size: partySize } },
  });
  await trackLocationAnalyticsEvent({
    locationId: reservation.location_id,
    userId: reservation.user_id || null,
    eventType: "reservation_modified",
    eventSource: "reservation_sms",
    metadata: { reservation_id: reservation.id, reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize },
  });
  await clearSession(phone);
  const name = await locationName(reservation.location_id);
  await reply(phone, updated as Reservation, `You’re all set. Your ${name} reservation is now ${formatDate(reservationDate)} at ${formatTime(reservationTime)} for ${partySize} guest${partySize === 1 ? "" : "s"}.`, "change_completed");
}

async function notifyFirstWaitlistMatch(reservation: Reservation, name: string) {
  const { data: waitlist } = await supabaseAdmin
    .from("reservation_waitlist")
    .select("*")
    .eq("location_id", reservation.location_id)
    .eq("reservation_date", reservation.reservation_date)
    .eq("reservation_time", String(reservation.reservation_time).slice(0, 5))
    .eq("status", "waiting")
    .gte("party_size", 1)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!waitlist) return;
  await supabaseAdmin.from("reservation_waitlist").update({ status: "notified", notified_at: new Date().toISOString() }).eq("id", waitlist.id);
  await Promise.allSettled([
    sendWaitlistAvailableEmail({ to: waitlist.contact_email, locationName: name, reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time, partySize: waitlist.party_size }),
    sendWaitlistSMS({ to: waitlist.contact_phone || waitlist.customer_phone, locationName: name, reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time }),
  ]);
}

async function applyCancel(phone: string, reservation: Reservation) {
  if (!canCancelReservation(reservation.status)) {
    await clearSession(phone);
    await reply(phone, reservation, "That reservation can’t be cancelled anymore. Please contact the location for help.", "cancel_expired");
    return;
  }

  let refundId: string | null = null;
  if (reservation.deposit_status === "paid" && reservation.stripe_payment_intent_id) {
    const refund = await stripeRequest<{ id: string }>("/refunds", {
      body: new URLSearchParams({ payment_intent: reservation.stripe_payment_intent_id, reverse_transfer: "true", refund_application_fee: "true", "metadata[reservation_id]": reservation.id, "metadata[type]": "reservation_deposit" }),
      idempotencyKey: `reservation-cancel-refund-${reservation.id}`,
    });
    refundId = refund.id;
  }

  const now = new Date().toISOString();
  const { data: cancelled, error } = await supabaseAdmin
    .from("location_reservations")
    .update({ status: "cancelled", cancelled_at: now, customer_cancelled_at: now, updated_at: now, ...(refundId ? { deposit_refund_id: refundId } : {}) })
    .eq("id", reservation.id)
    .select("id,location_id,location_type,user_id,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,deposit_status,stripe_payment_intent_id,confirmation_code,customer_token")
    .single();
  if (error) throw error;

  await supabaseAdmin.from("reservation_slot_locks").delete().eq("location_id", reservation.location_id).eq("reservation_date", reservation.reservation_date).eq("reservation_time", String(reservation.reservation_time).slice(0, 5));
  const name = await locationName(reservation.location_id);
  await trackLocationAnalyticsEvent({
    locationId: reservation.location_id,
    userId: reservation.user_id || null,
    eventType: "reservation_cancelled",
    eventSource: "reservation_sms",
    metadata: { party_size: reservation.party_size, reservation_date: reservation.reservation_date, reservation_time: reservation.reservation_time, reservation_id: reservation.id },
  });
  await notifyFirstWaitlistMatch(reservation, name);
  await Promise.allSettled([
    sendReservationCancelledEmail({ to: reservation.customer_email, locationName: name, reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time, partySize: reservation.party_size, confirmationCode: reservation.confirmation_code || reservation.customer_token }),
    sendReservationCancelledSMS({ to: reservation.customer_phone, locationName: name, reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time }),
  ]);
  await supabaseAdmin.from("reservation_activity_logs").insert({ location_id: reservation.location_id, reservation_id: reservation.id, action: "customer_sms_cancelled", details: { refund_id: refundId } });
  await logEvent("reservation_audit", { action: "customer_sms_cancelled", reservationId: reservation.id, userId: reservation.user_id || null, locationId: reservation.location_id });
  await clearSession(phone);

  // The standard cancellation SMS above is the customer confirmation. Keep the thread linked as well.
  await appendReservationMessage({
    reservation: cancelled as Reservation,
    direction: "system",
    channel: "system",
    body: `Reservation cancelled by customer via SMS${refundId ? " and deposit refund initiated" : ""}.`,
    sourceRecordId: `reservation-sms-cancel:${reservation.id}:${now}`,
    metadata: { source: "reservation_sms_action", refund_id: refundId },
  });
}

async function showDetails(phone: string, reservation: Reservation) {
  const name = await locationName(reservation.location_id);
  await reply(phone, reservation, `Here’s your reservation: ${reservationSummary(reservation, name)}. If you want to make a change, just tell me what you’d like to update. You can also reply CANCEL or HELP.`, "details");
}

function commandIntent(text: string): ReservationSmsIntent | null {
  const normalized = text.trim().toUpperCase();
  if (normalized === "CANCEL") return { intent: "cancel", requested_date: null, requested_time: null, requested_party_size: null, confidence: 1 };
  if (["CHANGE", "RESCHEDULE", "MOVE"].includes(normalized)) return { intent: "unknown", requested_date: null, requested_time: null, requested_party_size: null, confidence: 1 };
  if (normalized === "DETAILS") return { intent: "details", requested_date: null, requested_time: null, requested_party_size: null, confidence: 1 };
  return null;
}

export async function processReservationSmsAction(input: { from: string; text: string }) {
  const phone = normalizePhone(input.from);
  const raw = input.text.trim();
  const upper = raw.toUpperCase();
  if (!phone || !raw) return { handled: false };

  const session = await getSession(phone);
  if (session) {
    const reservation = await reservationById(session.reservation_id);

    if (upper === "NO") {
      await clearSession(phone);
      await reply(phone, reservation, "No problem — I left your reservation exactly as it is.", "cancel_session");
      return { handled: true, action: "session_cancelled" };
    }

    if (session.state === "select_reservation") {
      const index = Number(raw) - 1;
      const ids = Array.isArray(session.pending_data?.reservation_ids) ? session.pending_data!.reservation_ids : [];
      if (!Number.isInteger(index) || index < 0 || index >= ids.length) {
        await reply(phone, null, `I didn’t catch a reservation number. Reply with a number from 1 to ${ids.length}, or NO to exit.`, "select_reservation_retry");
        return { handled: true, action: "selection_retry" };
      }
      const selected = await reservationById(String(ids[index]));
      if (!selected || normalizePhone(selected.customer_phone || "") !== phone) {
        await clearSession(phone);
        await reply(phone, null, "I couldn’t safely match that reservation. Reply HELP and I’ll show you your options.", "selection_invalid");
        return { handled: true, action: "selection_invalid" };
      }
      if (session.pending_action === "cancel") await prepareCancel(phone, selected);
      else if (session.pending_action === "details") await showDetails(phone, selected);
      else if (session.pending_action === "change") await prepareChange(phone, selected, session.pending_data?.intent);
      return { handled: true, action: `selected_${session.pending_action}` };
    }

    if (!reservation || normalizePhone(reservation.customer_phone || "") !== phone) {
      await clearSession(phone);
      return { handled: false };
    }

    if (session.state === "confirm_cancel") {
      if (upper !== "YES") {
        await reply(phone, reservation, "I just need a YES to cancel it, or NO to leave it as-is.", "confirm_cancel_retry");
        return { handled: true, action: "confirm_cancel_retry" };
      }
      await applyCancel(phone, reservation);
      return { handled: true, action: "reservation_cancelled" };
    }

    if (session.state === "confirm_change") {
      if (upper !== "YES") {
        await reply(phone, reservation, "Reply YES to confirm that change, or NO to keep your current reservation.", "confirm_change_retry");
        return { handled: true, action: "confirm_change_retry" };
      }
      await applyChange(phone, reservation, session.pending_data || {});
      return { handled: true, action: "reservation_changed" };
    }

    if (session.state === "choose_change") {
      if (upper === "TIME") {
        await saveSession(phone, { reservation_id: reservation.id, state: "await_time", pending_action: "change" });
        await reply(phone, reservation, "Sure — what time would you prefer? You can say something like 8:30 PM.", "await_time");
        return { handled: true, action: "await_time" };
      }
      if (upper === "DATE") {
        await saveSession(phone, { reservation_id: reservation.id, state: "await_date", pending_action: "change" });
        await reply(phone, reservation, "Sure — what date works better? You can say tomorrow, Saturday, or a date like 08/25/2026.", "await_date");
        return { handled: true, action: "await_date" };
      }
      if (["PARTY", "GUESTS", "PEOPLE"].includes(upper)) {
        await saveSession(phone, { reservation_id: reservation.id, state: "await_party", pending_action: "change" });
        await reply(phone, reservation, "Of course — how many guests should I change the reservation to?", "await_party");
        return { handled: true, action: "await_party" };
      }
      const parsed = await parseReservationSmsIntent({ text: raw, currentDate: new Date().toISOString().slice(0, 10), reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time, partySize: reservation.party_size });
      if (parsed.confidence >= 0.8 && ["change_time", "change_date", "change_party"].includes(parsed.intent)) {
        await prepareChange(phone, reservation, parsed);
        return { handled: true, action: parsed.intent, source: parsed.source };
      }
      await reply(phone, reservation, "I’m not sure which part you want to change yet. Tell me the new time, date, or party size — for example, “8:30 PM,” “Friday,” or “4 people.”", "change_unclear");
      return { handled: true, action: "change_unclear" };
    }

    if (["await_time", "await_date", "await_party"].includes(session.state)) {
      const prefix = session.state === "await_time" ? "Change time request: " : session.state === "await_date" ? "Change date request: " : "Change party size request: ";
      const parsed = await parseReservationSmsIntent({ text: `${prefix}${raw}`, currentDate: new Date().toISOString().slice(0, 10), reservationDate: reservation.reservation_date, reservationTime: reservation.reservation_time, partySize: reservation.party_size });
      const valid = session.state === "await_time" ? parsed.intent === "change_time" && parsed.requested_time : session.state === "await_date" ? parsed.intent === "change_date" && parsed.requested_date : parsed.intent === "change_party" && parsed.requested_party_size;
      if (!valid || parsed.confidence < 0.75) {
        await reply(phone, reservation, "I couldn’t confidently understand that. Try saying it another way, or reply NO to exit.", "change_value_unclear");
        return { handled: true, action: "change_value_unclear", source: parsed.source };
      }
      await prepareChange(phone, reservation, parsed);
      return { handled: true, action: parsed.intent, source: parsed.source };
    }
  }

  const reservations = await activeReservations(phone);
  const deterministic = commandIntent(raw);
  let intent: (ReservationSmsIntent & { source?: string }) | null = deterministic;

  if (!intent && reservations.length) {
    const first = reservations[0];
    intent = await parseReservationSmsIntent({ text: raw, currentDate: new Date().toISOString().slice(0, 10), reservationDate: first.reservation_date, reservationTime: first.reservation_time, partySize: first.party_size });
    if (intent.confidence < 0.8 || intent.intent === "unknown" || intent.intent === "help") return { handled: false };
  }

  if (!intent) return { handled: false };
  if (!reservations.length) {
    await reply(phone, null, "I couldn’t find an active TheOutHaven reservation connected to this phone number. Reply HELP if you need assistance.", "no_reservation");
    return { handled: true, action: "no_reservation" };
  }

  const action = deterministic && ["CHANGE", "RESCHEDULE", "MOVE"].includes(upper) ? "change" : intent.intent === "cancel" ? "cancel" : intent.intent === "details" ? "details" : ["change_time", "change_date", "change_party"].includes(intent.intent) ? "change" : "unknown";
  if (action === "unknown") return { handled: false };

  if (reservations.length > 1) {
    await askWhichReservation(phone, reservations, action, { intent });
    return { handled: true, action: "select_reservation", source: intent.source };
  }

  const reservation = reservations[0];
  if (action === "cancel") await prepareCancel(phone, reservation);
  else if (action === "details") await showDetails(phone, reservation);
  else await prepareChange(phone, reservation, intent);
  return { handled: true, action, source: intent.source };
}
