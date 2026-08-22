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
  let stripeRefundCreated = false;
  let createdRefundId: string | null = null;
  let refundApplicationFee = false;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "requested_by_customer").trim().slice(0, 120);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("event_ticket_orders")
      .select("id,event_id,status,payment_status,provider_account_id,provider_payment_intent_id,provider_refund_id,platform_fee_cents,refunded_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "Ticket order not found." }, { status: 404 });
    if (order.refunded_at || order.payment_status === "refunded" || order.status === "refunded") {
      return NextResponse.json({ success: true, already_refunded: true, refund_id: order.provider_refund_id || null });
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
    const chargeId = typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id || null;
    if (!chargeId) return NextResponse.json({ error: "Stripe charge could not be resolved for this order." }, { status: 409 });

    const requestedAt = new Date().toISOString();
    refundApplicationFee = Number(order.platform_fee_cents || 0) > 0;
    const { error: pendingError } = await supabaseAdmin
      .from("event_ticket_orders")
      .update({
        payment_status: "refund_pending",
        refund_reason: reason,
        refund_requested_by: user.id,
        refund_requested_at: requestedAt,
        updated_at: requestedAt,
      })
      .eq("id", orderId)
      .eq("payment_status", "paid");
    if (pendingError) throw pendingError;

    const refundParams = new URLSearchParams({
      charge: chargeId,
      reason: "requested_by_customer",
      "metadata[type]": "event_ticket_order",
      "metadata[order_id]": orderId,
      "metadata[event_id]": String(order.event_id),
      "metadata[requested_reason]": reason,
    });
    if (refundApplicationFee) refundParams.set("refund_application_fee", "true");

    const refund = await stripeRequest<{ id: string; status?: string }>("/refunds", {
      stripeAccount: connectedAccountId,
      body: refundParams,
      idempotencyKey: `event-ticket-refund-${orderId}`,
    });
    stripeRefundCreated = true;
    createdRefundId = refund.id;

    const { error: auditError } = await supabaseAdmin
      .from("event_ticket_orders")
      .update({
        provider_refund_id: refund.id,
        refund_application_fee_refunded: refundApplicationFee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (auditError) throw auditError;

    await logEvent("admin_activity", {
      action: "event_ticket_refund",
      orderId,
      eventId: order.event_id,
      requestedBy: user.id,
      refundId: refund.id,
      stripeAccount: connectedAccountId,
      applicationFeeRefunded: refundApplicationFee,
      reason,
    });

    return NextResponse.json({
      success: true,
      refund_id: refund.id,
      status: refund.status || "pending",
      application_fee_refunded: refundApplicationFee,
    });
  } catch (error) {
    if (!stripeRefundCreated) {
      await supabaseAdmin
        .from("event_ticket_orders")
        .update({ payment_status: "paid", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("payment_status", "refund_pending")
        .is("provider_refund_id", null);
    } else {
      // Stripe already accepted the refund. Persist audit identity even if the webhook
      // won the race and has already advanced payment_status to refunded.
      await supabaseAdmin
        .from("event_ticket_orders")
        .update({
          provider_refund_id: createdRefundId,
          refund_application_fee_refunded: refundApplicationFee,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
    }

    await logEvent("failed_stripe", {
      reason: stripeRefundCreated ? "event_ticket_refund_audit_failed_after_stripe_success" : "event_ticket_refund_failed",
      orderId,
      refundId: createdRefundId,
      stripeRefundCreated,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: stripeRefundCreated
          ? "Stripe accepted the refund, but local reconciliation is still pending. Do not retry the refund."
          : error instanceof Error ? error.message : "Unable to refund ticket order.",
        refund_pending: stripeRefundCreated,
        refund_id: createdRefundId,
      },
      { status: stripeRefundCreated ? 202 : 500 },
    );
  }
}
