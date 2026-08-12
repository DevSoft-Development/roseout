import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
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
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((value) => {
    try {
      const received = Buffer.from(value, "hex");
      return (
        received.length === expectedBuffer.length &&
        crypto.timingSafeEqual(received, expectedBuffer)
      );
    } catch {
      return false;
    }
  });
}

async function claimConnectEvent(event: any, account: any, locationId: string | null) {
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
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_invoice_id: null,
    location_id: locationId,
    amount_paid_cents: null,
    amount_due_cents: null,
    currency: null,
    status: account.details_submitted ? "submitted" : "pending",
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
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 401 });
  }

  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Connect webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: any;
  try {
    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      throw new Error("Signature verification failed.");
    }
    event = JSON.parse(rawBody);
  } catch {
    await logEvent("failed_stripe", {
      reason: "invalid_connect_signature",
    });
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 401 });
  }

  if (event.type !== "account.updated") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const account = event.data?.object || {};
  const accountId = typeof account.id === "string" ? account.id : "";
  if (!event.id || !accountId) {
    return NextResponse.json({ error: "Invalid Connect account event." }, { status: 400 });
  }

  try {
    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("stripe_connect_account_id", accountId)
      .maybeSingle();
    if (locationError) throw locationError;

    const locationId = location?.id ? String(location.id) : null;
    const claimed = await claimConnectEvent(event, account, locationId);
    if (claimed.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (locationId) {
      const onboardingStatus =
        account.details_submitted && account.charges_enabled && account.payouts_enabled
          ? "complete"
          : account.details_submitted
            ? "restricted"
            : "pending";
      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update({
          stripe_connect_onboarding_status: onboardingStatus,
          stripe_connect_details_submitted: Boolean(account.details_submitted),
          stripe_connect_charges_enabled: Boolean(account.charges_enabled),
          stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
          stripe_connect_updated_at: new Date().toISOString(),
        })
        .eq("id", locationId);
      if (updateError) throw updateError;
    }

    const { error: completeError } = await supabaseAdmin
      .from("payment_logs")
      .update({
        processed_at: new Date().toISOString(),
        location_id: locationId,
        processing_error: null,
      })
      .eq("stripe_event_id", event.id);
    if (completeError) throw completeError;

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("payment_logs")
      .update({ processing_error: message })
      .eq("stripe_event_id", event.id);
    await logEvent("failed_stripe", {
      reason: "connect_webhook_processing_failed",
      eventId: event.id,
      accountId,
      message,
    });
    return NextResponse.json({ error: "Stripe Connect event processing failed." }, { status: 500 });
  }
}
