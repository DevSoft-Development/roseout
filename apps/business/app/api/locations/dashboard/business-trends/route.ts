import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  hasOwnerAccessToLocation,
} from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function adminSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function inRange(value: unknown, start: string, end: string) {
  const date = String(value || "");
  return date >= start && date < end;
}

function reservationDate(row: Row) {
  return String(row.reservation_date || row.created_at || "");
}

function reservationPartySize(row: Row) {
  return Number(row.party_size || 0) || 1;
}

function moneyValue(row: Row) {
  return Number(row.deposit_amount || 0) || 0;
}

function trend(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function isActive(row: Row) {
  return !["cancelled", "declined"].includes(String(row.status || "").toLowerCase());
}

function isServed(row: Row) {
  return ["completed", "seated", "checked_in", "arrived"].includes(String(row.status || "").toLowerCase());
}

function isWalkIn(row: Row) {
  return String(row.source || "").toLowerCase().includes("walk");
}

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId")?.trim();
  if (!locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });

  const authSupabase = await createAuthClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getLocationOwnerAccess(user.id);
  const supabase = adminSupabase();
  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id,source_id,source_location_id,legacy_source_id,canonical_location_id")
    .eq("id", locationId)
    .maybeSingle();

  if (locationError || !location) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  if (!access.isAdmin && !hasOwnerAccessToLocation(access, location as Row)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = Array.from(new Set([
    location.id,
    location.source_id,
    location.source_location_id,
    location.legacy_source_id,
    location.canonical_location_id,
  ].map((value) => String(value || "").trim()).filter(Boolean)));

  const now = new Date();
  const currentStartDate = new Date(now);
  currentStartDate.setUTCDate(currentStartDate.getUTCDate() - 30);
  const previousStartDate = new Date(now);
  previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 60);
  const currentStart = currentStartDate.toISOString();
  const previousStart = previousStartDate.toISOString();
  const end = now.toISOString();

  // Aggregate metrics never need guest contact data, tokens, payment-method IDs, or notes.
  const [{ data: reservations }, { data: vipSignups }] = await Promise.all([
    supabase
      .from("location_reservations")
      .select("status,reservation_date,party_size,source,created_at,deposit_amount")
      .in("location_id", ids)
      .gte("created_at", previousStart)
      .lt("created_at", end)
      .limit(4000),
    supabase
      .from("location_vip_signups")
      .select("created_at")
      .in("location_id", ids)
      .gte("created_at", previousStart)
      .lt("created_at", end)
      .limit(4000),
  ]);

  const active = ((reservations || []) as Row[]).filter(isActive);
  const currentRows = active.filter((row) => inRange(row.created_at || reservationDate(row), currentStart, end));
  const previousRows = active.filter((row) => inRange(row.created_at || reservationDate(row), previousStart, currentStart));
  const currentVip = (vipSignups || []).filter((row) => inRange(row.created_at, currentStart, end)).length;
  const previousVip = (vipSignups || []).filter((row) => inRange(row.created_at, previousStart, currentStart)).length;

  const current = {
    reservations: currentRows.length,
    guestsServed: currentRows.filter(isServed).reduce((sum, row) => sum + reservationPartySize(row), 0),
    walkIns: currentRows.filter(isWalkIn).length,
    revenue: currentRows.reduce((sum, row) => sum + moneyValue(row), 0),
    vipSignups: currentVip,
  };
  const previous = {
    reservations: previousRows.length,
    guestsServed: previousRows.filter(isServed).reduce((sum, row) => sum + reservationPartySize(row), 0),
    walkIns: previousRows.filter(isWalkIn).length,
    revenue: previousRows.reduce((sum, row) => sum + moneyValue(row), 0),
    vipSignups: previousVip,
  };

  return NextResponse.json({
    window: { currentStart, previousStart, end },
    current,
    previous,
    trendPercent: {
      reservations: trend(current.reservations, previous.reservations),
      guestsServed: trend(current.guestsServed, previous.guestsServed),
      walkIns: trend(current.walkIns, previous.walkIns),
      revenue: trend(current.revenue, previous.revenue),
      vipSignups: trend(current.vipSignups, previous.vipSignups),
    },
  });
}
