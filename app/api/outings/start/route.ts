import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { trackEvent } from "@/lib/analytics/trackEvent";

const CONTACT_METHODS = new Set(["external_reservation", "phone"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const sourceLocationId = asString(payload?.source_location_id);
    const locationId = asString(payload?.location_id);
    const contactMethod = asString(payload?.contact_method);
    const reservationUrl = asString(payload?.external_reservation_url);
    const phoneNumber = asString(payload?.phone_number);
    const selectedLocationId = sourceLocationId ?? locationId;

    if (!selectedLocationId) {
      return NextResponse.json({ ok: false, error: "missing_location_id", message: "A location id is required." }, { status: 400 });
    }
    if (!contactMethod || !CONTACT_METHODS.has(contactMethod)) {
      return NextResponse.json({ ok: false, error: "invalid_contact_method", message: "A valid contact method is required." }, { status: 400 });
    }
    if (contactMethod === "external_reservation" && !reservationUrl) {
      return NextResponse.json({ ok: false, error: "missing_external_reservation_url", message: "A reservation URL is required." }, { status: 400 });
    }
    if (contactMethod === "phone" && !phoneNumber) {
      return NextResponse.json({ ok: false, error: "missing_phone_number", message: "A phone number is required." }, { status: 400 });
    }

    const supabase = await createClient();
    if (isUuid(locationId)) {
      const { data: locationExists } = await supabase.from("locations").select("id").eq("id", locationId).maybeSingle();
      if (!locationExists) {
        return NextResponse.json({ ok: false, error: "location_not_found", message: "Location could not be found." }, { status: 404 });
      }
    }

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { data, error } = await supabase
      .from("outings")
      .insert({
        user_id: userId,
        source_location_id: sourceLocationId ?? locationId,
        location_id: isUuid(locationId) ? locationId : null,
        location_type: asString(payload?.location_type),
        status: "planned",
        reservation_type: asString(payload?.reservation_type) ?? "external",
        external_reservation_url: reservationUrl,
        phone_number: phoneNumber,
        contact_method: contactMethod,
        reservation_clicked_at: contactMethod === "external_reservation" ? new Date().toISOString() : null,
        call_clicked_at: contactMethod === "phone" ? new Date().toISOString() : null,
        source: asString(payload?.source) ?? "unknown",
      })
      .select("id")
      .single();

    if (error) {
      console.error("THEOUTHAVEN_OUTING_TRACKING_FAILED", { error: error.message, location_id: selectedLocationId, contact_method: contactMethod });
      return NextResponse.json({ ok: true, outing_id: null, tracking_status: "unavailable" });
    }

    if (!data?.id) {
      console.error("THEOUTHAVEN_OUTING_TRACKING_FAILED_NO_DATA", { location_id: selectedLocationId, contact_method: contactMethod });
      return NextResponse.json({ ok: true, outing_id: null, tracking_status: "unavailable" });
    }

    const outingId = data.id;
    console.info("THEOUTHAVEN_OUTING_TRACKING_STARTED", { outing_id: outingId, location_id: selectedLocationId, contact_method: contactMethod });

    await Promise.allSettled([
      trackEvent({ event_name: "outing_started", user_id: userId, location_id: locationId, source_location_id: sourceLocationId ?? locationId, outing_id: outingId, page_path: asString(payload?.page_path), source: asString(payload?.source) ?? "unknown", metadata: { contact_method: contactMethod } }),
      trackEvent({ event_name: contactMethod === "phone" ? "call_clicked" : "reserve_clicked", event_type: contactMethod === "phone" ? "phone_click" : "reservation_started", user_id: userId, location_id: locationId, source_location_id: sourceLocationId ?? locationId, outing_id: outingId, page_path: asString(payload?.page_path), source: asString(payload?.source) ?? "unknown", metadata: { contact_method: contactMethod, reservation_type: asString(payload?.reservation_type) ?? null } }),
    ]);

    return NextResponse.json({ ok: true, outing_id: outingId });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request", message: "Invalid request payload." }, { status: 400 });
  }
}
