import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  requireAdminLocationApiRead,
  requireAdminLocationApiWrite,
} from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeResource(
  resource: any,
  source:
    | "layout_items"
    | "location_bookable_items"
    | "reserve_live_layout_status" = "layout_items",
) {
  const id =
    resource.id ||
    resource.layout_item_id ||
    resource.bookable_item_id ||
    resource.resource_id ||
    null;
  return {
    ...resource,
    id,
    layout_item_id:
      source === "layout_items" ? id : resource.layout_item_id || null,
    bookable_item_id:
      source === "location_bookable_items"
        ? id
        : resource.bookable_item_id || null,
    resource_id: id,
    resource_source:
      resource.resource_source ||
      resource.resource_table ||
      resource.source ||
      source,
    resource_table:
      resource.resource_table ||
      resource.resource_source ||
      resource.source ||
      source,
    source:
      resource.source ||
      resource.resource_source ||
      resource.resource_table ||
      source,
    label: resource.item_name || resource.name || resource.label || null,
    item_name: resource.item_name || resource.label || resource.name || null,
    item_type: resource.item_type || resource.type || null,
    capacity:
      resource.capacity ??
      resource.capacity_max ??
      resource.capacity_min ??
      null,
    capacity_min: resource.capacity_min ?? resource.capacity ?? null,
    capacity_max: resource.capacity_max ?? resource.capacity ?? null,
    layout_x: resource.layout_x ?? resource.x_position ?? 0,
    layout_y: resource.layout_y ?? resource.y_position ?? 0,
    layout_width: resource.layout_width ?? resource.width ?? null,
    layout_height: resource.layout_height ?? resource.height ?? null,
    status:
      resource.status ||
      (resource.is_active === false ? "hidden" : "available"),
    is_active: resource.is_active !== false,
  };
}

function isMissingTable(error: any) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "").includes("does not exist")
  );
}

export function byResourceKey(resources: any[]) {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = `${String(resource.item_name || resource.name || resource.label || resource.id).toLowerCase()}-${resource.capacity ?? resource.capacity_max ?? resource.capacity_min ?? ""}-${resource.item_type || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function payloadFromBody(body: Record<string, any>) {
  const payload: Record<string, any> = {};
  for (const [key, value] of Object.entries({
    item_name: body.item_name || body.label,
    item_type: body.item_type || body.type,
    status: body.status,
    capacity: body.capacity,
    is_active: body.is_active,
    source_table: body.source_table,
    source_id: body.source_id,
    x_position: body.x_position,
    y_position: body.y_position,
    width: body.width,
    height: body.height,
    rotation: body.rotation,
    sort_order: body.sort_order,
  })) {
    if (value !== undefined) payload[key] = value;
  }
  payload.updated_at = new Date().toISOString();
  return payload;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminLocationApiRead();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const locationId =
    clean(searchParams.get("adminLocationId")) ||
    clean(searchParams.get("locationId"));
  const date =
    clean(searchParams.get("date")) || new Date().toISOString().split("T")[0];
  if (!locationId)
    return NextResponse.json(
      { success: false, error: "Missing location ID." },
      { status: 400 },
    );

  let resources: any[] = [];
  const [rpc, fallback, legacy] = await Promise.all([
    supabaseAdmin.rpc("reserve_live_layout_status", {
      p_location_id: locationId,
      p_reservation_date: date,
    }),
    supabaseAdmin
      .from("layout_items")
      .select("*")
      .eq("location_id", locationId)
      .neq("is_active", false)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("location_bookable_items")
      .select("*")
      .eq("location_id", locationId)
      .neq("is_active", false)
      .order("layout_zone", { ascending: true })
      .order("layout_y", { ascending: true })
      .order("layout_x", { ascending: true }),
  ]);

  if (!rpc.error)
    resources.push(
      ...(rpc.data || []).map((resource: any) =>
        normalizeResource(resource, "reserve_live_layout_status"),
      ),
    );
  if (!fallback.error)
    resources.push(
      ...(fallback.data || []).map((resource: any) =>
        normalizeResource(resource, "layout_items"),
      ),
    );
  else if (!isMissingTable(fallback.error))
    return NextResponse.json(
      { success: false, error: fallback.error.message },
      { status: 500 },
    );
  if (!legacy.error)
    resources.push(
      ...(legacy.data || []).map((resource: any) =>
        normalizeResource(resource, "location_bookable_items"),
      ),
    );
  else if (!isMissingTable(legacy.error))
    return NextResponse.json(
      { success: false, error: legacy.error.message },
      { status: 500 },
    );
  resources = byResourceKey(resources);

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: "admin_location_resources_view",
    targetType: "layout_items",
    metadata: { date, count: resources.length },
    request,
  });
  return NextResponse.json({ success: true, resources });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const body = await request.json();
  const locationId = clean(body.adminLocationId || body.location_id);
  if (!locationId)
    return NextResponse.json(
      { success: false, error: "Missing location ID." },
      { status: 400 },
    );

  const { data, error } = await supabaseAdmin
    .from("layout_items")
    .insert({
      location_id: locationId,
      source_table: clean(body.source_table) || "locations",
      source_id: clean(body.source_id) || null,
      item_type: clean(body.item_type || body.type) || "table",
      item_name: clean(body.item_name || body.label) || "New resource",
      capacity: Math.max(
        1,
        Number(body.capacity || body.capacity_max || body.capacity_min || 2),
      ),
      status: clean(body.status) || "available",
      is_active: true,
    })
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: "layout_resource_create",
    targetType: "layout_item",
    targetId: data.id,
    afterData: data,
    request,
  });
  return NextResponse.json({ success: true, resource: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const body = await request.json();
  const locationId = clean(body.adminLocationId || body.location_id);
  const resourceId = clean(body.id || body.resource_id);
  if (!locationId || !resourceId)
    return NextResponse.json(
      { success: false, error: "Missing location or resource ID." },
      { status: 400 },
    );

  const before = await supabaseAdmin
    .from("layout_items")
    .select("*")
    .eq("id", resourceId)
    .eq("location_id", locationId)
    .maybeSingle();
  const { data, error } = await supabaseAdmin
    .from("layout_items")
    .update(payloadFromBody(body))
    .eq("id", resourceId)
    .eq("location_id", locationId)
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: "layout_resource_update",
    targetType: "layout_item",
    targetId: resourceId,
    beforeData: before.data,
    afterData: data,
    request,
  });
  return NextResponse.json({ success: true, resource: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const locationId =
    clean(searchParams.get("adminLocationId")) ||
    clean(searchParams.get("locationId"));
  const resourceId =
    clean(searchParams.get("id")) || clean(searchParams.get("resourceId"));
  if (!locationId || !resourceId)
    return NextResponse.json(
      { success: false, error: "Missing location or resource ID." },
      { status: 400 },
    );

  const before = await supabaseAdmin
    .from("layout_items")
    .select("*")
    .eq("id", resourceId)
    .eq("location_id", locationId)
    .maybeSingle();
  const { error } = await supabaseAdmin
    .from("layout_items")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", resourceId)
    .eq("location_id", locationId);
  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: "layout_resource_delete",
    targetType: "layout_item",
    targetId: resourceId,
    beforeData: before.data,
    metadata: { softDelete: true },
    request,
  });
  return NextResponse.json({ success: true });
}
