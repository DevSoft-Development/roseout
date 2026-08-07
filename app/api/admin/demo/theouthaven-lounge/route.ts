import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY, insertSafe } from "@/lib/demo/demo-center";
import { normalizeRole } from "@/lib/users/roles";

const ALLOWED_ROLES = new Set([
  "superadmin",
  "admin",
  "ambassador",
  "partner_ambassador",
]);

const DEMO_SPACES = [
  { item_name: "Table 1", item_type: "table", capacity: 4, layout_x: 32, layout_y: 48 },
  { item_name: "Table 2", item_type: "table", capacity: 4, layout_x: 232, layout_y: 48 },
  { item_name: "VIP Booth", item_type: "booth", capacity: 6, layout_x: 432, layout_y: 48 },
  { item_name: "Bar Seats", item_type: "bar_seat", capacity: 8, layout_x: 32, layout_y: 208 },
  { item_name: "Private Room", item_type: "private_room", capacity: 12, layout_x: 232, layout_y: 208 },
  { item_name: "Patio Table", item_type: "patio_seat", capacity: 4, layout_x: 432, layout_y: 208 },
] as const;

async function normalizeDemoReservationInventory(locationId: string) {
  const canonicalNames = DEMO_SPACES.map((space) => space.item_name);

  for (const table of ["layout_items", "location_bookable_items"] as const) {
    const { data: rows, error } = await supabaseAdmin
      .from(table)
      .select("id,item_name,created_at")
      .eq("location_id", locationId)
      .in("item_name", canonicalNames)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Unable to inspect ${table} for the demo fixture.`);
    }

    const seen = new Set<string>();
    const duplicateIds: string[] = [];

    for (const row of rows || []) {
      const name = String(row.item_name || "");
      if (!canonicalNames.includes(name as (typeof canonicalNames)[number])) continue;
      if (seen.has(name)) duplicateIds.push(String(row.id));
      else seen.add(name);
    }

    if (duplicateIds.length) {
      const { error: deleteError } = await supabaseAdmin
        .from(table)
        .delete()
        .in("id", duplicateIds);
      if (deleteError) {
        throw new Error(`Unable to remove duplicate ${table} demo rows.`);
      }
    }

    const missing = DEMO_SPACES.filter((space) => !seen.has(space.item_name));
    if (missing.length) {
      const payload = missing.map((item, index) => ({
        location_id: locationId,
        location_type: "restaurant",
        source_table: "restaurant",
        capacity_min: 1,
        capacity_max: item.capacity,
        duration_minutes: 90,
        default_duration_minutes: 90,
        reservation_duration_minutes: 90,
        is_active: true,
        status: "available",
        layout_width: 172,
        layout_height: 118,
        rotation: 0,
        sort_order: index + 1,
        notes: "TheOutHaven Lounge canonical E2E demo space.",
        demo_key: MIRROR_DEMO_KEY,
        is_demo: true,
        ...item,
      }));
      const result = await insertSafe(table, payload);
      if (!result.ok && !result.skipped) {
        throw new Error(`Unable to restore missing ${table} demo rows.`);
      }
    }
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: adminUser, error: adminError }, { data: userProfile }] =
    await Promise.all([
      supabaseAdmin
        .from("admin_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const role = normalizeRole(adminUser?.role || userProfile?.role);
  if (adminError || !role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: prepared, error: prepareError } = await supabaseAdmin
    .from("locations")
    .update({
      is_searchable: false,
      is_hidden: true,
      demo_visible_publicly: false,
      publish_ready: false,
      reservation_enabled: true,
      internal_reservations_enabled: true,
      uses_internal_reservations: true,
      reservation_source: "internal",
      reservation_mode: "internal_booking",
      updated_at: new Date().toISOString(),
    })
    .eq("demo_key", MIRROR_DEMO_KEY)
    .select(
      "id,name,restaurant_name,activity_name,location_type,primary_category,address,city,state,zip_code,main_image,image_url,images,is_demo,demo_key,is_searchable,is_hidden,reservation_mode,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_source",
    )
    .maybeSingle();

  if (prepareError) {
    return NextResponse.json(
      { error: "Unable to prepare TheOutHaven Lounge demo fixture." },
      { status: 500 },
    );
  }

  if (!prepared?.id) {
    return NextResponse.json(
      { error: "TheOutHaven Lounge test fixture is missing." },
      { status: 404 },
    );
  }

  const id = String(prepared.id);

  try {
    await normalizeDemoReservationInventory(id);
  } catch (error) {
    console.error("THEOUTHAVEN_DEMO_RESERVATION_INVENTORY_REPAIR_FAILED", error);
    return NextResponse.json(
      { error: "Unable to prepare TheOutHaven Lounge reservation inventory." },
      { status: 500 },
    );
  }

  const context = new URLSearchParams({
    adminLocationId: id,
    locationId: id,
    type: "restaurant",
    demo: "1",
    fromDemoCenter: "1",
    fromCreate: "1",
  }).toString();

  return NextResponse.json({
    location: {
      ...prepared,
      publicViewHref: `/locations/restaurant/${encodeURIComponent(id)}?${context}`,
      locationDashboardHref: `/locations/dashboard?${context}`,
      reservationHref: `/reserve/location/${encodeURIComponent(id)}?${context}`,
      checkInHref: `/locations/restaurant/${encodeURIComponent(id)}/check-in?${context}`,
      feedbackHref: `/locations/restaurant/${encodeURIComponent(id)}/feedback?${context}`,
    },
  });
}
