import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeReservationFormDateTime } from "@/lib/reservations/timeSlots";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const ACTIVE_WAITLIST_STATUSES = ["waiting", "waitlisted", "notified"];
export const TERMINAL_WAITLIST_STATUSES = ["booked", "expired", "cancelled", "seated", "converted"];

export function normalizeWaitlistRow<T extends Record<string, any>>(row: T) {
  const contactName = row.contact_name || row.customer_name || null;
  const contactPhone = row.contact_phone || row.customer_phone || null;
  const contactEmail = row.contact_email || row.customer_email || null;

  return {
    ...row,
    contact_name: row.contact_name || row.customer_name || null,
    customer_name: row.customer_name || row.contact_name || null,
    contact_phone: row.contact_phone || row.customer_phone || null,
    customer_phone: row.customer_phone || row.contact_phone || null,
    contact_email: row.contact_email || row.customer_email || null,
    customer_email: row.customer_email || row.contact_email || null,
    notes: row.notes || row.special_request || row.special_requests || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = cleanString(searchParams.get("adminLocationId")) || cleanString(searchParams.get("locationId"));
    const reservationDate = cleanString(searchParams.get("date")) || new Date().toISOString().split("T")[0];
    if (!locationId) return NextResponse.json({ success: false, waitlist: [], error: "Missing location ID." }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("reservation_waitlist")
      .select("*")
      .eq("location_id", locationId)
      .eq("reservation_date", reservationDate)
      // notified is still active because the guest has been offered a slot but has not converted, expired, cancelled, or been seated.
      .in("status", ACTIVE_WAITLIST_STATUSES)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) return NextResponse.json({ success: false, waitlist: [], error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, waitlist: (data || []).map(normalizeWaitlistRow) });
  } catch (error) {
    return NextResponse.json({ success: false, waitlist: [], error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const locationId = cleanString(body.location_id);
    const requestedDate = cleanString(body.reservation_date);
    const requestedTime = cleanString(body.reservation_time).slice(0, 5);
    const { reservationDate, reservationTime } = normalizeReservationFormDateTime({ reservationDate: requestedDate, reservationTime: requestedTime });
    const partySize = Math.max(Number(body.party_size || 2), 1);
    const contactName = cleanString(body.contact_name);
    const contactEmail = cleanString(body.contact_email);
    const contactPhone = cleanString(body.contact_phone);

    if (!locationId || !reservationDate || !reservationTime || !contactName) {
      return NextResponse.json({ error: "Missing required waitlist details." }, { status: 400 });
    }

    if (!contactEmail && !contactPhone) {
      return NextResponse.json({ error: "Please provide an email or phone number." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { count } = await supabaseAdmin
      .from("reservation_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("location_id", locationId)
      .eq("reservation_date", reservationDate)
      .eq("reservation_time", reservationTime)
      .eq("status", "waiting");

    const normalizedName = contactName;
    const normalizedPhone = contactPhone || null;
    const normalizedEmail = contactEmail || null;

    const basePayload = {
      location_id: locationId,
      user_id: user?.id || null,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      contact_name: normalizedName,
      contact_email: normalizedEmail,
      contact_phone: normalizedPhone,
      customer_name: normalizedName,
      customer_email: normalizedEmail,
      customer_phone: normalizedPhone,
      notes: cleanString(body.notes) || null,
      status: "waiting",
    };

    let insertResult = await supabaseAdmin
      .from("reservation_waitlist")
      .insert(basePayload)
      .select("*")
      .single();

    if (insertResult.error) return NextResponse.json({ error: insertResult.error.message }, { status: 500 });

    return NextResponse.json({ success: true, waitlist: normalizeWaitlistRow(insertResult.data), waitlist_position: Number(count || 0) + 1 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}
