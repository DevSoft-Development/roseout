import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowed = origin && (/^https:\/\/([a-z0-9-]+\.)?theouthaven\.com$/i.test(origin) || /^https:\/\/[a-z0-9.-]+$/i.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://www.theouthaven.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = clean(body.locationId || body.location_id, 80);
    const customerName = clean(body.customerName || body.customer_name, 120);
    const customerEmail = clean(body.customerEmail || body.customer_email, 254).toLowerCase();
    const customerPhone = clean(body.customerPhone || body.customer_phone, 40);
    const reservationDate = clean(body.reservationDate || body.reservation_date, 10);
    const reservationTime = clean(body.reservationTime || body.reservation_time, 5);
    const partySize = Number(body.partySize || body.party_size || 0);
    const occasion = clean(body.occasion, 80) || null;
    const prixFixa = clean(body.prixFixa || body.prixFixeInterest || body.prix_fixe_interest, 20).toLowerCase();
    const prixFixaInterest = ["yes", "no", "unsure"].includes(prixFixa) ? prixFixa : "unsure";
    const notes = clean(body.notes || body.groupBookingNotes || body.group_booking_notes, 1200) || null;

    if (!locationId || !customerName || !EMAIL_RE.test(customerEmail) || !DATE_RE.test(reservationDate) || !TIME_RE.test(reservationTime)) {
      return NextResponse.json({ error: "Complete the required group booking details." }, { status: 400, headers });
    }
    if (!Number.isInteger(partySize) || partySize < 6 || partySize > 500) {
      return NextResponse.json({ error: "Large group requests must be for 6 to 500 guests." }, { status: 400, headers });
    }

    const requestedAt = new Date(`${reservationDate}T${reservationTime}:00-04:00`).getTime();
    if (!Number.isFinite(requestedAt) || requestedAt < Date.now() - 5 * 60 * 1000) {
      return NextResponse.json({ error: "Choose a future date and time." }, { status: 400, headers });
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,location_type,name,restaurant_name,activity_name")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404, headers });

    const customerToken = randomBytes(24).toString("base64url");
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const locationType = String(location.location_type || "restaurant");
    const specialRequest = [occasion ? `Occasion: ${occasion}` : "", `Prix-fixe interest: ${prixFixaInterest}`, notes || ""].filter(Boolean).join("\n");

    const { data: reservation, error } = await supabaseAdmin
      .from("location_reservations")
      .insert({
        location_id: location.id,
        location_type: locationType,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        party_size: partySize,
        status: "pending",
        source: "public_large_group",
        booking_kind: "large_group",
        occasion,
        prix_fixe_interest: prixFixaInterest,
        group_booking_notes: notes,
        special_request: specialRequest,
        special_requests: specialRequest,
        duration_minutes: Math.max(120, Number(body.durationMinutes || body.duration_minutes || 180)),
        customer_token: customerToken,
        customer_token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .select("id,status")
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      reservationId: reservation.id,
      status: reservation.status,
      message: prixFixaInterest === "no"
        ? "Your large group reservation request was sent to the location."
        : "Your group dining request was sent to the location for menu and booking review.",
    }, { status: 201, headers });
  } catch (error) {
    console.error("PUBLIC_LARGE_GROUP_BOOKING_ERROR", error);
    return NextResponse.json({ error: "We could not send your group request. Please try again." }, { status: 500, headers });
  }
}
