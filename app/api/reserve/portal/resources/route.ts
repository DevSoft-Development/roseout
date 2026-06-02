import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiRead, requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function payloadFromBody(body: Record<string, any>) {
  const payload: Record<string, any> = {};
  for (const [key, value] of Object.entries({
    label: body.label || body.item_name,
    item_name: body.item_name || body.label,
    item_type: body.item_type || body.type,
    status: body.status,
    capacity: body.capacity,
    capacity_min: body.capacity_min,
    capacity_max: body.capacity_max,
    floor_section: body.floor_section || body.section,
    x_position: body.x_position,
    y_position: body.y_position,
    width: body.width,
    height: body.height,
    sort_order: body.sort_order,
    is_active: body.is_active,
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
  const locationId = clean(searchParams.get("adminLocationId")) || clean(searchParams.get("locationId"));
  const date = clean(searchParams.get("date")) || new Date().toISOString().split("T")[0];
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });

  let resources: any[] = [];
  const rpc = await supabaseAdmin.rpc("reserve_live_layout_status", { p_location_id: locationId, p_reservation_date: date });
  if (!rpc.error) {
    resources = rpc.data || [];
  } else {
    const fallback = await supabaseAdmin.from("layout_items").select("*").eq("location_id", locationId).neq("is_active", false).order("sort_order", { ascending: true });
    if (fallback.error) return NextResponse.json({ success: false, error: fallback.error.message }, { status: 500 });
    resources = fallback.data || [];
  }

  await logAdminLocationAction({ adminUser: auth.adminUser, locationId, actionType: "admin_location_resources_view", targetType: "layout_items", metadata: { date, count: resources.length }, request });
  return NextResponse.json({ success: true, resources });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const body = await request.json();
  const locationId = clean(body.adminLocationId || body.location_id);
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("layout_items").insert({
    location_id: locationId,
    source_table: clean(body.source_table) || "locations",
    item_type: clean(body.item_type || body.type) || "table",
    label: clean(body.label || body.item_name) || "New resource",
    item_name: clean(body.item_name || body.label) || "New resource",
    capacity: Math.max(1, Number(body.capacity || 2)),
    capacity_min: Math.max(1, Number(body.capacity_min || 1)),
    capacity_max: body.capacity_max ? Number(body.capacity_max) : null,
    status: clean(body.status) || "available",
    floor_section: clean(body.floor_section || body.section) || null,
    is_active: true,
  }).select("*").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminLocationAction({ adminUser: auth.adminUser, locationId, actionType: "layout_resource_create", targetType: "layout_item", targetId: data.id, afterData: data, request });
  return NextResponse.json({ success: true, resource: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const body = await request.json();
  const locationId = clean(body.adminLocationId || body.location_id);
  const resourceId = clean(body.id || body.resource_id);
  if (!locationId || !resourceId) return NextResponse.json({ success: false, error: "Missing location or resource ID." }, { status: 400 });

  const before = await supabaseAdmin.from("layout_items").select("*").eq("id", resourceId).eq("location_id", locationId).maybeSingle();
  const { data, error } = await supabaseAdmin.from("layout_items").update(payloadFromBody(body)).eq("id", resourceId).eq("location_id", locationId).select("*").single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminLocationAction({ adminUser: auth.adminUser, locationId, actionType: "layout_resource_update", targetType: "layout_item", targetId: resourceId, beforeData: before.data, afterData: data, request });
  return NextResponse.json({ success: true, resource: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const locationId = clean(searchParams.get("adminLocationId")) || clean(searchParams.get("locationId"));
  const resourceId = clean(searchParams.get("id")) || clean(searchParams.get("resourceId"));
  if (!locationId || !resourceId) return NextResponse.json({ success: false, error: "Missing location or resource ID." }, { status: 400 });

  const before = await supabaseAdmin.from("layout_items").select("*").eq("id", resourceId).eq("location_id", locationId).maybeSingle();
  const { error } = await supabaseAdmin.from("layout_items").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", resourceId).eq("location_id", locationId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminLocationAction({ adminUser: auth.adminUser, locationId, actionType: "layout_resource_delete", targetType: "layout_item", targetId: resourceId, beforeData: before.data, metadata: { softDelete: true }, request });
  return NextResponse.json({ success: true });
}
