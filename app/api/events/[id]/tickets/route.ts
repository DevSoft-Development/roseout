import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverEventTicket } from "@/lib/events/ticket-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    .select("id,title,source_kind,status,searchable,is_free,ticketing_enabled,capacity,starts_at,ends_at,timezone")
    .eq("id", id)
    .maybeSingle();

  if (eventError) return NextResponse.json({ error: "Unable to load event" }, { status: 500 });
  if (!event || event.source_kind !== "native" || !event.searchable || event.status !== "scheduled") {
    return NextResponse.json({ error: "Tickets are not available for this event" }, { status: 404 });
  }
  if (!event.ticketing_enabled) return NextResponse.json({ error: "Registration is not open for this event" }, { status: 409 });
  if (!event.is_free) {
    return NextResponse.json({ error: "Online paid ticket checkout is not enabled yet for this event" }, { status: 409 });
  }

  const terminalAt = new Date(event.ends_at || event.starts_at).getTime();
  if (!Number.isFinite(terminalAt) || terminalAt < Date.now()) {
    return NextResponse.json({ error: "This event has ended" }, { status: 409 });
  }

  const existing = await supabaseAdmin
    .from("event_tickets")
    .select("public_token")
    .eq("event_id", id)
    .eq("attendee_email", email)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Unable to check registration" }, { status: 500 });
  if (existing.data?.public_token) {
    return NextResponse.json({ ticketUrl: `/tickets/${existing.data.public_token}`, existing: true });
  }

  if (event.capacity) {
    const { count, error: countError } = await supabaseAdmin
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .neq("status", "void");
    if (countError) return NextResponse.json({ error: "Unable to check event capacity" }, { status: 500 });
    if ((count || 0) >= event.capacity) return NextResponse.json({ error: "This event is sold out" }, { status: 409 });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("event_ticket_orders")
    .insert({
      event_id: id,
      purchaser_name: name,
      purchaser_email: email,
      purchaser_phone: phone,
      quantity: 1,
      status: "confirmed",
      email_delivery_status: "pending",
      sms_delivery_status: phone ? "pending" : "skipped",
    })
    .select("id")
    .single();
  if (orderError || !order) return NextResponse.json({ error: "Unable to create registration" }, { status: 500 });

  const publicToken = randomBytes(24).toString("base64url");
  const ticketPath = `/tickets/${publicToken}`;
  const { error: ticketError } = await supabaseAdmin.from("event_tickets").insert({
    order_id: order.id,
    event_id: id,
    attendee_name: name,
    attendee_email: email,
    public_token: publicToken,
    status: "valid",
  });

  if (ticketError) {
    await supabaseAdmin.from("event_ticket_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Unable to issue ticket" }, { status: 500 });
  }

  const delivery = await deliverEventTicket({
    attendeeName: name,
    email,
    phone,
    eventTitle: event.title,
    startsAt: event.starts_at,
    timezone: event.timezone || "America/New_York",
    ticketPath,
  });

  const deliveryErrors = [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null;
  await supabaseAdmin
    .from("event_ticket_orders")
    .update({
      email_delivery_status: delivery.email.sent ? "sent" : "failed",
      sms_delivery_status: !delivery.sms.attempted ? "skipped" : delivery.sms.sent ? "sent" : "failed",
      delivery_error: deliveryErrors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  return NextResponse.json({
    ticketUrl: ticketPath,
    existing: false,
    delivery: {
      email: delivery.email.sent,
      sms: delivery.sms.sent,
    },
  }, { status: 201 });
}
