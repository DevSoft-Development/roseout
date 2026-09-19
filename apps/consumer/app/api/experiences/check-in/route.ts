import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canManage(userId: string, organizationId: string | null, locationId: string | null) {
  if (organizationId) {
    const { data } = await supabaseAdmin.from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (data) return true;
  }
  if (locationId) {
    const [{ data: owner }, { data: team }] = await Promise.all([
      supabaseAdmin.from("location_owner_locations").select("id").eq("location_id", locationId).eq("user_id", userId).eq("status", "active").maybeSingle(),
      supabaseAdmin.from("location_team_members").select("id").eq("location_id", locationId).eq("user_id", userId).eq("invitation_status", "accepted").maybeSingle(),
    ]);
    if (owner || team) return true;
  }
  const { data: admin } = await supabaseAdmin.from("admin_users").select("id").eq("user_id", userId).maybeSingle();
  return Boolean(admin);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const credential = String(body.credential || "").trim();
  const guestCount = Math.max(1, Number(body.guestCount || 1));
  const method = credential.length === 6 ? "code" : "qr";
  if (!credential) return NextResponse.json({ error: "QR token or check-in code required." }, { status: 400 });

  const base = supabaseAdmin.from("experience_bookings").select("id,experience_id,party_size,checked_in_count,status,customer_name,checkin_code,public_token");
  const { data: booking } = method === "code"
    ? await base.eq("checkin_code", credential.toUpperCase()).maybeSingle()
    : await base.eq("public_token", credential).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found.", result: "invalid" }, { status: 404 });

  const { data: experience } = await supabaseAdmin.from("experiences").select("id,title,organization_id,location_id").eq("id", booking.experience_id).maybeSingle();
  if (!experience || !(await canManage(auth.user.id, experience.organization_id, experience.location_id))) {
    return NextResponse.json({ error: "You cannot check guests into this experience." }, { status: 403 });
  }

  if (booking.status === "cancelled") {
    await supabaseAdmin.from("experience_checkins").insert({ booking_id: booking.id, experience_id: booking.experience_id, method, guest_count: 1, result: "cancelled", scanned_by: auth.user.id });
    return NextResponse.json({ ok: false, result: "cancelled", customerName: booking.customer_name }, { status: 409 });
  }

  const remaining = Math.max(0, booking.party_size - booking.checked_in_count);
  if (remaining === 0) {
    await supabaseAdmin.from("experience_checkins").insert({ booking_id: booking.id, experience_id: booking.experience_id, method, guest_count: 1, result: "already_checked_in", scanned_by: auth.user.id });
    return NextResponse.json({ ok: false, result: "already_checked_in", customerName: booking.customer_name, checkedInCount: booking.checked_in_count, partySize: booking.party_size }, { status: 409 });
  }

  const accepted = Math.min(remaining, Number.isFinite(guestCount) ? guestCount : 1);
  const newCount = booking.checked_in_count + accepted;
  const fully = newCount >= booking.party_size;
  const { error } = await supabaseAdmin.from("experience_bookings").update({ checked_in_count: newCount, checked_in_at: fully ? new Date().toISOString() : null, status: fully ? "completed" : "confirmed", updated_at: new Date().toISOString() }).eq("id", booking.id).eq("checked_in_count", booking.checked_in_count);
  if (error) throw error;
  await supabaseAdmin.from("experience_checkins").insert({ booking_id: booking.id, experience_id: booking.experience_id, method, guest_count: accepted, result: fully ? "fully_checked_in" : "checked_in", scanned_by: auth.user.id });

  return NextResponse.json({ ok: true, result: fully ? "fully_checked_in" : "checked_in", experienceTitle: experience.title, customerName: booking.customer_name, acceptedGuests: accepted, checkedInCount: newCount, partySize: booking.party_size, remainingGuests: booking.party_size - newCount });
}
