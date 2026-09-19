import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";
import { getReserveStaffSession } from "@/lib/reserve/staffSession";
import {
  reserveApiConfigured,
  seatReserveWaitlistViaAws,
} from "@/lib/aws/reserve-api";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedType(value: unknown) {
  return clean(value).toLowerCase().replaceAll(" ", "_");
}

function isBarType(value: unknown) {
  return ["bar", "bar_seat", "counter", "counter_seat"].includes(normalizedType(value));
}

async function authoritativeResource(locationId: string, input: Record<string, any>) {
  const rawId = clean(input.resourceId || input.resource_id || input.id);
  if (rawId && isUuid(rawId)) {
    const layout = await supabaseAdmin
      .from("layout_items")
      .select("id,item_name,item_type,capacity,is_active")
      .eq("id", rawId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (!layout.error && layout.data && layout.data.is_active !== false) {
      return {
        id: layout.data.id,
        label: clean(layout.data.item_name),
        type: clean(layout.data.item_type) || "table",
        capacity: Number(layout.data.capacity || 0) || null,
        bar: isBarType(layout.data.item_type),
      };
    }

    const bookable = await supabaseAdmin
      .from("location_bookable_items")
      .select("*")
      .eq("id", rawId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (!bookable.error && bookable.data && bookable.data.is_active !== false) {
      return {
        id: bookable.data.id,
        label: clean(bookable.data.item_name || bookable.data.name || bookable.data.label),
        type: clean(bookable.data.item_type || bookable.data.type) || "table",
        capacity: Number(bookable.data.capacity_max ?? bookable.data.capacity ?? 0) || null,
        bar: isBarType(bookable.data.item_type || bookable.data.type),
      };
    }
  }

  const requestedLabel = clean(input.resourceLabel || input.resource_label || input.resource_name || input.item_name);
  const seatMatch = requestedLabel.match(/^(.*)\s+Seat\s+(\d+)$/i);
  if (seatMatch) {
    const parentName = seatMatch[1].trim();
    const seatNumber = Number(seatMatch[2]);
    const parent = await supabaseAdmin
      .from("layout_items")
      .select("id,item_name,item_type,capacity,is_active")
      .eq("location_id", locationId)
      .ilike("item_name", parentName)
      .maybeSingle();
    if (
      !parent.error &&
      parent.data &&
      parent.data.is_active !== false &&
      isBarType(parent.data.item_type) &&
      seatNumber >= 1 &&
      seatNumber <= Number(parent.data.capacity || 0)
    ) {
      return {
        id: null,
        label: `${parent.data.item_name} Seat ${seatNumber}`,
        type: normalizedType(parent.data.item_type).startsWith("counter") ? "counter_seat" : "bar_seat",
        capacity: null,
        bar: true,
      };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const locationId = clean(body.locationId || body.location_id);
  const waitlistId = clean(body.waitlistId || body.waitlist_id);
  if (!locationId || !waitlistId) {
    return NextResponse.json({ success: false, error: "Choose a waitlist guest and table." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "manageReservations");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const staffSession = await getReserveStaffSession(canonicalLocationId);
  const actorStaffProfileId = staffSession?.staff_profile_id || null;

  const resource = await authoritativeResource(canonicalLocationId, body);
  if (!resource?.label) {
    return NextResponse.json({ success: false, error: "That table or bar seat is no longer available." }, { status: 404 });
  }

  if (reserveApiConfigured()) {
    try {
      const result = await seatReserveWaitlistViaAws({
        waitlistId,
        locationId: canonicalLocationId,
        resourceId: resource.id,
        resourceLabel: resource.label,
        resourceType: resource.type,
        resourceCapacity: resource.bar ? null : resource.capacity,
        staffProfileId: actorStaffProfileId,
      });
      return NextResponse.json({
        success: true,
        lane: "reserve-v1",
        service: "aws-reserve-api",
        reservation: result.reservation,
        waitlistId,
      }, {
        headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to seat this waitlist guest.";
      if (/no longer active|already been converted|assigned|conflict|available|fit/i.test(message)) {
        return NextResponse.json({ success: false, code: "seat_conflict", error: message }, { status: 409 });
      }
      console.error("Reserve API waitlist seating failed; using database fallback", { error: message });
    }
  }

  const result = await supabaseAdmin.rpc("reserve_seat_waitlist_atomic", {
    p_waitlist_id: waitlistId,
    p_location_id: canonicalLocationId,
    p_resource_id: resource.id,
    p_resource_label: resource.label,
    p_resource_type: resource.type,
    p_resource_capacity: resource.bar ? null : resource.capacity,
    p_staff_profile_id: actorStaffProfileId,
  });

  if (result.error) {
    const message = String(result.error.message || "Unable to seat this waitlist guest.");
    const conflict = /no longer active|already been converted|assigned|conflict|available|fit/i.test(message);
    return NextResponse.json(
      { success: false, code: conflict ? "seat_conflict" : "seat_failed", error: message },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    lane: "reserve-v1",
    service: "supabase-direct",
    reservation: result.data,
    waitlistId,
  }, {
    headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" },
  });
}