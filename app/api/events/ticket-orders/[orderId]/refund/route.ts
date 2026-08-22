import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { logEvent } from "@/lib/monitoring";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripeRequest } from "@/lib/stripe/server";

async function canManageOrganization(userId: string, organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && ["owner", "admin"].includes(String(data.role || "").toLowerCase()));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "requested_by_customer").trim().slice(0, 120);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("event_ticket_orders")
      .select("id,event_id,status,payment_status,provider_account_id,provider_payment_intent_id,platform_fee_cents,total_cents,refunded_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "Ticket order not found." }, { status: 404 });
    if (order.refunded_at || order.payment_status === "refunded" || order.status === "refunded") {
      return NextResponse.json({ success: true, already_refunded: true });
    }
    if (order.payment_status !== "paid" || !order.provider_payment_intent_id || !order.provider_account_id) {
      return NextResponse.json({ error: "Only completed Stripe ticket payments can be refunded." }, { status: 409 });
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id,location_id,organization_id,title")
      .eq("id", order.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

    let authorized = false;
    if (event.location_id) {
      authorized = Boolean(await requireOwnerOrAdminAccessToLocation(user.id, String(event.location_id)));
    }
    if (!authorized && event.organization_id) {
      authorized = await canManageOrganization(user.id, String(event.organization_id));
    }
    if (!authorized) return NextResponse.json({ error: "You do not have permission to refund this order." }, { status: 403 });

    const connectedAccountId = String(order.provider_account_id);
    const paymentIntentId = String(order.provider_payment_intent_id);
    const paymentIntent = await stripeRequest<{ latest_charge?: string | { id?: string } | null }>(
      `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { method: "GET", stripeAccount: connectedAccountId },
    );
    const chargeId = typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id || null;

    let applicationFeeId: string | null = null;
    if (chargeId) {
      const charge = await stripeRequest<{ application_fee?: string | { id?: string } | null }>(
        `/charges/${encodeURIComponent(chargeId)}`,
        { method: "GET", stripeAccount: connectedAccountId },
      );
      applicationFeeId = typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee?.id || null;
    }

    await supabaseAdmin
      .from("event_ticket_orders")
      .update({ payment_status: "refund_pending", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("payment_status", "paid");

    const refund = await stripeRequest<{ id: string; status?: string }>("/refunds", {
      stripeAccount: connectedAccountId,
      body: new URLSearchParams({
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        "metadata[type]": "event_ticket_order",
        "metadata[order_id]": orderId,
        "metadata[event_id]": String(order.event_id),
        "metadata[requested_reason]": reason,
      }),
      idempotencyKey: `event-ticket-refund-${orderId}`,
    });

    let applicationFeeRefunded = false;
    if (applicationFeeId && Number(order.platform_fee_cents || 0) > 0) {
      try {
        await stripeRequest(`/application_fees/${encodeURIComponent(applicationFeeId)}/refunds`, {
          body: new URLSearchParams({ "metadata[order_id]": orderId, "metadata[type]": "event_ticket_order" }),
          idempotencyKey: `event-ticket-application-fee-refund-${orderId}`,
        });
        applicationFeeRefunded = true;
      } catch (feeError) {
        console.error("Event ticket application fee refund failed", {
          orderId,
          applicationFeeId,
          message: feeError instanceof Error ? feeError.message : String(feeError),
        });
      }
    }

    await logEvent("event_ticket_refund", {
      orderId,
      eventId: order.event_id,
      requestedBy: user.id,
      refundId: refund.id,
      stripeAccount: connectedAccountId,
      applicationFeeId,
      applicationFeeRefunded,
      reason,
    });

    return NextResponse.json({ success: true, refund_id: refund.id, status: refund.status || "pending", application_fee_refunded: applicationFeeRefunded });
  } catch (error) {
    await supabaseAdmin.from("event_ticket_orders").update({ payment_status: "paid", updated_at: new Date().toISOString() }).eq("id", orderId).eq("payment_status", "refund_pending");
    await logEvent("failed_stripe", { reason: "event_ticket_refund_failed", orderId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refund ticket order." }, { status: 500 });
  }
}
