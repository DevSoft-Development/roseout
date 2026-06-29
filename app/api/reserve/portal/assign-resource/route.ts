import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

const ACTIVE_STATUSES = ["pending", "confirmed", "checked_in", "arrived", "seated"];
const LAYOUT_TABLE = "layout_items";
const BOOKABLE_TABLE = "location_bookable_items";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTable(error: any) {
  return error?.code === "42P01" || String(error?.message || "").includes("does not exist");
}

function minutes(value: unknown) {
  const [hours, mins] = String(value || "00:00").split(":").map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0);
}

function overlaps(startA: unknown, durationA: unknown, startB: unknown, durationB: unknown) {
  const aStart = minutes(startA);
  const bStart = minutes(startB);
  const aEnd = aStart + Math.max(1, Number(durationA || 90));
  const bEnd = bStart + Math.max(1, Number(durationB || 90));
  return aStart < bEnd && bStart < aEnd;
}

type AssignableResource = {
  id: string | null;
  source: typeof LAYOUT_TABLE | typeof BOOKABLE_TABLE | "manual_label";
  label: string | null;
  type: string | null;
  capacity: number | null;
};

function normalizeLabel(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeResource(resource: any, source: typeof LAYOUT_TABLE | typeof BOOKABLE_TABLE): AssignableResource {
  const label = resource.label || resource.item_name || resource.name || null;
  const capacity = resource.capacity ?? resource.capacity_max ?? resource.capacity_min ?? null;
  return {
    id: resource.id,
    source,
    label,
    type: resource.item_type || resource.type || null,
    capacity: capacity === null || capacity === undefined ? null : Number(capacity),
  };
}

function manualLabelResource(resourceId: string | null, label: string, type: string | null, capacity: number | null): AssignableResource {
  return {
    id: resourceId,
    source: "manual_label",
    label,
    type: type || "table",
    capacity,
  };
}

async function findResource(resourceId: string, locationId: string, source: string | null) {
  const shouldTryLayout = !source || source === LAYOUT_TABLE;
  const shouldTryBookable = !source || source === BOOKABLE_TABLE;

  if (shouldTryLayout) {
    const layout = await supabaseAdmin
      .from(LAYOUT_TABLE)
      .select("id,label,item_name,item_type,capacity,status,is_active")
      .eq("id", resourceId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (layout.error && !isMissingTable(layout.error)) throw new Error(layout.error.message);
    if (layout.data) return normalizeResource(layout.data, LAYOUT_TABLE);
  }

  if (shouldTryBookable) {
    const bookable = await supabaseAdmin
      .from(BOOKABLE_TABLE)
      .select("id,item_name,item_type,capacity_min,capacity_max,is_active")
      .eq("id", resourceId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (bookable.error && !isMissingTable(bookable.error)) throw new Error(bookable.error.message);
    if (bookable.data) return normalizeResource(bookable.data, BOOKABLE_TABLE);
  }

  return null;
}

async function validateAssignment(reservation: any, resource: AssignableResource, reservationId: string, locationId: string) {
  if (resource.capacity !== null && Number.isFinite(resource.capacity) && resource.capacity > 0 && Number(reservation.party_size || 1) > resource.capacity) {
    return "This table does not fit this party size.";
  }

  const active = await supabaseAdmin
    .from("location_reservations")
    .select("id,status,reservation_time,duration_minutes,turn_time_minutes,assigned_resource_id,bookable_item_id,assigned_resource_label,bookable_item_name,reservable_item_name")
    .eq("location_id", locationId)
    .eq("reservation_date", reservation.reservation_date)
    .neq("id", reservationId)
    .in("status", ACTIVE_STATUSES);
  if (active.error) throw new Error(active.error.message);

  const resourceId = resource.id;
  const requestedLabel = normalizeLabel(resource.label);
  const conflict = (active.data || []).some((entry: any) => {
    const sameResource = Boolean(resourceId) && (entry.assigned_resource_id === resourceId || entry.bookable_item_id === resourceId);
    const sameLabel = Boolean(requestedLabel) && [entry.assigned_resource_label, entry.bookable_item_name, entry.reservable_item_name].map(normalizeLabel).some((label) => label === requestedLabel);
    if (!sameResource && !sameLabel) return false;
    return overlaps(
      reservation.reservation_time,
      reservation.duration_minutes || reservation.turn_time_minutes || 90,
      entry.reservation_time,
      entry.duration_minutes || entry.turn_time_minutes || 90,
    );
  });
  return conflict ? "That table is already unavailable for this reservation time." : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;

  const body = await request.json();
  const reservationId = clean(body.reservation_id);
  const locationId = clean(body.adminLocationId || body.location_id);
  const resourceId = clean(body.resource_id) || null;
  const resourceSource = clean(body.resource_source || body.resource_table || body.source) || null;
  const resourceLabel = clean(body.resource_label) || null;
  const resourceType = clean(body.resource_type) || null;
  const parsedCapacity = Number(body.resource_capacity);
  const resourceCapacity = Number.isFinite(parsedCapacity) ? parsedCapacity : null;
  const autoAssign = body.auto_assign === true;
  const preferredResourceType = clean(body.preferred_resource_type) || null;

  if (!reservationId) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 400 });
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  if (!resourceId && !resourceLabel && !autoAssign) return NextResponse.json({ success: false, error: "Choose a valid table or space." }, { status: 400 });

  const before = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle();
  if (before.error) return NextResponse.json({ success: false, error: before.error.message }, { status: 500 });
  if (!before.data) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 404 });

  let updated: any = null;
  const rpc = await supabaseAdmin.rpc("reserve_assign_resource", {
    p_reservation_id: reservationId,
    p_resource_id: resourceId,
    p_auto_assign: autoAssign,
    p_preferred_resource_type: preferredResourceType,
  });

  if (!rpc.error) {
    updated = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  } else if (resourceId || resourceLabel) {
    try {
      const foundResource = resourceId ? await findResource(resourceId, locationId, resourceSource) : null;
      if (!foundResource && !resourceLabel) return NextResponse.json({ success: false, error: "Choose a valid table or space." }, { status: 400 });
      const resource = foundResource || manualLabelResource(resourceId, resourceLabel as string, resourceType, resourceCapacity);

      const validationError = await validateAssignment(before.data, resource, reservationId, locationId);
      if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 409 });

      const updatePayload: Record<string, any> = {
        assigned_resource_label: resource.label,
        assigned_resource_type: resource.type || "table",
        assignment_mode: "manual",
        updated_at: new Date().toISOString(),
      };
      if (resource.id) updatePayload.assigned_resource_id = resource.id;
      if (resource.source === BOOKABLE_TABLE) {
        updatePayload.bookable_item_id = resource.id;
        updatePayload.bookable_item_name = resource.label;
        updatePayload.bookable_item_type = resource.type;
      }

      const update = await supabaseAdmin
        .from("location_reservations")
        .update(updatePayload)
        .eq("id", reservationId)
        .eq("location_id", locationId)
        .select("*")
        .single();
      if (update.error) return NextResponse.json({ success: false, error: update.error.message }, { status: 500 });
      updated = update.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not assign this table. Please try another table.";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
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
    metadata: { resourceId, resourceSource, resourceLabel, resourceType, resourceCapacity, autoAssign, preferredResourceType },
    request,
  });

  return NextResponse.json({ success: true, reservation: updated, resource: updated?.assigned_resource_id || updated?.bookable_item_id || resourceId });
}
