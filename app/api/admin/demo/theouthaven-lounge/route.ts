import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY, insertSafe, safeUpdateExistingColumns } from "@/lib/demo/demo-center";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

const DEMO_SPACES = [
    { item_name: "Main Bar", item_type: "bar", capacity: 10, x_position: 32, y_position: 28, layout_x: 32, layout_y: 28, width: 520, height: 96, layout_width: 520, layout_height: 96, layout_zone: "Bar" },
    { item_name: "Booth 1", item_type: "booth", capacity: 4, x_position: 32, y_position: 164, layout_x: 32, layout_y: 164, width: 180, height: 112, layout_width: 180, layout_height: 112, layout_zone: "Booths" },
    { item_name: "Booth 2", item_type: "booth", capacity: 6, x_position: 236, y_position: 164, layout_x: 236, layout_y: 164, width: 190, height: 112, layout_width: 190, layout_height: 112, layout_zone: "Booths" },
    { item_name: "VIP Booth", item_type: "booth", capacity: 8, x_position: 450, y_position: 164, layout_x: 450, layout_y: 164, width: 220, height: 112, layout_width: 220, layout_height: 112, layout_zone: "Booths" },
    { item_name: "Table 1", item_type: "table", capacity: 2, x_position: 32, y_position: 324, layout_x: 32, layout_y: 324, width: 118, height: 96, layout_width: 118, layout_height: 96, layout_zone: "Dining Room" },
    { item_name: "Table 2", item_type: "table", capacity: 2, x_position: 176, y_position: 324, layout_x: 176, layout_y: 324, width: 118, height: 96, layout_width: 118, layout_height: 96, layout_zone: "Dining Room" },
    { item_name: "Table 3", item_type: "table", capacity: 4, x_position: 320, y_position: 324, layout_x: 320, layout_y: 324, width: 150, height: 106, layout_width: 150, layout_height: 106, layout_zone: "Dining Room" },
    { item_name: "Table 4", item_type: "table", capacity: 4, x_position: 494, y_position: 324, layout_x: 494, layout_y: 324, width: 150, height: 106, layout_width: 150, layout_height: 106, layout_zone: "Dining Room" },
    { item_name: "Table 5", item_type: "table", capacity: 6, x_position: 32, y_position: 468, layout_x: 32, layout_y: 468, width: 192, height: 112, layout_width: 192, layout_height: 112, layout_zone: "Dining Room" },
    { item_name: "Table 6", item_type: "table", capacity: 6, x_position: 250, y_position: 468, layout_x: 250, layout_y: 468, width: 192, height: 112, layout_width: 192, layout_height: 112, layout_zone: "Dining Room" },
    { item_name: "Table 7", item_type: "table", capacity: 8, x_position: 468, y_position: 468, layout_x: 468, layout_y: 468, width: 220, height: 118, layout_width: 220, layout_height: 118, layout_zone: "Dining Room" },
    { item_name: "Private Room", item_type: "private_room", capacity: 12, x_position: 704, y_position: 164, layout_x: 704, layout_y: 164, width: 220, height: 210, layout_width: 220, layout_height: 210, layout_zone: "Private" },
    { item_name: "Patio Table", item_type: "patio_seat", capacity: 4, x_position: 704, y_position: 404, layout_x: 704, layout_y: 404, width: 150, height: 106, layout_width: 150, layout_height: 106, layout_zone: "Patio" },
  ] as const;

async function normalizeDemoReservationInventory(locationId: string) {
  for (const table of ["layout_items", "location_bookable_items"] as const) {
    const spaces =
      table === "location_bookable_items"
        ? DEMO_SPACES.filter((space) => space.item_type !== "bar")
        : DEMO_SPACES;
    const names = spaces.map((space) => space.item_name);
    const { data: rows, error } = await supabaseAdmin
      .from(table)
      .select("id,item_name,created_at")
      .eq("location_id", locationId)
      .in("item_name", names)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Unable to inspect ${table} for the demo fixture.`);
    }

    const seen = new Set<string>();
    const duplicateIds: string[] = [];

    for (const row of rows || []) {
      const name = String(row.item_name || "");
      if (!names.includes(name as (typeof names)[number])) continue;
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

    const existingByName = new Map((rows || []).map((row) => [String(row.item_name || ""), row]));
    for (const [index, item] of spaces.entries()) {
      const existing = existingByName.get(item.item_name);
      if (!existing?.id) continue;
      const payload = {
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
        rotation: 0,
        sort_order: index + 1,
        notes: "TheOutHaven Lounge canonical E2E demo space.",
        ...item,
      };
      const updatePayload = { ...payload } as Record<string, unknown>;
      delete updatePayload.location_id;
      const synced = await safeUpdateExistingColumns(
        table,
        "id",
        String(existing.id),
        updatePayload,
      );
      if (!synced.applied.length && synced.errors.length) {
        throw new Error(`Unable to update ${table} demo row ${item.item_name}.`);
      }
    }

    const missing = spaces.filter((space) => !seen.has(space.item_name));
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
  const viewer = await getInternalDemoViewer();
  if (!viewer) {
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
      fullMirrorHref: "/internal/demo/theouthaven-lounge",
    },
  });
}
