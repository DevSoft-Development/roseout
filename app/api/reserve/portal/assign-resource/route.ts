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
    if (layout.error && !isMissingTable(layout.error)) throw new Error("We could not assign this table. Please try another table.");
    if (layout.data) return normalizeResource(layout.data, LAYOUT_TABLE);
  }

  if (shouldTryBookable) {
    const bookable = await supabaseAdmin
      .from(BOOKABLE_TABLE)
      .select("id,item_name,item_type,capacity_min,capacity_max,is_active")
      .eq("id", resourceId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (bookable.error && !isMissingTable(bookable.error)) throw new Error("We could not assign this table. Please try another table.");
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
    .select("id,status,reservation_date,reservation_time,duration_minutes,turn_time_minutes,bookable_item_id,bookable_item_name,bookable_item_type")
    .eq("location_id", locationId)
    .eq("reservation_date", reservation.reservation_date)
    .neq("id", reservationId)
    .in("status", ACTIVE_STATUSES);
  if (active.error) throw new Error("We could not assign this table. Please try another table.");

  const resourceId = resource.id;
  const requestedLabel = normalizeLabel(resource.label);
  const conflict = (active.data || []).some((entry: any) => {
    const sameResource = Boolean(resourceId) && entry.bookable_item_id === resourceId;
    const sameLabel = Boolean(requestedLabel) && [entry.bookable_item_name].map(normalizeLabel).some((label) => label === requestedLabel);
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

  if (!reservationId) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 400 });
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  if (!resourceId && !resourceLabel) return NextResponse.json({ success: false, error: "Choose a valid table or space." }, { status: 400 });

  const before = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle();
  if (before.error) return NextResponse.json({ success: false, error: "We could not assign this table. Please try another table." }, { status: 500 });
  if (!before.data) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 404 });

  try {
    const foundResource = resourceId ? await findResource(resourceId, locationId, resourceSource) : null;
    if (!foundResource && !resourceLabel) return NextResponse.json({ success: false, error: "Choose a valid table or space." }, { status: 400 });
    const resource = foundResource || manualLabelResource(resourceId, resourceLabel as string, resourceType, resourceCapacity);

    const validationError = await validateAssignment(before.data, resource, reservationId, locationId);
    if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 409 });

    const updatePayload: Record<string, any> = {
      bookable_item_id: resource.id || null,
      bookable_item_name: resource.label,
      bookable_item_type: resource.type || null,
      updated_at: new Date().toISOString(),
    };

    const update = await supabaseAdmin
      .from("location_reservations")
      .update(updatePayload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .select("*")
      .single();
    if (update.error) return NextResponse.json({ success: false, error: "We could not assign this table. Please try another table." }, { status: 500 });

    await logAdminLocationAction({
      adminUser: auth.adminUser,
      locationId,
      actionType: "admin_reservation_assign_resource",
      targetType: "reservation",
      targetId: reservationId,
      beforeData: before.data,
      afterData: update.data,
      metadata: { resourceId, resourceSource, resourceLabel, resourceType, resourceCapacity },
      request,
    });

    return NextResponse.json({ success: true, reservation: update.data, resource: update.data?.bookable_item_id || resourceId });
  } catch (error) {
    console.error("RESERVE_ASSIGN_RESOURCE_FAILED", error);
    return NextResponse.json({ success: false, error: "We could not assign this table. Please try another table." }, { status: 500 });
  }
}
