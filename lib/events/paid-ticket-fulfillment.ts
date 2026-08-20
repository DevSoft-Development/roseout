import "server-only";

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverEventHostNotification, deliverEventTicket } from "@/lib/events/ticket-delivery";

function deliveryStatus(attempted: boolean, sent: boolean) {
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

export async function fulfillPaidEventTicket(orderId: string, providerPaymentIntentId?: string | null) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("event_ticket_orders")
    .select("id,event_id,purchaser_name,purchaser_email,purchaser_phone,status,payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Paid event order not found");

  const { data: existingTicket, error: existingError } = await supabaseAdmin
    .from("event_tickets")
    .select("public_token")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingTicket?.public_token) {
    await supabaseAdmin.from("event_ticket_orders").update({
      status: "confirmed",
      payment_status: "paid",
      provider_payment_intent_id: providerPaymentIntentId || undefined,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    return `/tickets/${existingTicket.public_token}`;
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,title,starts_at,timezone,location_id,organization_id")
    .eq("id", order.event_id)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error("Paid event not found");

  const publicToken = randomBytes(24).toString("base64url");
  const ticketPath = `/tickets/${publicToken}`;
  const { error: ticketError } = await supabaseAdmin.from("event_tickets").insert({
    order_id: order.id,
    event_id: order.event_id,
    attendee_name: order.purchaser_name,
    attendee_email: order.purchaser_email,
    public_token: publicToken,
    status: "valid",
  });
  if (ticketError) throw ticketError;

  const [delivery, host] = await Promise.all([
    deliverEventTicket({
      attendeeName: order.purchaser_name,
      email: order.purchaser_email,
      phone: order.purchaser_phone,
      eventTitle: event.title,
      startsAt: event.starts_at,
      timezone: event.timezone || "America/New_York",
      ticketPath,
    }),
    resolveHost(event),
  ]);
  const hostDelivery = host
    ? await deliverEventHostNotification({
        hostName: host.name,
        emails: host.emails,
        phone: host.phone,
        eventTitle: event.title,
        startsAt: event.starts_at,
        timezone: event.timezone || "America/New_York",
        attendeeName: order.purchaser_name,
        quantity: 1,
        managePath: host.managePath,
      })
    : { email: { attempted: false, sent: false }, sms: { attempted: false, sent: false } };

  await supabaseAdmin.from("event_ticket_orders").update({
    status: "confirmed",
    payment_status: "paid",
    provider_payment_intent_id: providerPaymentIntentId || undefined,
    paid_at: new Date().toISOString(),
    email_delivery_status: deliveryStatus(delivery.email.attempted, delivery.email.sent),
    sms_delivery_status: deliveryStatus(delivery.sms.attempted, delivery.sms.sent),
    delivery_error: [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    host_email_delivery_status: deliveryStatus(hostDelivery.email.attempted, hostDelivery.email.sent),
    host_sms_delivery_status: deliveryStatus(hostDelivery.sms.attempted, hostDelivery.sms.sent),
    host_delivery_error: [hostDelivery.email.error, hostDelivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    host_delivery_attempted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  return ticketPath;
}
