import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;

  const body = await request.json();
  const reservationId = clean(body.reservation_id);
  const locationId = clean(body.adminLocationId || body.location_id);
  const resourceId = clean(body.resource_id) || null;
  const autoAssign = body.auto_assign === true;
  const preferredResourceType = clean(body.preferred_resource_type) || null;

  if (!reservationId || !locationId) {
    return NextResponse.json({ success: false, error: "Missing reservation or location ID." }, { status: 400 });
  }

  const before = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle();

  let updated: any = null;
  const rpc = await supabaseAdmin.rpc("reserve_assign_resource", {
    p_reservation_id: reservationId,
    p_resource_id: resourceId,
    p_auto_assign: autoAssign,
    p_preferred_resource_type: preferredResourceType,
  });

  if (!rpc.error) {
    updated = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  } else if (resourceId) {
    const resource = await supabaseAdmin.from("layout_items").select("id,label,item_name,item_type,capacity").eq("id", resourceId).eq("location_id", locationId).maybeSingle();
    if (resource.error || !resource.data) {
      return NextResponse.json({ success: false, error: "No available table, booth, room, or resource fits this reservation." }, { status: 400 });
    }
    const update = await supabaseAdmin
      .from("location_reservations")
      .update({
        assigned_resource_id: resourceId,
        assigned_resource_label: resource.data.label || resource.data.item_name || null,
        assigned_resource_type: resource.data.item_type || null,
        assignment_mode: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .select("*")
      .single();
    if (update.error) return NextResponse.json({ success: false, error: update.error.message }, { status: 500 });
    updated = update.data;
  } else {
    return NextResponse.json({ success: false, error: "No available table, booth, room, or resource fits this reservation." }, { status: 400 });
  }

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: autoAssign ? "admin_reservation_auto_assign_resource" : "admin_reservation_assign_resource",
    targetType: "reservation",
    targetId: reservationId,
    beforeData: before.data,
    afterData: updated,
    metadata: { resourceId, autoAssign, preferredResourceType },
    request,
  });

  return NextResponse.json({ success: true, reservation: updated, resource: updated?.assigned_resource_id || resourceId });
}
