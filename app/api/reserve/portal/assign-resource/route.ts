import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

const ACTIVE_STATUSES = ["pending", "confirmed", "checked_in", "arrived", "seated"];
const LAYOUT_TABLE = "layout_items";
const BOOKABLE_TABLE = "location_bookable_items";
const ASSIGNMENT_COLUMNS = ["bookable_item_id", "bookable_item_name", "bookable_item_type", "updated_at"];
const MISSING_ASSIGNMENT_MESSAGE = "Reservation table assignment is not set up yet. Run the latest reservation migration.";
const RESOURCE_NOT_FOUND_MESSAGE = "We could not find that table. Refresh the floor and try again.";
const UNKNOWN_ASSIGNMENT_MESSAGE = "We could not assign this table. Please try another table.";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isMissingTable(error: any) {
  return error?.code === "42P01" || String(error?.message || "").includes("does not exist");
}

function isMissingColumn(error: any) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("column") && (message.includes("does not exist") || message.includes("not found"));
}

function missingColumnName(error: any) {
  const message = String(error?.message || "");
  return ASSIGNMENT_COLUMNS.find((column) => message.includes(column)) || null;
}

function logDbFailure(operation: string, context: Record<string, any>, error: any) {
  console.error("RESERVE_ASSIGN_RESOURCE_DB_ERROR", {
    operation,
    reservationId: context.reservationId,
    locationId: context.locationId,
    resourceId: context.resourceId,
    resourceLabel: context.resourceLabel,
    resourceSource: context.resourceSource,
    code: error?.code,
    message: error?.message,
    details: error?.details,
  });
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

export function normalizeResource(resource: any, source: typeof LAYOUT_TABLE | typeof BOOKABLE_TABLE): AssignableResource {
  const label = clean(resource.item_name) || clean(resource.name) || clean(resource.label) || null;
  const capacity = source === LAYOUT_TABLE
    ? numberOrNull(resource.capacity)
    : numberOrNull(resource.capacity_max ?? resource.capacity_min ?? resource.capacity);
  return {
    id: clean(resource.id) || null,
    source,
    label,
    type: clean(resource.item_type || resource.type) || null,
    capacity,
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

async function findResource(resourceId: string, locationId: string, source: string | null, context: Record<string, any>) {
  const shouldTryLayout = !source || source === LAYOUT_TABLE;
  const shouldTryBookable = !source || source === BOOKABLE_TABLE;

  if (shouldTryLayout) {
    const layout = await supabaseAdmin
      .from(LAYOUT_TABLE)
      .select("id,item_name,item_type,capacity,status,is_active")
      .eq("id", resourceId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (layout.error) {
      logDbFailure("find_layout_resource", context, layout.error);
      if (!isMissingTable(layout.error) && !isMissingColumn(layout.error)) throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
    }
    if (layout.data) return normalizeResource(layout.data, LAYOUT_TABLE);
  }

  if (shouldTryBookable) {
    const bookable = await supabaseAdmin
      .from(BOOKABLE_TABLE)
      .select("*")
      .eq("id", resourceId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (bookable.error) {
      logDbFailure("find_bookable_resource", context, bookable.error);
      if (!isMissingTable(bookable.error) && !isMissingColumn(bookable.error)) throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
    }
    if (bookable.data) return normalizeResource(bookable.data, BOOKABLE_TABLE);
  }

  return null;
}

async function validateAssignment(reservation: any, resource: AssignableResource, reservationId: string, locationId: string, context: Record<string, any>) {
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
  if (active.error) {
    logDbFailure("validate_assignment_conflicts", context, active.error);
    if (isMissingColumn(active.error)) throw new Error(MISSING_ASSIGNMENT_MESSAGE);
    throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
  }

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

async function updateReservationAssignment(reservationId: string, locationId: string, resource: AssignableResource, context: Record<string, any>) {
  const basePayload: Record<string, any> = {
    bookable_item_id: resource.id || null,
    bookable_item_name: resource.label,
    bookable_item_type: resource.type || null,
    updated_at: new Date().toISOString(),
  };
  let payload = { ...basePayload };
  let removedAssignmentColumns = 0;

  for (let attempt = 0; attempt < ASSIGNMENT_COLUMNS.length + 1; attempt += 1) {
    const update = await supabaseAdmin
      .from("location_reservations")
      .update(payload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .select("*")
      .single();
    if (!update.error) return update.data;

    logDbFailure("update_reservation_assignment", { ...context, payloadColumns: Object.keys(payload) }, update.error);
    if (!isMissingColumn(update.error)) throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);

    const missing = missingColumnName(update.error);
    if (missing && missing in payload) {
      delete payload[missing];
      if (missing !== "updated_at") removedAssignmentColumns += 1;
    } else if ("updated_at" in payload) {
      delete payload.updated_at;
    } else if ("bookable_item_type" in payload) {
      delete payload.bookable_item_type;
      removedAssignmentColumns += 1;
    } else if ("bookable_item_id" in payload) {
      delete payload.bookable_item_id;
      removedAssignmentColumns += 1;
    } else if ("bookable_item_name" in payload) {
      delete payload.bookable_item_name;
      removedAssignmentColumns += 1;
    } else {
      break;
    }

    if (!Object.keys(payload).some((column) => column.startsWith("bookable_item_"))) break;
  }

  if (removedAssignmentColumns >= 3 || !Object.keys(payload).some((column) => column.startsWith("bookable_item_"))) {
    throw new Error(MISSING_ASSIGNMENT_MESSAGE);
  }
  throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
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
  const context = { reservationId, locationId, resourceId, resourceLabel, resourceSource };

  if (!reservationId) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 400 });
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location ID." }, { status: 400 });
  if (!resourceId && !resourceLabel) return NextResponse.json({ success: false, error: "Choose a valid table or space." }, { status: 400 });

  const before = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle();
  if (before.error) {
    logDbFailure("load_reservation_before_assignment", context, before.error);
    return NextResponse.json({ success: false, error: UNKNOWN_ASSIGNMENT_MESSAGE }, { status: 500 });
  }
  if (!before.data) return NextResponse.json({ success: false, error: "Select a reservation before assigning a table." }, { status: 404 });

  try {
    const foundResource = resourceId ? await findResource(resourceId, locationId, resourceSource, context) : null;
    if (!foundResource && !resourceLabel) return NextResponse.json({ success: false, error: RESOURCE_NOT_FOUND_MESSAGE }, { status: 404 });
    const resource = foundResource || manualLabelResource(resourceId, resourceLabel as string, resourceType, resourceCapacity);

    const validationError = await validateAssignment(before.data, resource, reservationId, locationId, context);
    if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 409 });

    const updatedReservation = await updateReservationAssignment(reservationId, locationId, resource, {
      ...context,
      resourceLabel: resource.label,
      resourceSource: resource.source,
    });

    await logAdminLocationAction({
      adminUser: auth.adminUser,
      locationId,
      actionType: "admin_reservation_assign_resource",
      targetType: "reservation",
      targetId: reservationId,
      beforeData: before.data,
      afterData: updatedReservation,
      metadata: { resourceId, resourceSource, resourceLabel: resource.label, resourceType: resource.type, resourceCapacity: resource.capacity },
      request,
    });

    return NextResponse.json({ success: true, reservation: updatedReservation, resource: updatedReservation?.bookable_item_id || resourceId });
  } catch (error: any) {
    const message = clean(error?.message) || UNKNOWN_ASSIGNMENT_MESSAGE;
    console.error("RESERVE_ASSIGN_RESOURCE_FAILED", { ...context, message });
    const status = message === MISSING_ASSIGNMENT_MESSAGE ? 500 : message === RESOURCE_NOT_FOUND_MESSAGE ? 404 : message.includes("unavailable") || message.includes("fit") ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
