import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";
import {
  hostAttentionItems,
  pacingWarnings,
  rankStaffForParty,
} from "@/lib/reservations/enterpriseHost";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTable(error: any) {
  return error?.code === "42P01" || String(error?.message || "").includes("does not exist");
}

function normalizeResource(resource: any, source: string) {
  const id = resource.id || resource.layout_item_id || resource.bookable_item_id || null;
  return {
    ...resource,
    id,
    resource_id: id,
    resource_source: source,
    resource_table: source,
    item_name: resource.item_name || resource.name || resource.label || "Table",
    item_type: resource.item_type || resource.type || "table",
    capacity: resource.capacity ?? resource.capacity_max ?? resource.capacity_min ?? 0,
    is_active: resource.is_active !== false,
  };
}

export async function GET(request: NextRequest) {
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  const date = clean(request.nextUrl.searchParams.get("date")) || new Date().toISOString().slice(0, 10);
  if (!locationId) {
    return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  }

  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);

  const [reservationsResult, layoutResult, bookableResult, waitlistResult, settingsResult, staffResult, shiftsResult, sectionsResult, eventsResult] = await Promise.all([
    supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .eq("reservation_date", date)
      .order("reservation_time", { ascending: true }),
    supabaseAdmin
      .from("layout_items")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .neq("is_active", false)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_bookable_items")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .neq("is_active", false),
    supabaseAdmin
      .from("reservation_waitlist")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .in("status", ["waiting", "notified", "pending"])
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("reserve_service_settings")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .maybeSingle(),
    supabaseAdmin
      .from("reserve_staff_profiles")
      .select("id,location_id,team_member_id,display_name,role,is_active,can_quick_switch")
      .eq("location_id", canonicalLocationId)
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabaseAdmin
      .from("reserve_staff_shifts")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .eq("service_date", date),
    supabaseAdmin
      .from("reserve_service_sections")
      .select("*")
      .eq("location_id", canonicalLocationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("reserve_service_events")
      .select("id,reservation_id,staff_profile_id,event_type,resource_label,metadata,created_at")
      .eq("location_id", canonicalLocationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (reservationsResult.error) {
    return NextResponse.json({ success: false, error: "Unable to load reservations." }, { status: 500 });
  }

  const optionalResults = [settingsResult, staffResult, shiftsResult, sectionsResult, eventsResult];
  const enterpriseSchemaReady = optionalResults.every((result) => !result.error || isMissingTable(result.error));
  const reservations = reservationsResult.data || [];

  const resourceMap = new Map<string, any>();
  for (const [rows, source] of [
    [layoutResult.error ? [] : layoutResult.data || [], "layout_items"],
    [bookableResult.error ? [] : bookableResult.data || [], "location_bookable_items"],
  ] as const) {
    for (const row of rows as any[]) {
      const normalized = normalizeResource(row, source);
      const key = `${String(normalized.item_name).toLowerCase()}|${normalized.item_type}|${normalized.capacity}`;
      if (!resourceMap.has(key)) resourceMap.set(key, normalized);
    }
  }
  const resources = [...resourceMap.values()];
  const settings = settingsResult.error ? null : settingsResult.data;
  const staffProfiles = staffResult.error ? [] : staffResult.data || [];
  const shifts = shiftsResult.error ? [] : shiftsResult.data || [];
  const sections = sectionsResult.error ? [] : sectionsResult.data || [];
  const activeStaff = staffProfiles.map((profile: any) => {
    const shift = shifts.find((row: any) => row.staff_profile_id === profile.id);
    return {
      ...profile,
      status: shift?.status || "unavailable",
      section_id: shift?.section_id || null,
      max_tables: shift?.max_tables || null,
      max_covers: shift?.max_covers || null,
    };
  });

  const serverRanking = rankStaffForParty(2, activeStaff, reservations).map((entry) => ({
    staff: entry.staff,
    load: entry.load,
    score: entry.score,
  }));

  const generatedAt = new Date().toISOString();
  return NextResponse.json({
    success: true,
    lane: "reserve-v1",
    locationId: canonicalLocationId,
    date,
    generatedAt,
    enterpriseSchemaReady,
    access: {
      role: auth.access?.role,
      roleLabel: auth.access?.roleLabel,
      permissions: auth.access?.permissions,
    },
    reservations,
    resources,
    waitlist: waitlistResult.error ? [] : waitlistResult.data || [],
    settings: settings || {
      assignment_mode: "balanced",
      include_bar_in_auto_assignment: true,
      late_grace_minutes: 15,
      floor_focus_default: false,
      offline_snapshot_minutes: 120,
    },
    staff: activeStaff,
    sections,
    events: eventsResult.error ? [] : eventsResult.data || [],
    attention: hostAttentionItems(reservations),
    pacing: {
      warnings: pacingWarnings(reservations, settings || {}),
    },
    serverRanking,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-TheOutHaven-API-Lane": "reserve-v1",
    },
  });
}
