import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeBillingStatus } from "@/lib/billing/plans";
import { fulfillPaidExperienceBooking } from "@/lib/experiences/paid-booking-fulfillment";
import { linkFraudIdentity, recordFraudSignal, type FraudSubjectType } from "@/lib/fraud";
import { logEvent } from "@/lib/monitoring";
import { supabaseAdmin } from "@/lib/supabase-admin";

function verifyStripeSignature(payload: string, signatureHeader: string, webhookSecret: string) {
  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = entries.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = entries.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3)).filter(Boolean);
  if (!timestamp || signatures.length === 0) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((value) => { try { const received = Buffer.from(value, "hex"); return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer); } catch { return false; } });
}

const ts = (v?: number | null) => v ? new Date(v * 1000).toISOString() : null;
const addDaysFrom = (date: Date, days: number) => new Date(date.getTime() + days * 86400000).toISOString();
const subIdOf = (o: any) => {
  if (typeof o?.subscription === "string") return o.subscription;
  if (o?.subscription?.id) return o.subscription.id;
  return o?.object === "subscription" ? o.id || null : null;
};
const customerIdOf = (o: any) => typeof o.customer === "string" ? o.customer : o.customer?.id || null;

async function settleFraudEvidence(tasks: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(tasks);
  for (const result of results) if (result.status === "rejected") console.warn("Stripe fraud evidence write failed", result.reason);
}

async function resolveLocation(object: any, metadata: Record<string, any>) {
  const metadataLocationId = String(metadata.location_id || "").trim();
  if (metadataLocationId) {
    const { data } = await supabaseAdmin.from("locations").select("id").eq("id", metadataLocationId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const subscriptionId = subIdOf(object);
  if (subscriptionId) {
    const { data } = await supabaseAdmin.from("locations").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const customerId = customerIdOf(object);
  if (customerId) {
    const { data } = await supabaseAdmin.from("locations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

async function resolveReservationId(object: any, metadata: Record<string, any>) {
  const metadataReservationId = String(metadata.reservation_id || "").trim();
  if (metadataReservationId) return metadataReservationId;
  const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : typeof object.id === "string" && object.id.startsWith("pi_") ? object.id : null;
  if (!paymentIntentId) return null;
  const { data, error } = await supabaseAdmin.from("location_reservations").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function resolveExperienceBookingId(object: any, metadata: Record<string, any>) {
  const metadataBookingId = String(metadata.booking_id || "").trim();
  if (metadataBookingId) return metadataBookingId;
  const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : typeof object.id === "string" && object.id.startsWith("pi_") ? object.id : null;
  if (!paymentIntentId) return null;
  const { data, error } = await supabaseAdmin.from("experience_bookings").select("id").eq("provider_payment_intent_id", paymentIntentId).maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

function paymentFingerprintOf(object: any) {
  return String(object?.payment_method_details?.card?.fingerprint || object?.payment_method_details?.us_bank_account?.fingerprint || "").trim() || null;
}

async function recordPaymentFraud(input: { event: any; object: any; metadata: Record<string, any>; locationId: string | null; signalType: string; severity: number; scoreDelta: number; category: string; reservationId?: string | null; evidence?: Record<string, unknown> }) {
  const subjectType: FraudSubjectType = input.reservationId ? "reservation" : "payment";
  const subjectId = input.reservationId || String(input.object.id || input.event.id);
  const tasks: Array<Promise<unknown>> = [recordFraudSignal({
    subjectType, subjectId, relatedSubjectType: input.locationId ? "location" : null, relatedSubjectId: input.locationId,
    signalType: input.signalType, category: input.category, source: "stripe_webhook", severity: input.severity, scoreDelta: input.scoreDelta,
    evidence: { stripe_event_id: input.event.id, stripe_object_id: input.object.id || null, location_id: input.locationId, ...input.evidence },
    dedupeKey: `stripe-fraud:${input.event.id}:${input.signalType}:${subjectType}:${subjectId}`,
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  })];
  const fingerprint = paymentFingerprintOf(input.object);
  if (fingerprint) tasks.push(linkFraudIdentity({ identityType: "payment_fingerprint", rawValue: fingerprint, subjectType, subjectId, source: "stripe_webhook", metadata: { provider: "stripe" } }));
  const userId = String(input.metadata.user_id || "").trim();
  if (userId && input.category === "chargeback") tasks.push(recordFraudSignal({ subjectType: "user", subjectId: userId, relatedSubjectType: subjectType, relatedSubjectId: subjectId, signalType: input.signalType, category: "payments", source: "stripe_webhook", ruleKey: "user_chargeback_pattern", severity: input.severity, scoreDelta: input.scoreDelta, evidence: { stripe_event_id: input.event.id, location_id: input.locationId }, dedupeKey: `stripe-user-chargeback:${input.event.id}:${userId}`, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() }));
  await settleFraudEvidence(tasks);
}

async function claimPaymentEvent(event: any, object: any, locationId: string | null) {
  const { data: existing, error: readError } = await supabaseAdmin.from("payment_logs").select("id,processed_at,processing_attempts").eq("stripe_event_id", event.id).maybeSingle();
  if (readError) throw readError;
  if (existing?.processed_at) return { duplicate: true };
  const payload = { provider: "stripe", event_type: event.type, stripe_event_id: event.id || null, stripe_customer_id: customerIdOf(object), stripe_subscription_id: subIdOf(object), stripe_invoice_id: event.type.startsWith("invoice.") ? object.id : null, location_id: locationId, amount_paid_cents: object.amount_paid ?? object.amount_total ?? object.amount_received ?? null, amount_due_cents: object.amount_due ?? null, currency: object.currency || null, status: object.payment_status || object.status || null, payload: event, processed_at: null, processing_attempts: Number(existing?.processing_attempts || 0) + 1, processing_error: null };
  const query = existing ? supabaseAdmin.from("payment_logs").update(payload).eq("id", existing.id) : supabaseAdmin.from("payment_logs").insert(payload);
  const { error } = await query;
  if (error) throw error;
  return { duplicate: false };
}

async function getExistingGrace(locationId: string | null) {
  if (!locationId) return null;
  const { data, error } = await supabaseAdmin.from("locations").select("past_due_at,billing_grace_ends_at").eq("id", locationId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 401 });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  const rawBody = await request.text();
  let event: any;
  try {
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) throw new Error("Signature verification failed.");
    event = JSON.parse(rawBody);
  } catch {
    await logEvent("failed_stripe", { reason: "invalid_signature" });
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 401 });
  }

  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const locationId = await resolveLocation(object, metadata);
  const claimed = await claimPaymentEvent(event, object, locationId);
  if (claimed.duplicate) return NextResponse.json({ received: true, duplicate: true });
  const updateLocation = async (update: Record<string, unknown>) => {
    if (!locationId) return;
    const { error } = await supabaseAdmin.from("locations").update(update).eq("id", locationId);
    if (error) throw error;
  };
  const price = object.items?.data?.[0]?.price || object.lines?.data?.[0]?.price || {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (metadata.type === "experience_booking" && metadata.booking_id && object.payment_status === "paid") {
          const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : null;
          await supabaseAdmin.from("experience_bookings").update({ provider_checkout_session_id: object.id || null, provider_payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() }).eq("id", metadata.booking_id);
          await fulfillPaidExperienceBooking(String(metadata.booking_id), paymentIntentId);
          break;
        }
        if (metadata.plan === "business_pro" || metadata.source === "business_billing") {
          await updateLocation({ stripe_customer_id: customerIdOf(object), stripe_subscription_id: object.subscription || null, subscription_plan: "business_pro" });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await updateLocation({ subscription_plan: "business_pro", subscription_status: normalizeBillingStatus(object.status), stripe_customer_id: customerIdOf(object), stripe_subscription_id: object.id, current_period_start: ts(object.current_period_start), current_period_end: ts(object.current_period_end), next_billing_date: ts(object.current_period_end), trial_ends_at: ts(object.trial_end), cancel_at_period_end: Boolean(object.cancel_at_period_end), canceled_at: ts(object.canceled_at), stripe_price_id: price.id || null, subscription_interval: price.recurring?.interval || null, subscription_amount_cents: price.unit_amount ?? null, subscription_currency: price.currency || object.currency || "usd" });
        break;

      case "invoice.payment_succeeded":
      case "invoice.paid":
        await updateLocation({ subscription_status: "active", last_payment_succeeded_at: new Date().toISOString(), past_due_at: null, billing_grace_ends_at: null, current_period_start: ts(object.lines?.data?.[0]?.period?.start), current_period_end: ts(object.lines?.data?.[0]?.period?.end), next_billing_date: ts(object.lines?.data?.[0]?.period?.end) });
        break;

      case "invoice.payment_failed": {
        await logEvent("failed_stripe", { type: event.type, eventId: event.id || null, locationId });
        const current = await getExistingGrace(locationId);
        const firstFailureAt = current?.past_due_at ? new Date(current.past_due_at) : new Date();
        const graceEndsAt = current?.billing_grace_ends_at || addDaysFrom(firstFailureAt, 14);
        await updateLocation({ subscription_status: "grace_period", past_due_at: current?.past_due_at || firstFailureAt.toISOString(), last_payment_failed_at: new Date().toISOString(), billing_grace_ends_at: graceEndsAt });
        break;
      }

      case "invoice.payment_action_required":
        await logEvent("failed_stripe", { type: event.type, eventId: event.id || null, locationId, actionRequired: true });
        await updateLocation({ last_payment_failed_at: new Date().toISOString() });
        break;

      case "invoice.finalization_failed":
        await logEvent("failed_stripe", { type: event.type, eventId: event.id || null, locationId, finalizationFailed: true });
        break;

      case "customer.subscription.deleted":
        await updateLocation({ subscription_status: "canceled", subscription_plan: "free_discovery", canceled_at: new Date().toISOString(), cancel_at_period_end: false, billing_grace_ends_at: null });
        break;

      case "payment_intent.succeeded":
        if (metadata.type === "experience_booking" && metadata.booking_id) {
          await fulfillPaidExperienceBooking(String(metadata.booking_id), object.id);
        } else if (metadata.type === "reservation_deposit" && metadata.reservation_id) {
          const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "paid", status: "confirmed", stripe_payment_intent_id: object.id, deposit_paid_at: new Date().toISOString() }).eq("id", metadata.reservation_id);
          if (error) throw error;
        }
        break;

      case "payment_intent.payment_failed": {
        const experienceBookingId = await resolveExperienceBookingId(object, metadata);
        if (metadata.type === "experience_booking" && experienceBookingId) {
          const { error } = await supabaseAdmin.from("experience_bookings").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("id", experienceBookingId);
          if (error) throw error;
          break;
        }
        const reservationId = await resolveReservationId(object, metadata);
        if (metadata.type === "reservation_deposit" && reservationId) {
          const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "failed" }).eq("id", reservationId);
          if (error) throw error;
          await recordPaymentFraud({ event, object, metadata, locationId, reservationId, signalType: "reservation_payment_failed", category: "payment_velocity", severity: 2, scoreDelta: 8, evidence: { decline_code: object.last_payment_error?.decline_code || null } });
        }
        break;
      }

      case "charge.refunded": {
        const experienceBookingId = await resolveExperienceBookingId(object, metadata);
        if (experienceBookingId) {
          const { error } = await supabaseAdmin.from("experience_bookings").update({ payment_status: "refunded", status: "cancelled", updated_at: new Date().toISOString() }).eq("id", experienceBookingId);
          if (error) throw error;
          break;
        }
        if (metadata.type === "reservation_deposit" && metadata.reservation_id) {
          const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "refunded", status: "cancelled", deposit_refunded_at: new Date().toISOString() }).eq("id", metadata.reservation_id);
          if (error) throw error;
        }
        break;
      }

      case "charge.dispute.created": {
        const reservationId = await resolveReservationId(object, metadata);
        await recordPaymentFraud({ event, object, metadata, locationId, reservationId, signalType: "chargeback_created", category: "chargeback", severity: 5, scoreDelta: 60, evidence: { amount: object.amount || null, currency: object.currency || null, reason: object.reason || null, status: object.status || null } });
        break;
      }

      case "charge.dispute.closed": {
        const reservationId = await resolveReservationId(object, metadata);
        if (object.status === "won") await recordPaymentFraud({ event, object, metadata, locationId, reservationId, signalType: "chargeback_reversed", category: "chargeback", severity: 1, scoreDelta: -60, evidence: { amount: object.amount || null, currency: object.currency || null, status: object.status } });
        break;
      }
    }

    const { error: completeError } = await supabaseAdmin.from("payment_logs").update({ processed_at: new Date().toISOString(), location_id: locationId, processing_error: null }).eq("stripe_event_id", event.id);
    if (completeError) throw completeError;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from("payment_logs").update({ processing_error: message }).eq("stripe_event_id", event.id);
    await logEvent("failed_stripe", { reason: "webhook_processing_failed", eventId: event.id, message });
    return NextResponse.json({ error: "Stripe event processing failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
