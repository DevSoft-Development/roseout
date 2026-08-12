import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logEvent } from "@/lib/monitoring";
import { normalizeBillingStatus } from "@/lib/billing/plans";

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
const addDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const subIdOf = (o: any) => typeof o.subscription === "string" ? o.subscription : o.subscription?.id || o.id;
const customerIdOf = (o: any) => typeof o.customer === "string" ? o.customer : o.customer?.id || null;

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

async function claimPaymentEvent(event: any, object: any, locationId: string | null) {
  const { data: existing, error: readError } = await supabaseAdmin.from("payment_logs").select("id,processed_at,processing_attempts").eq("stripe_event_id", event.id).maybeSingle();
  if (readError) throw readError;
  if (existing?.processed_at) return { duplicate: true };
  const payload = {
    provider: "stripe",
    event_type: event.type,
    stripe_event_id: event.id || null,
    stripe_customer_id: customerIdOf(object),
    stripe_subscription_id: subIdOf(object),
    stripe_invoice_id: event.type.startsWith("invoice.") ? object.id : null,
    location_id: locationId,
    amount_paid_cents: object.amount_paid ?? null,
    amount_due_cents: object.amount_due ?? null,
    currency: object.currency || null,
    status: object.status || null,
    payload: event,
    processed_at: null,
    processing_attempts: Number(existing?.processing_attempts || 0) + 1,
    processing_error: null,
  };
  const query = existing
    ? supabaseAdmin.from("payment_logs").update(payload).eq("id", existing.id)
    : supabaseAdmin.from("payment_logs").insert(payload);
  const { error } = await query;
  if (error) throw error;
  return { duplicate: false };
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 401 });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  const rawBody = await request.text();
  let event: any;
  try { if (!verifyStripeSignature(rawBody, signature, webhookSecret)) throw new Error("Signature verification failed."); event = JSON.parse(rawBody); }
  catch { await logEvent("failed_stripe", { reason: "invalid_signature" }); return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 401 }); }

  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const locationId = await resolveLocation(object, metadata);
  const claimed = await claimPaymentEvent(event, object, locationId);
  if (claimed.duplicate) return NextResponse.json({ received: true, duplicate: true });
  const updateLocation = async (update: Record<string, unknown>) => { if (locationId) { const { error } = await supabaseAdmin.from("locations").update(update).eq("id", locationId); if (error) throw error; } };
  const price = object.items?.data?.[0]?.price || object.lines?.data?.[0]?.price || {};
  try { switch (event.type) {
    case "checkout.session.completed":
      await updateLocation({ stripe_customer_id: customerIdOf(object), stripe_subscription_id: object.subscription || null, subscription_plan: "business_pro", subscription_status: normalizeBillingStatus(object.status === "trialing" ? "trialing" : "active") });
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await updateLocation({ subscription_plan: "business_pro", subscription_status: normalizeBillingStatus(object.status), stripe_customer_id: customerIdOf(object), stripe_subscription_id: object.id, current_period_start: ts(object.current_period_start), current_period_end: ts(object.current_period_end), next_billing_date: ts(object.current_period_end), trial_ends_at: ts(object.trial_end), cancel_at_period_end: Boolean(object.cancel_at_period_end), canceled_at: ts(object.canceled_at), stripe_price_id: price.id || null, subscription_interval: price.recurring?.interval || null, subscription_amount_cents: price.unit_amount ?? null, subscription_currency: price.currency || object.currency || "usd" });
      break;
    case "invoice.payment_succeeded":
      await updateLocation({ subscription_status: "active", last_payment_succeeded_at: new Date().toISOString(), past_due_at: null, billing_grace_ends_at: null, current_period_start: ts(object.lines?.data?.[0]?.period?.start), current_period_end: ts(object.lines?.data?.[0]?.period?.end), next_billing_date: ts(object.lines?.data?.[0]?.period?.end) });
      break;
    case "invoice.payment_failed":
      await logEvent("failed_stripe", { type: event.type, eventId: event.id || null, locationId });
      await updateLocation({ subscription_status: "past_due", past_due_at: new Date().toISOString(), last_payment_failed_at: new Date().toISOString(), billing_grace_ends_at: addDays(14) });
      break;
    case "customer.subscription.deleted":
      await updateLocation({ subscription_status: "canceled", subscription_plan: "free_discovery", canceled_at: new Date().toISOString(), cancel_at_period_end: false });
      break;
    case "payment_intent.succeeded":
      if (metadata.type === "reservation_deposit" && metadata.reservation_id) { const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "paid", status: "confirmed", stripe_payment_intent_id: object.id, deposit_paid_at: new Date().toISOString() }).eq("id", metadata.reservation_id); if (error) throw error; }
      break;
    case "payment_intent.payment_failed":
      if (metadata.type === "reservation_deposit" && metadata.reservation_id) { const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "failed" }).eq("id", metadata.reservation_id); if (error) throw error; }
      break;
    case "charge.refunded":
      if (metadata.type === "reservation_deposit" && metadata.reservation_id) { const { error } = await supabaseAdmin.from("location_reservations").update({ deposit_status: "refunded", status: "cancelled", deposit_refunded_at: new Date().toISOString() }).eq("id", metadata.reservation_id); if (error) throw error; }
      break;
    case "account.updated":
      if (object.id) { const { error } = await supabaseAdmin.from("locations").update({ stripe_connect_onboarding_status: object.details_submitted && object.charges_enabled && object.payouts_enabled ? "complete" : object.details_submitted ? "restricted" : "pending", stripe_connect_details_submitted: Boolean(object.details_submitted), stripe_connect_charges_enabled: Boolean(object.charges_enabled), stripe_connect_payouts_enabled: Boolean(object.payouts_enabled), stripe_connect_updated_at: new Date().toISOString() }).eq("stripe_connect_account_id", object.id); if (error) throw error; }
      break;
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
