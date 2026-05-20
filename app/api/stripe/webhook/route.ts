import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logEvent } from "@/lib/monitoring";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("stripe-signature") || "";
  if (!secret) {
    await logEvent("failed_stripe", { reason: "missing_signature" });
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 401 });
  }

  const event = await request.json().catch(() => null);

  if (!event?.type) {
    await logEvent("failed_stripe", { reason: "invalid_payload" });
    return NextResponse.json({ error: "Invalid Stripe payload." }, { status: 400 });
  }

  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const locationId = String(metadata.location_id || "").trim();

  try {
    await supabaseAdmin.from("payment_logs").insert({
      provider: "stripe",
      event_type: event.type,
      stripe_event_id: event.id || null,
      payload: event,
      location_id: locationId || null,
    });
  } catch {
    // payment_logs table may not exist in older environments.
  }

  const updateLocation = async (update: Record<string, unknown>) => {
    if (!locationId) return;
    await supabaseAdmin.from("locations").update(update).eq("id", locationId);
  };

  switch (event.type) {
    case "checkout.session.completed":
      await updateLocation({
        subscription_plan: "pro",
        subscription_status: "active",
        stripe_customer_id: object.customer || null,
        stripe_subscription_id: object.subscription || null,
      });
      break;
    case "invoice.payment_succeeded":
      await updateLocation({ subscription_status: "active" });
      break;
    case "invoice.payment_failed":
      await logEvent("failed_stripe", { type: event.type, eventId: event.id || null, locationId });
      await updateLocation({ subscription_status: "past_due" });
      break;
    case "customer.subscription.updated":
      await updateLocation({
        subscription_status: object.status || "active",
        current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
      });
      break;
    case "customer.subscription.deleted":
      await updateLocation({
        subscription_plan: "free",
        subscription_status: "canceled",
      });
      break;
    case "payment_intent.succeeded": {
      if (metadata.type === "reservation_deposit" && metadata.reservation_id) {
        await supabaseAdmin.from("location_reservations").update({
          deposit_status: "paid",
          status: "confirmed",
          stripe_payment_intent_id: object.id,
        }).eq("id", metadata.reservation_id);
      }
      break;
    }
    case "charge.refunded": {
      if (metadata.type === "reservation_deposit" && metadata.reservation_id) {
        await supabaseAdmin.from("location_reservations").update({
          deposit_status: "refunded",
          status: "canceled",
        }).eq("id", metadata.reservation_id);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

