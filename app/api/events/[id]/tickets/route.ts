import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverEventHostNotification, deliverEventTicket } from "@/lib/events/ticket-delivery";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { calculateEventFees, customerFeeShareForPayer, type EventFeePayer } from "@/lib/payments/event-fees";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function status(attempted: boolean, sent: boolean) {
  if (!attempted) return "skipped";
  return sent ? "sent" : "failed";
}

async function resolveHost(event: { location_id: string | null; organization_id: string | null }) {
  if (event.location_id) {
    const { data: location } = await supabaseAdmin.from("locations").select("name,owner_email,owner_phone").eq("id", event.location_id).maybeSingle();
    return {
      name: location?.name || "Location team",
      emails: location?.owner_email ? [location.owner_email] : [],
      phone: location?.owner_phone || null,
      managePath: "/locations/dashboard",
    };
  }
  if (event.organization_id) {
    const [{ data: organization }, { data: profile }, { data: members }] = await Promise.all([
      supabaseAdmin.from("organizations").select("name").eq("id", event.organization_id).maybeSingle(),
      supabaseAdmin.from("organizer_profiles").select("display_name,phone").eq("organization_id", event.organization_id).maybeSingle(),
      supabaseAdmin.from("organization_members").select("email,status").eq("organization_id", event.organization_id).limit(20),
    ]);
    const blocked = new Set(["invited", "pending", "removed", "disabled", "suspended"]);
    return {
      name: profile?.display_name || organization?.name || "Organizer team",
      emails: (members || []).filter((member) => member.email && !blocked.has(String(member.status || "").toLowerCase())).map((member) => String(member.email)),
      phone: profile?.phone || null,
      managePath: `/organizers/dashboard?organizationId=${encodeURIComponent(event.organization_id)}&tab=tickets`,
    };
  }
  return null;
}

async function resolveConnectedAccount(event: { location_id: string | null; organization_id: string | null }) {
  if (event.organization_id) {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
      .eq("id", event.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.stripe_connect_account_id && data.stripe_connect_charges_enabled && data.stripe_connect_payouts_enabled) {
      return String(data.stripe_connect_account_id);
    }
  }

  if (event.location_id) {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
      .eq("id", event.location_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.stripe_connect_account_id && data.stripe_connect_charges_enabled && data.stripe_connect_payouts_enabled) {
      return String(data.stripe_connect_account_id);
    }
  }

  return null;
}

async function transactionIsHeld(event: { id: string; location_id: string | null; organization_id: string | null }) {
  const checks = [getFraudDecision("event", event.id)];
  if (event.location_id) checks.push(getFraudDecision("location", event.location_id));
  if (event.organization_id) checks.push(getFraudDecision("organizer", event.organization_id));
  return (await Promise.all(checks)).some(fraudDecisionPreventsSensitiveAction);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = clean(body?.name, 120);
  const email = clean(body?.email, 254).toLowerCase();
  const phone = clean(body?.phone, 40) || null;
  if (name.length < 2) return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,title,source_kind,status,searchable,is_free,ticketing_enabled,capacity,starts_at,ends_at,timezone,location_id,organization_id,price_min,currency,platform_fee_bps,fee_payer,customer_fee_share_bps")
    .eq("id", id)
    .maybeSingle();
  if (eventError) return NextResponse.json({ error: "Unable to load event" }, { status: 500 });
  if (!event || event.source_kind !== "native" || !event.searchable || event.status !== "scheduled") return NextResponse.json({ error: "Tickets are not available for this event" }, { status: 404 });
  if (!event.ticketing_enabled) return NextResponse.json({ error: "Registration is not open for this event" }, { status: 409 });

  if (await transactionIsHeld(event)) {
    return NextResponse.json({ error: "Tickets are temporarily unavailable for this event." }, { status: 409 });
  }

  const terminalAt = new Date(event.ends_at || event.starts_at).getTime();
  if (!Number.isFinite(terminalAt) || terminalAt < Date.now()) return NextResponse.json({ error: "This event has ended" }, { status: 409 });

  if (event.capacity) {
    const [{ count, error: countError }, { count: pendingCount, error: pendingError }] = await Promise.all([
      supabaseAdmin.from("event_tickets").select("id", { count: "exact", head: true }).eq("event_id", id).neq("status", "void"),
      supabaseAdmin.from("event_ticket_orders").select("id", { count: "exact", head: true }).eq("event_id", id).eq("status", "pending_payment").gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ]);
    if (countError || pendingError) return NextResponse.json({ error: "Unable to check event capacity" }, { status: 500 });
    if ((count || 0) + (pendingCount || 0) >= event.capacity) return NextResponse.json({ error: "This event is sold out" }, { status: 409 });
  }

  if (!event.is_free) {
    const price = Number(event.price_min || 0);
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "This event does not have a valid ticket price" }, { status: 409 });

    const connectedAccountId = await resolveConnectedAccount(event);
    if (!connectedAccountId) {
      return NextResponse.json({ error: "This organizer must finish TheOutHaven Payments setup before paid tickets can be sold." }, { status: 409 });
    }

    const payoutDecision = await getFraudDecision("payout", `connect-account:${connectedAccountId}`);
    if (fraudDecisionPreventsSensitiveAction(payoutDecision)) {
      return NextResponse.json({ error: "Paid tickets are temporarily unavailable for this event." }, { status: 409 });
    }

    const feePayer = (event.fee_payer || "customer") as EventFeePayer;
    const subtotalCents = Math.round(price * 100);
    const fees = calculateEventFees(subtotalCents, feePayer, Number(event.platform_fee_bps || 500));
    const customerShareBps = Math.round(customerFeeShareForPayer(feePayer) * 10000);
    const currency = String(event.currency || "USD").toLowerCase();

    const { data: order, error: orderError } = await supabaseAdmin
      .from("event_ticket_orders")
      .insert({
        event_id: id,
        purchaser_name: name,
        purchaser_email: email,
        purchaser_phone: phone,
        quantity: 1,
        status: "pending_payment",
        source: "stripe_checkout",
        email_delivery_status: "pending",
        sms_delivery_status: phone ? "pending" : "skipped",
        payment_provider: "stripe",
        provider_account_id: connectedAccountId,
        payment_status: "pending",
        currency,
        ticket_subtotal_cents: fees.ticketSubtotalCents,
        customer_service_fee_cents: fees.customerServiceFeeCents,
        platform_fee_cents: fees.platformFeeCents,
        stripe_processing_estimate_cents: fees.stripeProcessingEstimateCents,
        organizer_net_estimate_cents: fees.organizerNetEstimateCents,
        total_cents: fees.customerTotalCents,
        platform_fee_bps: fees.platformFeeBps,
        fee_payer: feePayer,
        customer_fee_share_bps: customerShareBps,
      })
      .select("id")
      .single();
    if (orderError || !order) return NextResponse.json({ error: "Unable to create checkout" }, { status: 500 });

    try {
      const siteUrl = getSiteUrl();
      const params = new URLSearchParams({
        mode: "payment",
        success_url: `${siteUrl}/events/${id}?payment=success&order=${encodeURIComponent(order.id)}`,
        cancel_url: `${siteUrl}/events/${id}?payment=cancelled`,
        customer_email: email,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][unit_amount]": String(fees.ticketSubtotalCents),
        "line_items[0][price_data][product_data][name]": event.title,
        "payment_intent_data[application_fee_amount]": String(fees.platformFeeCents),
        "payment_intent_data[metadata][type]": "event_ticket_order",
        "payment_intent_data[metadata][order_id]": order.id,
        "payment_intent_data[metadata][event_id]": id,
        "metadata[type]": "event_ticket_order",
        "metadata[order_id]": order.id,
        "metadata[event_id]": id,
        "metadata[organization_id]": event.organization_id || "",
        "metadata[location_id]": event.location_id || "",
        expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
      });
      if (fees.customerServiceFeeCents > 0) {
        params.set("line_items[1][quantity]", "1");
        params.set("line_items[1][price_data][currency]", currency);
        params.set("line_items[1][price_data][unit_amount]", String(fees.customerServiceFeeCents));
        params.set("line_items[1][price_data][product_data][name]", "TheOutHaven service fee");
      }

      const session = await stripeRequest<{ id: string; url: string | null; payment_intent?: string | null }>("/checkout/sessions", {
        body: params,
        idempotencyKey: `event-checkout-${order.id}`,
        stripeAccount: connectedAccountId,
      });
      if (!session.url) throw new Error("Stripe did not return a checkout URL");

      const { error: updateError } = await supabaseAdmin
        .from("event_ticket_orders")
        .update({ provider_checkout_session_id: session.id, provider_payment_intent_id: session.payment_intent || null, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (updateError) throw updateError;

      return NextResponse.json({ checkoutUrl: session.url, orderId: order.id, fees }, { status: 201 });
    } catch (error) {
      await supabaseAdmin.from("event_ticket_orders").delete().eq("id", order.id).eq("status", "pending_payment");
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start checkout" }, { status: 500 });
    }
  }

  const existing = await supabaseAdmin.from("event_tickets").select("public_token").eq("event_id", id).eq("attendee_email", email).neq("status", "void").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Unable to check registration" }, { status: 500 });
  if (existing.data?.public_token) return NextResponse.json({ ticketUrl: `/tickets/${existing.data.public_token}`, existing: true });

  const { data: order, error: orderError } = await supabaseAdmin.from("event_ticket_orders").insert({ event_id: id, purchaser_name: name, purchaser_email: email, purchaser_phone: phone, quantity: 1, status: "confirmed", email_delivery_status: "pending", sms_delivery_status: phone ? "pending" : "skipped" }).select("id").single();
  if (orderError || !order) return NextResponse.json({ error: "Unable to create registration" }, { status: 500 });

  const publicToken = randomBytes(24).toString("base64url");
  const ticketPath = `/tickets/${publicToken}`;
  const { error: ticketError } = await supabaseAdmin.from("event_tickets").insert({ order_id: order.id, event_id: id, attendee_name: name, attendee_email: email, public_token: publicToken, status: "valid" });
  if (ticketError) {
    await supabaseAdmin.from("event_ticket_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Unable to issue ticket" }, { status: 500 });
  }

  const [delivery, host] = await Promise.all([
    deliverEventTicket({ attendeeName: name, email, phone, eventTitle: event.title, startsAt: event.starts_at, timezone: event.timezone || "America/New_York", ticketPath }),
    resolveHost(event),
  ]);
  const hostDelivery = host
    ? await deliverEventHostNotification({ hostName: host.name, emails: host.emails, phone: host.phone, eventTitle: event.title, startsAt: event.starts_at, timezone: event.timezone || "America/New_York", attendeeName: name, quantity: 1, managePath: host.managePath })
    : { email: { attempted: false, sent: false }, sms: { attempted: false, sent: false } };

  const deliveryErrors = [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null;
  const hostDeliveryErrors = [hostDelivery.email.error, hostDelivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null;
  await supabaseAdmin.from("event_ticket_orders").update({
    email_delivery_status: status(delivery.email.attempted, delivery.email.sent),
    sms_delivery_status: status(delivery.sms.attempted, delivery.sms.sent),
    delivery_error: deliveryErrors,
    host_email_delivery_status: status(hostDelivery.email.attempted, hostDelivery.email.sent),
    host_sms_delivery_status: status(hostDelivery.sms.attempted, hostDelivery.sms.sent),
    host_delivery_error: hostDeliveryErrors,
    host_delivery_attempted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  return NextResponse.json({
    ticketUrl: ticketPath,
    existing: false,
    delivery: {
      customer: { email: status(delivery.email.attempted, delivery.email.sent), sms: status(delivery.sms.attempted, delivery.sms.sent) },
      host: { email: status(hostDelivery.email.attempted, hostDelivery.email.sent), sms: status(hostDelivery.sms.attempted, hostDelivery.sms.sent) },
    },
  }, { status: 201 });
}
