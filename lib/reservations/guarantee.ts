import "server-only";

import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripeRequest } from "@/lib/stripe/server";

type GuaranteeReason = "late_cancel" | "no_show";

type ReservationGuaranteeRecord = {
  id: string;
  location_id: string;
  reservation_date?: string | null;
  reservation_time?: string | null;
  party_size?: number | null;
  guarantee_required?: boolean | null;
  guarantee_status?: string | null;
  guarantee_cancel_cutoff_hours?: number | null;
  guarantee_late_cancel_fee_type?: string | null;
  guarantee_late_cancel_fee_cents?: number | null;
  guarantee_no_show_fee_type?: string | null;
  guarantee_no_show_fee_cents?: number | null;
  stripe_payment_method_id?: string | null;
};

function feeForReason(reservation: ReservationGuaranteeRecord, reason: GuaranteeReason) {
  const perPerson = reason === "late_cancel"
    ? reservation.guarantee_late_cancel_fee_type === "per_person"
    : reservation.guarantee_no_show_fee_type === "per_person";
  const base = Math.max(0, Number(
    reason === "late_cancel"
      ? reservation.guarantee_late_cancel_fee_cents || 0
      : reservation.guarantee_no_show_fee_cents || 0,
  ));
  return perPerson ? base * Math.max(1, Number(reservation.party_size || 1)) : base;
}

function newYorkOffsetMinutes(date: Date) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value || "GMT-5";
  const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return -300;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "+" ? minutes : -minutes;
}

function reservationEpoch(reservationDate?: string | null, reservationTime?: string | null) {
  const match = String(reservationDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = String(reservationTime || "").slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  if (!match || !time) return null;
  const utcGuess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(time[1]), Number(time[2]));
  const firstGuess = new Date(utcGuess);
  const offset = newYorkOffsetMinutes(firstGuess);
  return utcGuess - offset * 60_000;
}

export function isReservationLateCancellation(reservation: ReservationGuaranteeRecord, now = new Date()) {
  const startsAt = reservationEpoch(reservation.reservation_date, reservation.reservation_time);
  if (startsAt === null) return false;
  const cutoffHours = Math.max(0, Number(reservation.guarantee_cancel_cutoff_hours || 0));
  return now.getTime() > startsAt - cutoffHours * 60 * 60 * 1000;
}

export async function releaseReservationGuarantee(reservationId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("location_reservations")
    .update({ guarantee_status: "released", guarantee_released_at: now, updated_at: now })
    .eq("id", reservationId)
    .eq("guarantee_status", "active")
    .select("id,guarantee_status")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function chargeReservationGuarantee(
  reservation: ReservationGuaranteeRecord,
  reason: GuaranteeReason,
) {
  if (!reservation.guarantee_required || reservation.guarantee_status !== "active") {
    return { charged: false, amountCents: 0, reason: "guarantee_not_active" as const };
  }
  if (!reservation.stripe_payment_method_id) {
    throw new Error("Reservation guarantee is missing a saved payment method.");
  }

  const amountCents = feeForReason(reservation, reason);
  if (amountCents <= 0) {
    await releaseReservationGuarantee(reservation.id);
    return { charged: false, amountCents: 0, reason: "no_fee_configured" as const };
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
    .eq("id", reservation.location_id)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location?.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
    throw new Error("This location is not ready to collect reservation guarantee charges.");
  }

  const decisions = await Promise.all([
    getFraudDecision("reservation", reservation.id),
    getFraudDecision("location", reservation.location_id),
    getFraudDecision("payout", `connect-account:${location.stripe_connect_account_id}`),
  ]);
  if (decisions.some(fraudDecisionPreventsSensitiveAction)) {
    throw new Error("This reservation charge is temporarily unavailable while risk checks are completed.");
  }

  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    payment_method: reservation.stripe_payment_method_id,
    confirm: "true",
    off_session: "true",
    description: reason === "no_show" ? "TheOutHaven reservation no-show fee" : "TheOutHaven reservation late-cancellation fee",
    "metadata[type]": `reservation_${reason}`,
    "metadata[reservation_id]": reservation.id,
    "metadata[location_id]": reservation.location_id,
  });

  try {
    const paymentIntent = await stripeRequest<{ id: string; status: string }>("/payment_intents", {
      body: params,
      stripeAccount: location.stripe_connect_account_id,
      idempotencyKey: `reservation-guarantee-${reason}-${reservation.id}-${amountCents}`,
    });

    if (!["succeeded", "processing"].includes(paymentIntent.status)) {
      throw new Error(`Reservation guarantee charge did not complete (${paymentIntent.status}).`);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("location_reservations")
      .update({
        guarantee_status: "charged",
        guarantee_charged_at: now,
        guarantee_charge_payment_intent_id: paymentIntent.id,
        updated_at: now,
      })
      .eq("id", reservation.id);
    if (updateError) throw updateError;

    return { charged: true, amountCents, paymentIntentId: paymentIntent.id };
  } catch (error) {
    await supabaseAdmin
      .from("location_reservations")
      .update({ guarantee_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .eq("guarantee_status", "active");
    throw error;
  }
}
