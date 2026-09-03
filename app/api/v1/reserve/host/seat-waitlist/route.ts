import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  const waitlistId = clean(body.waitlistId || body.waitlist_id);
  const resourceId = clean(body.resourceId || body.resource_id);
  const resourceLabel = clean(body.resourceLabel || body.resource_label);
  if (!locationId || !waitlistId || !resourceLabel) {
    return NextResponse.json({ success: false, error: "Choose a waitlist guest and table." }, { status: 400 });
  }
  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);

  const waitlist = await supabaseAdmin
    .from("reservation_waitlist")
    .select("*")
    .eq("id", waitlistId)
    .eq("location_id", canonicalLocationId)
    .in("status", ["waiting", "waitlisted", "notified", "pending"])
    .maybeSingle();
  if (waitlist.error || !waitlist.data) {
    return NextResponse.json({ success: false, error: "This waitlist entry is no longer active." }, { status: 409 });
  }

  let resource: any = null;
  if (resourceId && isUuid(resourceId)) {
    const result = await supabaseAdmin
      .from("layout_items")
      .select("id,item_name,item_type,capacity,is_active")
      .eq("id", resourceId)
      .eq("location_id", canonicalLocationId)
      .maybeSingle();
    if (!result.error && result.data?.is_active !== false) resource = result.data;
  }
  if (!resource) {
    const seatMatch = resourceLabel.match(/^(.*)\s+Seat\s+(\d+)$/i);
    if (seatMatch) {
      const parent = await supabaseAdmin
        .from("layout_items")
        .select("id,item_name,item_type,capacity,is_active")
        .eq("location_id", canonicalLocationId)
        .ilike("item_name", seatMatch[1].trim())
        .maybeSingle();
      const seatNumber = Number(seatMatch[2]);
      if (
        parent.data &&
        parent.data.is_active !== false &&
        ["bar", "bar_seat", "counter", "counter_seat"].includes(String(parent.data.item_type || "").toLowerCase()) &&
        seatNumber >= 1 && seatNumber <= Number(parent.data.capacity || 0)
      ) {
        resource = { id: null, item_name: resourceLabel, item_type: "bar_seat", capacity: null };
      }
    }
  }
  if (!resource) return NextResponse.json({ success: false, error: "That table or bar seat is no longer available." }, { status: 404 });

  const location = await supabaseAdmin
    .from("locations")
    .select("id,location_type")
    .eq("id", canonicalLocationId)
    .maybeSingle();
  const now = new Date();
  const date = clean(waitlist.data.reservation_date) || now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const time = clean(waitlist.data.reservation_time).slice(0, 5) || now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const create = await supabaseAdmin
    .from("location_reservations")
    .insert({
      location_id: canonicalLocationId,
      location_type: location.data?.location_type || "restaurant",
      customer_name: waitlist.data.contact_name || waitlist.data.customer_name || "Walk-in guest",
      customer_phone: waitlist.data.contact_phone || waitlist.data.customer_phone || null,
      customer_email: waitlist.data.contact_email || waitlist.data.customer_email || null,
      party_size: Math.max(1, Number(waitlist.data.party_size || 1)),
      reservation_date: date,
      reservation_time: time,
      status: "checked_in",
      source: "host_waitlist",
      special_request: waitlist.data.notes || null,
      special_requests: waitlist.data.notes || null,
      duration_minutes: 90,
      checked_in_at: now.toISOString(),
      arrived_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("*")
    .single();
  if (create.error || !create.data) {
    return NextResponse.json({ success: false, error: create.error?.message || "Unable to create a reservation from this waitlist guest." }, { status: 500 });
  }

  const assign = await supabaseAdmin.rpc("reserve_assign_resource_atomic", {
    p_reservation_id: create.data.id,
    p_location_id: canonicalLocationId,
    p_resource_id: resource.id,
    p_resource_label: resource.item_name,
    p_resource_type: resource.item_type || "table",
    p_resource_capacity: ["bar", "bar_seat", "counter", "counter_seat"].includes(String(resource.item_type || "").toLowerCase()) ? null : Number(resource.capacity || 0) || null,
    p_seat_after_assign: true,
    p_staff_profile_id: clean(body.staffProfileId || body.staff_profile_id) || null,
    p_override_reason: null,
  });

  if (assign.error) {
    await supabaseAdmin.from("location_reservations").delete().eq("id", create.data.id).eq("location_id", canonicalLocationId);
    return NextResponse.json({ success: false, code: "seat_conflict", error: String(assign.error.message || "That table is no longer available.") }, { status: 409 });
  }

  await supabaseAdmin
    .from("reservation_waitlist")
    .update({ status: "seated", updated_at: new Date().toISOString() })
    .eq("id", waitlistId)
    .eq("location_id", canonicalLocationId);

  await supabaseAdmin.from("reserve_service_events").insert({
    location_id: canonicalLocationId,
    reservation_id: create.data.id,
    staff_profile_id: clean(body.staffProfileId || body.staff_profile_id) || null,
    event_type: "waitlist.converted_and_seated",
    resource_label: resource.item_name,
    metadata: { waitlist_id: waitlistId },
  });

  return NextResponse.json({ success: true, reservation: assign.data, waitlistId }, {
    headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" },
  });
}
