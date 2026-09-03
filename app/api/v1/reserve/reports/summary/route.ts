import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function summarize(rows: any[]) {
  const active = rows.filter((row) => !["cancelled", "declined"].includes(String(row.status || "").toLowerCase()));
  const completed = rows.filter((row) => String(row.status || "").toLowerCase() === "completed");
  const covers = active.reduce((sum, row) => sum + Math.max(1, Number(row.party_size || 1)), 0);
  const noShows = rows.filter((row) => String(row.status || "").toLowerCase() === "no_show").length;
  const cancelled = rows.filter((row) => ["cancelled", "declined"].includes(String(row.status || "").toLowerCase())).length;
  const walkIns = rows.filter((row) => ["host_waitlist", "walk_in", "walkin"].includes(String(row.source || "").toLowerCase())).length;
  const bar = rows.filter((row) => /bar|counter/i.test(String(row.bookable_item_type || ""))).length;
  const turnSamples = completed
    .map((row) => {
      const start = row.seated_at ? new Date(row.seated_at).getTime() : Number.NaN;
      const end = row.completed_at ? new Date(row.completed_at).getTime() : Number.NaN;
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 60000 : null;
    })
    .filter((value): value is number => value !== null && value <= 720);
  const averageTurnMinutes = turnSamples.length ? Math.round(turnSamples.reduce((a, b) => a + b, 0) / turnSamples.length) : null;
  const averagePartySize = active.length ? Number((covers / active.length).toFixed(1)) : 0;
  return { reservations: rows.length, activeReservations: active.length, covers, completed: completed.length, noShows, cancelled, walkIns, barReservations: bar, averageTurnMinutes, averagePartySize };
}

function percentDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const end = new Date();
  const currentStart = new Date(end); currentStart.setUTCDate(currentStart.getUTCDate() - 27);
  const previousStart = new Date(currentStart); previousStart.setUTCDate(previousStart.getUTCDate() - 28);
  const previousEnd = new Date(currentStart); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const { data, error } = await supabaseAdmin
    .from("location_reservations")
    .select("id,status,reservation_date,reservation_time,party_size,source,bookable_item_type,bookable_item_name,seated_at,completed_at,server_staff_profile_id")
    .eq("location_id", canonicalLocationId)
    .gte("reservation_date", dateKey(previousStart))
    .lte("reservation_date", dateKey(end));
  if (error) return NextResponse.json({ success: false, error: "Unable to load Reserve reports." }, { status: 500 });

  const rows = data || [];
  const currentRows = rows.filter((row) => row.reservation_date >= dateKey(currentStart));
  const previousRows = rows.filter((row) => row.reservation_date >= dateKey(previousStart) && row.reservation_date <= dateKey(previousEnd));
  const current = summarize(currentRows);
  const previous = summarize(previousRows);

  const staffIds = [...new Set(currentRows.map((row) => row.server_staff_profile_id).filter(Boolean))];
  const staff = staffIds.length
    ? await supabaseAdmin.from("reserve_staff_profiles").select("id,display_name,role").in("id", staffIds)
    : { data: [], error: null } as any;
  const serverPerformance = (staff.data || []).map((person: any) => {
    const assigned = currentRows.filter((row) => row.server_staff_profile_id === person.id);
    return {
      id: person.id,
      displayName: person.display_name,
      role: person.role,
      reservations: assigned.length,
      covers: assigned.reduce((sum, row) => sum + Math.max(1, Number(row.party_size || 1)), 0),
      completed: assigned.filter((row) => row.status === "completed").length,
    };
  }).sort((a: any, b: any) => b.covers - a.covers);

  const metrics = await supabaseAdmin
    .from("reserve_service_metrics_daily")
    .select("*")
    .eq("location_id", canonicalLocationId)
    .gte("service_date", dateKey(currentStart))
    .lte("service_date", dateKey(end));

  return NextResponse.json({
    success: true,
    lane: "reserve-v1",
    range: { currentStart: dateKey(currentStart), currentEnd: dateKey(end), previousStart: dateKey(previousStart), previousEnd: dateKey(previousEnd) },
    current,
    previous,
    change: {
      reservations: percentDelta(current.reservations, previous.reservations),
      covers: percentDelta(current.covers, previous.covers),
      completed: percentDelta(current.completed, previous.completed),
      noShows: percentDelta(current.noShows, previous.noShows),
      walkIns: percentDelta(current.walkIns, previous.walkIns),
    },
    serverPerformance,
    serviceMetrics: metrics.error ? [] : metrics.data || [],
  }, { headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}