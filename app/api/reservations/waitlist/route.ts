import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
      .in("status", ["waiting", "waitlisted"])
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) return NextResponse.json({ success: false, waitlist: [], error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, waitlist: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, waitlist: [], error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const locationId = cleanString(body.location_id);
    const reservationDate = cleanString(body.reservation_date);
    const reservationTime = cleanString(body.reservation_time).slice(0, 5);
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

    const basePayload = {
      location_id: locationId,
      user_id: user?.id || null,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      contact_name: contactName,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      status: "waiting",
    };

    let insertResult = await supabaseAdmin
      .from("reservation_waitlist")
      .insert(basePayload)
      .select("*")
      .single();

    if (insertResult.error && /customer_name|customer_phone/i.test(insertResult.error.message)) {
      insertResult = await supabaseAdmin
        .from("reservation_waitlist")
        .insert({
          ...basePayload,
          customer_name: contactName,
          customer_phone: contactPhone || null,
        })
        .select("*")
        .single();
    }

    if (insertResult.error) return NextResponse.json({ error: insertResult.error.message }, { status: 500 });

    return NextResponse.json({ success: true, waitlist: insertResult.data, waitlist_position: Number(count || 0) + 1 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong." }, { status: 500 });
  }
}
