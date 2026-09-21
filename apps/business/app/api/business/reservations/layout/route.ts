import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: unknown) {
  return String(value || "").toLowerCase().includes("activ") ? "activity" : "restaurant";
}

function isMissingTable(error: any) {
  return error?.code === "42P01" || String(error?.message || "").toLowerCase().includes("does not exist");
}

function normalizeItem(item: any, source: "layout_items" | "location_bookable_items") {
  return {
    id: item.id,
    location_id: item.location_id,
    location_type: normalizeType(item.location_type || item.source_table || "restaurant"),
    item_name: item.item_name || item.name || item.label || "Reservation Space",
    item_type: item.item_type || item.type || "table",
    capacity_min: Number(item.capacity_min || item.capacity || 1),
    capacity_max: Number(item.capacity_max || item.capacity || 2),
    is_active: item.is_active !== false,
    layout_x: Number(item.layout_x ?? item.x_position ?? 0),
    layout_y: Number(item.layout_y ?? item.y_position ?? 0),
    layout_width: Number(item.layout_width ?? item.width ?? 172),
    layout_height: Number(item.layout_height ?? item.height ?? 118),
    rotation: Number(item.rotation || 0),
    status: item.status || "available",
    sort_order: Number(item.sort_order || 0),
    duration_minutes: Number(item.duration_minutes || item.default_duration_minutes || item.reservation_duration_minutes || 90),
    default_duration_minutes: Number(item.default_duration_minutes || item.duration_minutes || item.reservation_duration_minutes || 90),
    reservation_duration_minutes: Number(item.reservation_duration_minutes || item.duration_minutes || item.default_duration_minutes || 90),
    notes: item.notes || null,
    resource_source: source,
  };
}

async function requireOwner(locationId: string) {
  const auth = await createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  const locationSelect = "id,source_id,source_table,name,restaurant_name,activity_name";
  let { data: location } = await supabaseAdmin
    .from("locations")
    .select(locationSelect)
    .eq("id", locationId)
    .maybeSingle();
  if (!location) {
    const bySource = await supabaseAdmin
      .from("locations")
      .select(locationSelect)
      .eq("source_id", locationId)
      .maybeSingle();
    location = bySource.data;
  }

  if (!location) return { error: NextResponse.json({ error: "Location not found." }, { status: 404 }) };
  if (!access.isAdmin && !hasOwnerAccessToLocation(access, location as Record<string, any>)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { access, location };
}

async function loadItems(locationId: string) {
  const [neutral, legacy] = await Promise.all([
    supabaseAdmin.from("layout_items").select("*").eq("location_id", locationId),
    supabaseAdmin.from("location_bookable_items").select("*").eq("location_id", locationId),
  ]);

  if (neutral.error && !isMissingTable(neutral.error)) throw new Error(neutral.error.message);
  if (legacy.error && !isMissingTable(legacy.error)) throw new Error(legacy.error.message);

  const merged = new Map<string, any>();
  for (const item of legacy.data || []) {
    const normalized = normalizeItem(item, "location_bookable_items");
    merged.set(`${normalized.item_name.toLowerCase()}|${normalized.item_type}|${normalized.capacity_max}`, normalized);
  }
  for (const item of neutral.data || []) {
    const normalized = normalizeItem(item, "layout_items");
    merged.set(`${normalized.item_name.toLowerCase()}|${normalized.item_type}|${normalized.capacity_max}`, normalized);
  }
  return Array.from(merged.values()).sort((a,b) => a.sort_order - b.sort_order || a.layout_y - b.layout_y || a.layout_x - b.layout_x);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = clean(searchParams.get("locationId"));
    if (!locationId) return NextResponse.json({ error: "Missing locationId." }, { status: 400 });

    const auth = await requireOwner(locationId);
    if (auth.error) return auth.error;

    const canonicalLocationId = String(auth.location.id);
    const items = await loadItems(canonicalLocationId);
    return NextResponse.json({
      items,
      locations: [{
        id: canonicalLocationId,
        type: normalizeType(searchParams.get("type")),
        name: auth.location.name || auth.location.restaurant_name || auth.location.activity_name || "Location",
      }],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load reservation spaces." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const locationId = clean(body.location_id || body.locationId);
    if (!locationId && body.action !== "delete_layout_item") {
      return NextResponse.json({ error: "Missing location id." }, { status: 400 });
    }

    let canonicalLocationId = locationId;
    if (locationId) {
      const auth = await requireOwner(locationId);
      if (auth.error) return auth.error;
      canonicalLocationId = String(auth.location.id);
    }

    const action = clean(body.action);
    if (action === "create_layout_item") {
      const payload = {
        location_id: canonicalLocationId,
        source_table: normalizeType(body.location_type),
        item_type: clean(body.item_type) || "table",
        item_name: clean(body.item_name) || "New Reservation Space",
        capacity: Math.max(1, Number(body.capacity || 2)),
        x_position: Number(body.layout_x || 0),
        y_position: Number(body.layout_y || 0),
        width: Math.max(1, Number(body.layout_width || 172)),
        height: Math.max(1, Number(body.layout_height || 118)),
        rotation: Number(body.rotation || 0),
        status: clean(body.status) || "available",
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order || 0),
        duration_minutes: Number(body.duration_minutes || 90),
        default_duration_minutes: Number(body.default_duration_minutes || body.duration_minutes || 90),
        reservation_duration_minutes: Number(body.reservation_duration_minutes || body.duration_minutes || 90),
        notes: clean(body.notes) || null,
      };
      const result = await supabaseAdmin.from("layout_items").insert(payload).select("*").single();
      if (result.error) throw new Error(result.error.message);
      return NextResponse.json({ success: true, item: normalizeItem(result.data, "layout_items") });
    }

    if (action === "delete_layout_item") {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ error: "Missing layout item id." }, { status: 400 });
      const { data: existing } = await supabaseAdmin.from("layout_items").select("location_id").eq("id", id).maybeSingle();
      const legacy = existing ? null : await supabaseAdmin.from("location_bookable_items").select("location_id").eq("id", id).maybeSingle();
      const ownerLocationId = existing?.location_id || legacy?.data?.location_id;
      if (!ownerLocationId) return NextResponse.json({ error: "Reservation space not found." }, { status: 404 });
      const auth = await requireOwner(ownerLocationId);
      if (auth.error) return auth.error;
      if (existing) {
        const result = await supabaseAdmin.from("layout_items").delete().eq("id", id);
        if (result.error) throw new Error(result.error.message);
      } else {
        const result = await supabaseAdmin.from("location_bookable_items").update({ is_active: false }).eq("id", id);
        if (result.error) throw new Error(result.error.message);
      }
      return NextResponse.json({ success: true });
    }

    if (["move_layout_item","update_layout_item","update_item_status"].includes(action)) {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ error: "Missing layout item id." }, { status: 400 });

      const { data: existingNeutral } = await supabaseAdmin
        .from("layout_items")
        .select("location_id")
        .eq("id", id)
        .maybeSingle();
      const existingLegacy = existingNeutral
        ? null
        : await supabaseAdmin
            .from("location_bookable_items")
            .select("location_id")
            .eq("id", id)
            .maybeSingle();
      const itemLocationId = existingNeutral?.location_id || existingLegacy?.data?.location_id;
      if (!itemLocationId) {
        return NextResponse.json({ error: "Reservation space not found." }, { status: 404 });
      }
      const itemAuth = await requireOwner(String(itemLocationId));
      if (itemAuth.error) return itemAuth.error;

      const neutralPayload = {
        item_type: clean(body.item_type) || "table",
        item_name: clean(body.item_name) || "Reservation Space",
        capacity: Math.max(1, Number(body.capacity || 2)),
        x_position: Number(body.layout_x || 0),
        y_position: Number(body.layout_y || 0),
        width: Math.max(1, Number(body.layout_width || 172)),
        height: Math.max(1, Number(body.layout_height || 118)),
        rotation: Number(body.rotation || 0),
        status: clean(body.status) || "available",
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order || 0),
        duration_minutes: Number(body.duration_minutes || 90),
        default_duration_minutes: Number(body.default_duration_minutes || body.duration_minutes || 90),
        reservation_duration_minutes: Number(body.reservation_duration_minutes || body.duration_minutes || 90),
        notes: clean(body.notes) || null,
      };
      const neutral = await supabaseAdmin.from("layout_items").update(neutralPayload).eq("id", id).select("*").maybeSingle();
      if (!neutral.error && neutral.data) {
        return NextResponse.json({ success: true, item: normalizeItem(neutral.data, "layout_items") });
      }

      const legacyPayload = {
        item_type: neutralPayload.item_type,
        item_name: neutralPayload.item_name,
        capacity_min: neutralPayload.capacity,
        capacity_max: neutralPayload.capacity,
        layout_x: neutralPayload.x_position,
        layout_y: neutralPayload.y_position,
        layout_width: neutralPayload.width,
        layout_height: neutralPayload.height,
        is_active: neutralPayload.is_active,
      };
      const legacy = await supabaseAdmin.from("location_bookable_items").update(legacyPayload).eq("id", id).select("*").single();
      if (legacy.error) throw new Error(legacy.error.message);
      return NextResponse.json({ success: true, item: normalizeItem(legacy.data, "location_bookable_items") });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save reservation space." }, { status: 500 });
  }
}
