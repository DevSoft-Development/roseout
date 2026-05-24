import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = body?.location_id ? String(body.location_id) : null;
  const locationType = body?.location_type ? String(body.location_type) : null;
  const externalReservationUrl = body?.external_reservation_url ? String(body.external_reservation_url) : null;
  const phoneNumber = body?.phone_number ? String(body.phone_number) : null;
  const contactMethod = body?.contact_method ? String(body.contact_method) : null;

  const isPhone = contactMethod === "phone";
  const now = new Date().toISOString();
  const payload = {
    location_id: locationId,
    location_type: locationType,
    external_reservation_url: externalReservationUrl,
    phone_number: phoneNumber,
    contact_method: contactMethod,
    reservation_type: "external",
    status: isPhone ? "call_clicked" : "reservation_clicked",
    reservation_clicked_at: isPhone ? null : now,
    call_clicked_at: isPhone ? now : null,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin.from("outings").insert(payload).select("id,status").maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: error?.message || "Unable to start outing." }, { status: 500 });

  return NextResponse.json({
    success: true,
    outing_id: data.id,
    redirect_url: isPhone ? (phoneNumber ? `tel:${phoneNumber}` : null) : externalReservationUrl,
  });
}
