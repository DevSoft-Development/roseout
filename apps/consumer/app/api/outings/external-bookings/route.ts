import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  recordExternalBookingDecision,
  registerAvailableExternalBookings,
} from "@/lib/outings/external-booking";

type OutingAccess = {
  id: string;
  user_id: string | null;
  guest_session_id: string | null;
  restaurant_location_id: string | null;
  activity_location_id: string | null;
};

function clean(value: unknown, max = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value));
}

function externalUrl(row: Record<string, unknown>) {
  return clean(row.external_reservation_url, 2_000)
    || clean(row.reservation_url, 2_000)
    || clean(row.reservation_link, 2_000)
    || clean(row.booking_url, 2_000);
}

function isInternalReservation(row: Record<string, unknown>) {
  return Boolean(row.reservation_enabled || row.internal_reservations_enabled || row.uses_internal_reservations);
}

async function authorizedOuting(req: NextRequest, outingId: string) {
  const sessionSupabase = await createClient();
  const { data: authData } = await sessionSupabase.auth.getUser();
  const userId = authData?.user?.id || null;
  const guestSessionId = req.cookies.get("theouthaven_guest_session")?.value || null;

  const { data, error } = await supabaseAdmin
    .from("outings")
    .select("id,user_id,guest_session_id,restaurant_location_id,activity_location_id")
    .eq("id", outingId)
    .maybeSingle();

  if (error || !data) return null;
  const outing = data as OutingAccess;
  if (userId && outing.user_id === userId) return outing;
  if (!userId && guestSessionId && outing.guest_session_id === guestSessionId) return outing;
  return null;
}

async function bookingState(outingId: string) {
  const { data, error } = await supabaseAdmin
    .from("outing_external_bookings")
    .select("location_id,location_type,provider,status,started_at,confirmed_at,failed_at")
    .eq("outing_id", outingId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const required = rows.length;
  const confirmed = rows.filter((row) => row.status === "confirmed").length;
  return {
    required,
    confirmed,
    complete: required > 0 && required === confirmed,
    bookings: rows,
  };
}

export async function GET(req: NextRequest) {
  const outingId = clean(req.nextUrl.searchParams.get("outingId"), 80);
  if (!isUuid(outingId)) return NextResponse.json({ ok: false, error: "invalid_outing_id" }, { status: 400 });

  const outing = await authorizedOuting(req, outingId);
  if (!outing) return NextResponse.json({ ok: false, error: "outing_not_found" }, { status: 404 });

  try {
    return NextResponse.json({ ok: true, summary: await bookingState(outingId) });
  } catch (error) {
    console.error("OUTING_EXTERNAL_BOOKING_STATUS_FAILED", error);
    return NextResponse.json({ ok: false, error: "booking_status_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = clean(body?.action, 40);
    const outingId = clean(body?.outingId, 80);
    if (!isUuid(outingId)) return NextResponse.json({ ok: false, error: "invalid_outing_id" }, { status: 400 });

    const outing = await authorizedOuting(req, outingId);
    if (!outing) return NextResponse.json({ ok: false, error: "outing_not_found" }, { status: 404 });

    if (action === "register") {
      const stopIds = [outing.restaurant_location_id, outing.activity_location_id].filter(isUuid);
      if (!stopIds.length) return NextResponse.json({ ok: true, summary: { required: 0, confirmed: 0, complete: false, bookings: [] } });

      const { data: locations, error } = await supabaseAdmin
        .from("locations")
        .select("id,location_type,external_reservation_url,reservation_url,reservation_link,booking_url,reservation_enabled,internal_reservations_enabled,uses_internal_reservations")
        .in("id", stopIds);
      if (error) throw error;

      const externalStops = (locations || []).flatMap((location) => {
        const row = location as Record<string, unknown>;
        const url = externalUrl(row);
        if (!url || isInternalReservation(row)) return [];
        return [{
          id: String(row.id),
          type: clean(row.location_type, 40) || "location",
          externalUrl: url,
        }];
      });

      await registerAvailableExternalBookings({ outingId, locations: externalStops });
      return NextResponse.json({ ok: true, summary: await bookingState(outingId) });
    }

    if (action === "decision") {
      const locationId = clean(body?.locationId, 80);
      const decision = clean(body?.decision, 20);
      const validStopIds = new Set([outing.restaurant_location_id, outing.activity_location_id].filter(isUuid));
      if (!isUuid(locationId) || !validStopIds.has(locationId)) {
        return NextResponse.json({ ok: false, error: "invalid_location_id" }, { status: 400 });
      }
      if (decision !== "confirmed" && decision !== "failed") {
        return NextResponse.json({ ok: false, error: "invalid_decision" }, { status: 400 });
      }

      const result = await recordExternalBookingDecision({
        outingId,
        locationId,
        decision,
        source: "plan_return_prompt",
      });
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
      return NextResponse.json({ ok: true, summary: await bookingState(outingId) });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (error) {
    console.error("OUTING_EXTERNAL_BOOKING_API_FAILED", error);
    return NextResponse.json({ ok: false, error: "booking_update_failed" }, { status: 500 });
  }
}
