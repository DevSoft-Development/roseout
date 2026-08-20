import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverExperienceBooking } from "@/lib/experiences/booking-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(length = 6) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function deliveryStatus(attempted: boolean, sent: boolean) {
  if (!attempted) return "skipped";
  return sent ? "sent" : "failed";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const slotId = String(body.slotId || "");
  const customerName = String(body.customerName || "").trim();
  const customerEmail = String(body.customerEmail || "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone || "").trim() || null;
  const partySize = Number(body.partySize || 1);
  if (!slotId || !customerName || !customerEmail || !Number.isInteger(partySize) || partySize < 1) {
    return NextResponse.json({ error: "Missing or invalid booking details." }, { status: 400 });
  }

  const [{ data: experience }, { data: slot }] = await Promise.all([
    supabaseAdmin.from("experiences").select("id,title,min_party_size,max_party_size,status,searchable").eq("id", id).maybeSingle(),
    supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,status").eq("id", slotId).eq("experience_id", id).maybeSingle(),
  ]);
  if (!experience || experience.status !== "published" || !experience.searchable || !slot || slot.status !== "open") {
    return NextResponse.json({ error: "This experience or time slot is unavailable." }, { status: 404 });
  }
  if (partySize < experience.min_party_size || partySize > experience.max_party_size) {
    return NextResponse.json({ error: `Party size must be between ${experience.min_party_size} and ${experience.max_party_size}.` }, { status: 400 });
  }
  if (new Date(slot.starts_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This time slot has already started." }, { status: 409 });
  }

  const { data: existing, error: countError } = await supabaseAdmin
    .from("experience_bookings")
    .select("party_size")
    .eq("slot_id", slotId)
    .eq("status", "confirmed");
  if (countError) throw countError;
  const reserved = (existing || []).reduce((sum, row) => sum + Number(row.party_size || 0), 0);
  if (reserved + partySize > slot.capacity) {
    return NextResponse.json({ error: "Not enough availability remains for that party size." }, { status: 409 });
  }

  let checkinCode = makeCode();
  for (let i = 0; i < 4; i += 1) {
    const { data } = await supabaseAdmin.from("experience_bookings").select("id").eq("checkin_code", checkinCode).maybeSingle();
    if (!data) break;
    checkinCode = makeCode();
  }
  const publicToken = randomBytes(24).toString("base64url");
  const { data: booking, error } = await supabaseAdmin
    .from("experience_bookings")
    .insert({ experience_id: id, slot_id: slotId, customer_name: customerName, customer_email: customerEmail, customer_phone: customerPhone, party_size: partySize, public_token: publicToken, checkin_code: checkinCode })
    .select("id,public_token,checkin_code")
    .single();
  if (error) throw error;

  const delivery = await deliverExperienceBooking({
    customerName,
    email: customerEmail,
    phone: customerPhone,
    experienceTitle: experience.title,
    startsAt: slot.starts_at,
    publicToken: booking.public_token,
    checkinCode: booking.checkin_code,
  });

  const deliveryError = [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null;
  const { error: deliveryUpdateError } = await supabaseAdmin
    .from("experience_bookings")
    .update({
      email_delivery_status: deliveryStatus(delivery.email.attempted, delivery.email.sent),
      sms_delivery_status: deliveryStatus(delivery.sms.attempted, delivery.sms.sent),
      delivery_error: deliveryError,
      delivery_attempted_at: new Date().toISOString(),
    })
    .eq("id", booking.id);
  if (deliveryUpdateError) console.error("Experience booking delivery status update failed", deliveryUpdateError);

  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    checkinCode: booking.checkin_code,
    passUrl: `/experience-bookings/${booking.public_token}`,
    delivery: {
      email: deliveryStatus(delivery.email.attempted, delivery.email.sent),
      sms: deliveryStatus(delivery.sms.attempted, delivery.sms.sent),
    },
  });
}
