import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getLobbyDisplaySession,
  guestDisplayLabel,
} from "@/lib/reserve/lobbyDisplay";

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cleanName(row: any) {
  return row?.customer_name || row?.contact_name || row?.guest_name || row?.name || "";
}

function waitMinutes(row: any) {
  const candidates = [
    row?.estimated_wait_minutes,
    row?.wait_time_minutes,
    row?.estimated_wait,
    row?.quoted_wait_minutes,
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 600) return Math.round(numeric);
  }
  return null;
}

function timeLabel(value: unknown) {
  const raw = String(value || "").slice(0, 5);
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export async function GET() {
  const display = await getLobbyDisplaySession();
  if (!display) {
    return NextResponse.json(
      { success: false, paired: false, error: "This display is not paired." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const date = easternDate();
  const [locationResult, reservationsResult, waitlistResult] = await Promise.all([
    supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name")
      .eq("id", display.location_id)
      .maybeSingle(),
    supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("location_id", display.location_id)
      .eq("reservation_date", date)
      .in("status", ["checked_in", "arrived", "waiting", "ready"])
      .order("reservation_time", { ascending: true })
      .limit(100),
    supabaseAdmin
      .from("reservation_waitlist")
      .select("*")
      .eq("location_id", display.location_id)
      .eq("reservation_date", date)
      .in("status", ["waiting", "waitlisted", "notified", "pending"])
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (reservationsResult.error || waitlistResult.error) {
    return NextResponse.json(
      { success: false, paired: true, error: "Queue data is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const location = locationResult.data as any;
  const locationName =
    location?.name ||
    location?.restaurant_name ||
    location?.activity_name ||
    "TheOutHaven Reserve";
  const privacyMode = String(display.privacy_mode || "initials");

  const reservations = (reservationsResult.data || []).map((row: any) => ({
    id: row.id,
    label: guestDisplayLabel(cleanName(row), row.id, privacyMode),
    partySize: Math.max(1, Number(row.party_size || 1)),
    time: display.show_reservation_time ? timeLabel(row.reservation_time) : null,
    state: String(row.status || "").toLowerCase() === "ready" ? "Ready" : "Checked in",
    ready: String(row.status || "").toLowerCase() === "ready",
  }));

  const waitlist = (waitlistResult.data || []).map((row: any, index: number) => {
    const status = String(row.status || "").toLowerCase();
    const ready = status === "notified";
    return {
      id: row.id,
      label: guestDisplayLabel(cleanName(row), row.id, privacyMode),
      partySize: Math.max(1, Number(row.party_size || 1)),
      position: display.show_waitlist_position ? index + 1 : null,
      estimatedWait: display.show_estimated_wait ? waitMinutes(row) : null,
      state: ready ? "Ready" : "Waiting",
      ready,
    };
  });

  return NextResponse.json(
    {
      success: true,
      paired: true,
      generatedAt: new Date().toISOString(),
      display: {
        label: display.label,
        privacyMode,
      },
      location: { name: locationName },
      reservations,
      waitlist,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-TheOutHaven-API-Lane": "reserve-display",
      },
    },
  );
}
