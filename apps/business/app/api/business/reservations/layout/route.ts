import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: unknown) {
  return String(value || "").toLowerCase().includes("activ") ? "activity" : "restaurant";
}

function normalizeItem(item: any) {
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
    resource_source: "layout_items",
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
  const result = await supabaseAdmin
    .from("layout_items")
    .select("*")
    .eq("location_id", locationId)
    .neq("is_active", false)
    .order("sort_order", { ascending: true })
    .order("y_position", { ascending: true })
    .order("x_position", { ascending: true });

  if (result.error) throw new Error(result.error.message);

  return (result.data || [])
    .map((item) => normalizeItem(item))
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.layout_y - b.layout_y ||
        a.layout_x - b.layout_x,
    );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminLocationId = clean(searchParams.get("adminLocationId"));
    const locationId = clean(searchParams.get("locationId") || adminLocationId);
    if (!locationId) return NextResponse.json({ error: "Missing locationId." }, { status: 400 });

    const demoAccess = await getInternalDemoLocationAccess({
      locationId,
      adminLocationId,
      demo: searchParams.get("demo"),
      fromDemoCenter: searchParams.get("fromDemoCenter"),
    });
    const auth = demoAccess ? { location: demoAccess.location } : await requireOwner(locationId);
    if ("error" in auth && auth.error) return auth.error;

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
      return NextResponse.json({ success: true, item: normalizeItem(result.data) });
    }

    if (action === "delete_layout_item") {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ error: "Missing layout item id." }, { status: 400 });

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("layout_items")
        .select("location_id")
        .eq("id", id)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (!existing?.location_id) {
        return NextResponse.json({ error: "Reservation space not found." }, { status: 404 });
      }

      const auth = await requireOwner(String(existing.location_id));
      if (auth.error) return auth.error;

      const result = await supabaseAdmin
        .from("layout_items")
        .delete()
        .eq("id", id);
      if (result.error) throw new Error(result.error.message);

      return NextResponse.json({ success: true });
    }

    if (["move_layout_item","update_layout_item","update_item_status"].includes(action)) {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ error: "Missing layout item id." }, { status: 400 });

      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("layout_items")
        .select("location_id")
        .eq("id", id)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (!existing?.location_id) {
        return NextResponse.json({ error: "Reservation space not found." }, { status: 404 });
      }

      const itemAuth = await requireOwner(String(existing.location_id));
      if (itemAuth.error) return itemAuth.error;

      const payload = {
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

      const result = await supabaseAdmin
        .from("layout_items")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (result.error) throw new Error(result.error.message);

      return NextResponse.json({ success: true, item: normalizeItem(result.data) });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save reservation space." }, { status: 500 });
  }
}
