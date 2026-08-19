import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractToken(input: unknown) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "tickets" && parts[1]) return parts[1].slice(0, 200);
  } catch {
    // Scanner may return the raw ticket token instead of the full URL.
  }
  return raw.replace(/^.*\/tickets\//, "").split(/[?#]/)[0].slice(0, 200);
}

async function canManageEvent(userId: string, email: string | null | undefined, event: { organization_id: string | null; location_id: string | null }) {
  if (event.organization_id) {
    const { data } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", event.organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }

  const access = await getLocationOwnerAccess(userId, email);
  if (access.isAdmin) return true;
  if (event.location_id) {
    return hasOwnerAccessToLocation(access, { id: event.location_id });
  }
  return false;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, result: "invalid", message: "Invalid event" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ ok: false, result: "unauthorized", message: "Sign in required" }, { status: 401 });

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,title,organization_id,location_id,source_kind")
    .eq("id", id)
    .maybeSingle();
  if (eventError || !event || event.source_kind !== "native") {
    return NextResponse.json({ ok: false, result: "invalid", message: "Event not found" }, { status: 404 });
  }

  if (!(await canManageEvent(user.id, user.email, event))) {
    return NextResponse.json({ ok: false, result: "forbidden", message: "You cannot scan tickets for this event" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const token = extractToken(body?.token ?? body?.value);
  if (!token) return NextResponse.json({ ok: false, result: "invalid", message: "No ticket code found" }, { status: 400 });

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("event_tickets")
    .select("id,event_id,attendee_name,attendee_email,status,checked_in_at")
    .eq("public_token", token)
    .maybeSingle();
  if (ticketError) return NextResponse.json({ ok: false, result: "invalid", message: "Ticket could not be checked" }, { status: 500 });
  if (!ticket) return NextResponse.json({ ok: false, result: "invalid", message: "Ticket not recognized" }, { status: 404 });

  if (ticket.event_id !== id) {
    await supabaseAdmin.from("event_ticket_checkins").insert({ ticket_id: ticket.id, event_id: id, scanned_by: user.id, result: "wrong_event" });
    return NextResponse.json({ ok: false, result: "wrong_event", message: "This ticket belongs to another event", attendeeName: ticket.attendee_name }, { status: 409 });
  }

  if (ticket.status === "void") {
    await supabaseAdmin.from("event_ticket_checkins").insert({ ticket_id: ticket.id, event_id: id, scanned_by: user.id, result: "void" });
    return NextResponse.json({ ok: false, result: "void", message: "This ticket is void", attendeeName: ticket.attendee_name }, { status: 409 });
  }

  if (ticket.status === "checked_in") {
    await supabaseAdmin.from("event_ticket_checkins").insert({ ticket_id: ticket.id, event_id: id, scanned_by: user.id, result: "already_checked_in" });
    return NextResponse.json({ ok: false, result: "already_checked_in", message: `Already checked in${ticket.checked_in_at ? ` at ${new Date(ticket.checked_in_at).toLocaleTimeString()}` : ""}`, attendeeName: ticket.attendee_name, checkedInAt: ticket.checked_in_at }, { status: 409 });
  }

  const checkedInAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("event_tickets")
    .update({ status: "checked_in", checked_in_at: checkedInAt, checked_in_by: user.id, updated_at: checkedInAt })
    .eq("id", ticket.id)
    .eq("status", "valid")
    .select("id")
    .maybeSingle();

  if (updateError) return NextResponse.json({ ok: false, result: "invalid", message: "Check-in could not be saved" }, { status: 500 });
  if (!updated) {
    const { data: latest } = await supabaseAdmin.from("event_tickets").select("status,checked_in_at").eq("id", ticket.id).maybeSingle();
    await supabaseAdmin.from("event_ticket_checkins").insert({ ticket_id: ticket.id, event_id: id, scanned_by: user.id, result: "already_checked_in" });
    return NextResponse.json({ ok: false, result: "already_checked_in", message: "This ticket was just checked in on another device", attendeeName: ticket.attendee_name, checkedInAt: latest?.checked_in_at || null }, { status: 409 });
  }

  await supabaseAdmin.from("event_ticket_checkins").insert({ ticket_id: ticket.id, event_id: id, scanned_by: user.id, result: "checked_in" });
  return NextResponse.json({ ok: true, result: "checked_in", message: "Checked in", attendeeName: ticket.attendee_name, attendeeEmail: ticket.attendee_email, checkedInAt });
}
