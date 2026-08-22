import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkReservationAvailability } from "@/lib/reservations/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function minutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function timeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = clean(searchParams.get("locationId"), 80);
    const date = clean(searchParams.get("date"), 10);
    const partySize = Number(searchParams.get("partySize") || 0);
    if (!locationId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(partySize)) {
      return NextResponse.json({ error: "Choose a date and party size." }, { status: 400 });
    }

    const { data: location, error } = await supabaseAdmin
      .from("locations")
      .select("id,large_group_booking_enabled,large_group_min_party_size,large_group_max_party_size,large_group_confirmation_mode,large_group_payment_mode,large_group_deposit_type,large_group_deposit_amount_cents,large_group_prix_fixe_mode,large_group_default_duration_minutes")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw error;
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const config = {
      enabled: Boolean(location.large_group_booking_enabled),
      minPartySize: Number(location.large_group_min_party_size || 8),
      maxPartySize: Number(location.large_group_max_party_size || 40),
      confirmationMode: String(location.large_group_confirmation_mode || "approval"),
      paymentMode: String(location.large_group_payment_mode || "none"),
      depositType: String(location.large_group_deposit_type || "flat"),
      depositAmountCents: Number(location.large_group_deposit_amount_cents || 0),
      prixFixeMode: String(location.large_group_prix_fixe_mode || "optional"),
      durationMinutes: Number(location.large_group_default_duration_minutes || 180),
    };
    if (!config.enabled) return NextResponse.json({ enabled: false, config, slots: [] });
    if (partySize < config.minPartySize || partySize > config.maxPartySize) {
      return NextResponse.json({ enabled: true, config, slots: [], reason: `Party size must be between ${config.minPartySize} and ${config.maxPartySize}.` });
    }

    const weekday = new Date(`${date}T12:00:00`).getDay();
    const { data: rule } = await supabaseAdmin
      .from("location_capacity")
      .select("open_time,close_time,is_closed")
      .eq("location_id", locationId)
      .eq("day_of_week", weekday)
      .maybeSingle();
    if (rule?.is_closed) return NextResponse.json({ enabled: true, config, slots: [] });

    const open = String(rule?.open_time || "17:00").slice(0, 5);
    const close = String(rule?.close_time || "22:00").slice(0, 5);
    const start = minutes(open);
    const end = minutes(close);
    const candidateTimes: string[] = [];
    for (let value = start; value + config.durationMinutes <= end; value += 30) {
      candidateTimes.push(`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`);
    }

    const results = await Promise.all(candidateTimes.map(async (time) => ({
      time,
      result: await checkReservationAvailability({
        location_id: locationId,
        reservation_date: date,
        reservation_time: time,
        party_size: partySize,
      }),
    })));

    const slots = results.filter((entry) => entry.result.available).map((entry) => ({
      value: entry.time,
      label: timeLabel(entry.time),
      remainingCapacity: entry.result.remaining_capacity,
    }));
    return NextResponse.json({ enabled: true, config, slots });
  } catch (error) {
    console.error("LARGE_GROUP_AVAILABILITY_ERROR", error);
    return NextResponse.json({ error: "Unable to load live group availability." }, { status: 500 });
  }
}
