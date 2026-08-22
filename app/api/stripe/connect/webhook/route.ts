import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fulfillPaidEventTicket } from "@/lib/events/paid-ticket-fulfillment";
import { linkFraudIdentity, recordFraudSignal } from "@/lib/fraud";
import { logEvent } from "@/lib/monitoring";
import { supabaseAdmin } from "@/lib/supabase-admin";

function verifyStripeSignature(payload: string, signatureHeader: string, webhookSecret: string) {
  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = entries.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = entries
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;

  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((value) => {
    try {
      const received = Buffer.from(value, "hex");
      return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
    } catch {
      return false;
    }
  });
}

async function settleFraudEvidence(tasks: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn("Connect fraud evidence write failed", result.reason);
  }
}

async function resolveConnectOwner(accountId: string) {
  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,stripe_connect_payouts_enabled")
    .eq("stripe_connect_account_id", accountId)
    .maybeSingle();
  if (locationError) throw locationError;
  if (location?.id) return { locationId: String(location.id), organizationId: null, payoutsEnabled: Boolean(location.stripe_connect_payouts_enabled) };

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,stripe_connect_payouts_enabled")
    .eq("stripe_connect_account_id", accountId)
    .maybeSingle();
  if (organizationError) throw organizationError;
  return {
    locationId: null,
    organizationId: organization?.id ? String(organization.id) : null,
    payoutsEnabled: Boolean(organization?.stripe_connect_payouts_enabled),
  };
}

async function claimConnectEvent(event: any, object: any, locationId: string | null) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("payment_logs")
    .select("id,processed_at,processing_attempts")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.processed_at) return { duplicate: true };

  const payload = {
    provider: "stripe",
    event_type: event.type,
    stripe_event_id: event.id || null,
    stripe_customer_id: typeof object.customer === "string" ? object.customer : null,
    stripe_subscription_id: null,
    stripe_invoice_id: null,
    location_id: locationId,
    amount_paid_cents: object.amount_total ?? object.amount_received ?? object.amount ?? null,
    amount_due_cents: object.amount_due ?? null,
    currency: object.currency || null,
    status: object.payment_status || object.status || (object.details_submitted ? "submitted" : null),
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

async function resolveOrderId(object: any) {
  const metadataOrderId = String(object?.metadata?.order_id || "").trim();
  if (metadataOrderId) return metadataOrderId;
  const paymentIntentId = typeof object?.payment_intent === "string"
    ? object.payment_intent
    : typeof object?.id === "string" && String(object.id).startsWith("pi_")
      ? object.id
      : null;
  if (!paymentIntentId) return null;
  const { data, error } = await supabaseAdmin
    .from("event_ticket_orders")
    .select("id")
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

function ownerRelation(owner: { locationId: string | null; organizationId: string | null }) {
  if (owner.locationId) return { type: "location" as const, id: owner.locationId };
  if (owner.organizationId) return { type: "organizer" as const, id: owner.organizationId };
  return { type: null, id: null };
}

async function recordConnectRisk(input: {
  event: any;
  object: any;
  owner: { locationId: string | null; organizationId: string | null };
  subjectType: "order" | "payment" | "payout";
  subjectId: string;
  signalType: string;
  category: string;
  severity: number;
  scoreDelta: number;
  ruleKey?: string | null;
  evidence?: Record<string, unknown>;
  fingerprintType?: "payment_fingerprint" | "bank_fingerprint";
  fingerprint?: string | null;
}) {
  const related = ownerRelation(input.owner);
  const tasks: Array<Promise<unknown>> = [
    recordFraudSignal({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      relatedSubjectType: related.type,
      relatedSubjectId: related.id,
      signalType: input.signalType,
      category: input.category,
      source: "stripe_connect_webhook",
      ruleKey: input.ruleKey ?? null,
      severity: input.severity,
      scoreDelta: input.scoreDelta,
      evidence: { stripe_event_id: input.event.id, account_id: input.event.account || null, ...input.evidence },
      dedupeKey: `stripe-connect-fraud:${input.event.id}:${input.signalType}:${input.subjectType}:${input.subjectId}`,
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  ];
  if (input.fingerprintType && input.fingerprint) {
    tasks.push(linkFraudIdentity({
      identityType: input.fingerprintType,
      rawValue: input.fingerprint,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      source: "stripe_connect_webhook",
      metadata: { provider: "stripe" },
    }));
  }
  await settleFraudEvidence(tasks);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 401 });

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Connect webhook not configured." }, { status: 500 });

  const rawBody = await request.text();
  let event: any;
  try {
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) throw new Error("Signature verification failed.");
    event = JSON.parse(rawBody);
  } catch {
    await logEvent("failed_stripe", { reason: "invalid_connect_signature" });
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 401 });
  }

  const object = event.data?.object || {};
  const accountId = String(event.account || (event.type === "account.updated" ? object.id : "") || "");
  if (!event.id) return NextResponse.json({ error: "Invalid Connect event." }, { status: 400 });

  try {
    const owner = accountId
      ? await resolveConnectOwner(accountId)
      : { locationId: null, organizationId: null, payoutsEnabled: false };
    const claimed = await claimConnectEvent(event, object, owner.locationId);
    if (claimed.duplicate) return NextResponse.json({ received: true, duplicate: true });

    switch (event.type) {
      case "account.updated": {
        if (!accountId) break;
        const onboardingStatus = object.details_submitted && object.charges_enabled && object.payouts_enabled
          ? "complete"
          : object.details_submitted
            ? "restricted"
            : "pending";
        const update = {
          stripe_connect_onboarding_status: onboardingStatus,
          stripe_connect_details_submitted: Boolean(object.details_submitted),
          stripe_connect_charges_enabled: Boolean(object.charges_enabled),
          stripe_connect_payouts_enabled: Boolean(object.payouts_enabled),
          stripe_connect_updated_at: new Date().toISOString(),
        };
        if (owner.locationId) {
          const { error } = await supabaseAdmin.from("locations").update(update).eq("id", owner.locationId);
          if (error) throw error;
        } else if (owner.organizationId) {
          const { error } = await supabaseAdmin.from("organizations").update(update).eq("id", owner.organizationId);
          if (error) throw error;
        }

        const disabledReason = String(object.requirements?.disabled_reason || "").toLowerCase();
        if (owner.payoutsEnabled && !object.payouts_enabled) {
          const fraudRestriction = disabledReason.includes("fraud");
          await recordConnectRisk({
            event,
            object,
            owner,
            subjectType: "payout",
            subjectId: `connect-account:${accountId}`,
            signalType: fraudRestriction ? "stripe_fraud_restriction" : "payout_capability_removed",
            category: "payout_risk",
            severity: fraudRestriction ? 5 : 3,
            scoreDelta: fraudRestriction ? 75 : 20,
            evidence: { disabled_reason: disabledReason || null, payouts_enabled_before: true, payouts_enabled_after: false },
          });
        }
        break;
      }

      case "account.external_account.created":
      case "account.external_account.updated": {
        if (!accountId) break;
        await recordConnectRisk({
          event,
          object,
          owner,
          subjectType: "payout",
          subjectId: `connect-account:${accountId}`,
          signalType: "payout_destination_changed",
          category: "payout_risk",
          severity: 3,
          scoreDelta: 30,
          evidence: { external_account_object: object.object || null, country: object.country || null, currency: object.currency || null },
          fingerprintType: object.object === "bank_account" ? "bank_fingerprint" : "payment_fingerprint",
          fingerprint: String(object.fingerprint || "").trim() || null,
        });
        break;
      }

      case "payout.failed": {
        await recordConnectRisk({
          event,
          object,
          owner,
          subjectType: "payout",
          subjectId: String(object.id || event.id),
          signalType: "payout_failed",
          category: "payout_risk",
          severity: 3,
          scoreDelta: 25,
          evidence: { failure_code: object.failure_code || null, failure_message: object.failure_message || null, amount: object.amount || null, currency: object.currency || null },
        });
        break;
      }

      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (object?.metadata?.type !== "event_ticket_order" || object.payment_status !== "paid") break;
        const orderId = String(object.metadata.order_id || "").trim();
        if (!orderId) throw new Error("Paid event checkout is missing order metadata");
        const paymentIntentId = typeof object.payment_intent === "string" ? object.payment_intent : null;
        await supabaseAdmin.from("event_ticket_orders").update({
          provider_checkout_session_id: object.id || null,
          provider_payment_intent_id: paymentIntentId,
          payment_status: "paid",
          updated_at: new Date().toISOString(),
        }).eq("id", orderId);
        await fulfillPaidEventTicket(orderId, paymentIntentId);
        break;
      }

      case "checkout.session.expired": {
        if (object?.metadata?.type !== "event_ticket_order") break;
        const orderId = String(object.metadata.order_id || "").trim();
        if (orderId) {
          await supabaseAdmin.from("event_ticket_orders").update({ payment_status: "expired", status: "cancelled", updated_at: new Date().toISOString() }).eq("id", orderId).eq("status", "pending_payment");
        }
        break;
      }

      case "payment_intent.payment_failed": {
        if (object?.metadata?.type !== "event_ticket_order") break;
        const orderId = await resolveOrderId(object);
        if (orderId) {
          await supabaseAdmin.from("event_ticket_orders").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("id", orderId);
          await recordConnectRisk({
            event,
            object,
            owner,
            subjectType: "order",
            subjectId: orderId,
            signalType: "ticket_payment_failed",
            category: "payment_velocity",
            severity: 2,
            scoreDelta: 8,
            evidence: { decline_code: object.last_payment_error?.decline_code || null },
          });
        }
        break;
      }

      case "charge.refunded": {
        const orderId = await resolveOrderId(object);
        if (orderId) {
          await supabaseAdmin.from("event_ticket_orders").update({ payment_status: "refunded", status: "refunded", refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
          await supabaseAdmin.from("event_tickets").update({ status: "void", updated_at: new Date().toISOString() }).eq("order_id", orderId);
        }
        break;
      }

      case "charge.dispute.created": {
        const orderId = await resolveOrderId(object);
        if (orderId) {
          await supabaseAdmin.from("event_ticket_orders").update({ payment_status: "disputed", disputed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
        }
        await recordConnectRisk({
          event,
          object,
          owner,
          subjectType: orderId ? "order" : "payment",
          subjectId: orderId || String(object.id || event.id),
          signalType: "ticket_chargeback_created",
          category: "chargeback",
          severity: 5,
          scoreDelta: 60,
          ruleKey: orderId ? "event_ticketing_abuse" : null,
          evidence: { reason: object.reason || null, amount: object.amount || null, currency: object.currency || null, status: object.status || null },
        });
        break;
      }

      case "charge.dispute.closed": {
        if (object.status !== "won") break;
        const orderId = await resolveOrderId(object);
        await recordConnectRisk({
          event,
          object,
          owner,
          subjectType: orderId ? "order" : "payment",
          subjectId: orderId || String(object.id || event.id),
          signalType: "ticket_chargeback_reversed",
          category: "chargeback",
          severity: 1,
          scoreDelta: -60,
          evidence: { status: object.status },
        });
        break;
      }
    }

    const { error: completeError } = await supabaseAdmin
      .from("payment_logs")
      .update({ processed_at: new Date().toISOString(), location_id: owner.locationId, processing_error: null })
      .eq("stripe_event_id", event.id);
    if (completeError) throw completeError;

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from("payment_logs").update({ processing_error: message }).eq("stripe_event_id", event.id);
    await logEvent("failed_stripe", { reason: "connect_webhook_processing_failed", eventId: event.id, accountId, message });
    return NextResponse.json({ error: "Stripe Connect event processing failed." }, { status: 500 });
  }
}
