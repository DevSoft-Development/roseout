import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "arrived",
  "seated",
];
const LAYOUT_TABLE = "layout_items";
const BOOKABLE_TABLE = "location_bookable_items";
const REQUIRED_ASSIGNMENT_COLUMNS = [
  "bookable_item_id",
  "bookable_item_name",
  "bookable_item_type",
] as const;
const OPTIONAL_ASSIGNMENT_COLUMNS = ["updated_at"] as const;
const ASSIGNMENT_COLUMNS = [
  ...REQUIRED_ASSIGNMENT_COLUMNS,
  ...OPTIONAL_ASSIGNMENT_COLUMNS,
];
const MISSING_ASSIGNMENT_MESSAGE =
  "Reservation table assignment is not set up yet. Run the latest reservation migration.";
const RESOURCE_NOT_FOUND_MESSAGE =
  "We could not find that table. Refresh the floor and try again.";
const UNKNOWN_ASSIGNMENT_MESSAGE =
  "We could not assign this table. Please try another table.";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export function isInvalidUuidInput(error: any) {
  return (
    error?.code === "22P02" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("invalid input syntax for type uuid")
  );
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isMissingTable(error: any) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "").includes("does not exist")
  );
}

function isMissingColumn(error: any) {
  const message = String(error?.message || "");
  return (
    error?.code === "42703" ||
    (message.includes("column") &&
      (message.includes("does not exist") || message.includes("not found")))
  );
}

function missingColumnName(error: any) {
  const message = String(error?.message || "");
  return ASSIGNMENT_COLUMNS.find((column) => message.includes(column)) || null;
}

function logDbFailure(
  operation: string,
  context: Record<string, any>,
  error: any,
) {
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

async function preflightAssignmentSchema(context: Record<string, any>) {
  const required = new Set<string>(REQUIRED_ASSIGNMENT_COLUMNS);

  const informationSchema = await (supabaseAdmin as any)
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "location_reservations")
    .in("column_name", ASSIGNMENT_COLUMNS);

  if (!informationSchema.error && Array.isArray(informationSchema.data)) {
    for (const row of informationSchema.data)
      required.delete(clean(row.column_name));
    if (required.size > 0) throw new Error(MISSING_ASSIGNMENT_MESSAGE);
    return {
      hasUpdatedAt: informationSchema.data.some(
        (row: any) => clean(row.column_name) === "updated_at",
      ),
    };
  }

  if (informationSchema.error)
    logDbFailure(
      "preflight_assignment_information_schema",
      context,
      informationSchema.error,
    );

  const testSelect = await supabaseAdmin
    .from("location_reservations")
    .select(
      "id,bookable_item_id,bookable_item_name,bookable_item_type,updated_at",
    )
    .limit(1);

  if (!testSelect.error) return { hasUpdatedAt: true };

  logDbFailure("preflight_assignment_test_select", context, testSelect.error);
  if (isMissingColumn(testSelect.error)) {
    const missing = missingColumnName(testSelect.error);
    if (missing === "updated_at") {
      const requiredOnly = await supabaseAdmin
        .from("location_reservations")
        .select("id,bookable_item_id,bookable_item_name,bookable_item_type")
        .limit(1);
      if (!requiredOnly.error) return { hasUpdatedAt: false };
      logDbFailure(
        "preflight_assignment_required_select",
        context,
        requiredOnly.error,
      );
      if (isMissingColumn(requiredOnly.error))
        throw new Error(MISSING_ASSIGNMENT_MESSAGE);
      throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
    }
    throw new Error(MISSING_ASSIGNMENT_MESSAGE);
  }
  throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
}

function minutes(value: unknown) {
  const [hours, mins] = String(value || "00:00")
    .split(":")
    .map((part) => Number(part));
  return (
    (Number.isFinite(hours) ? hours : 0) * 60 +
    (Number.isFinite(mins) ? mins : 0)
  );
}

function overlaps(
  startA: unknown,
  durationA: unknown,
  startB: unknown,
  durationB: unknown,
) {
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

export function normalizeResource(
  resource: any,
  source: typeof LAYOUT_TABLE | typeof BOOKABLE_TABLE,
): AssignableResource {
  const label =
    clean(resource.item_name) ||
    clean(resource.name) ||
    clean(resource.label) ||
    null;
  const capacity =
    source === LAYOUT_TABLE
      ? numberOrNull(resource.capacity)
      : numberOrNull(
          resource.capacity_max ?? resource.capacity_min ?? resource.capacity,
        );
  return {
    id: clean(resource.id) || null,
    source,
    label,
    type: clean(resource.item_type || resource.type) || null,
    capacity,
  };
}

function manualLabelResource(
  resourceId: string | null,
  label: string,
  type: string | null,
  capacity: number | null,
): AssignableResource {
  return {
    id: resourceId,
    source: "manual_label",
    label,
    type: type || "table",
    capacity,
  };
}

async function findResource(
  resourceId: string,
  locationId: string,
  source: string | null,
  context: Record<string, any>,
) {
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
      if (!isMissingTable(layout.error) && !isMissingColumn(layout.error))
        throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
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
      if (!isMissingTable(bookable.error) && !isMissingColumn(bookable.error))
        throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
    }
    if (bookable.data) return normalizeResource(bookable.data, BOOKABLE_TABLE);
  }

  return null;
}

async function validateAssignment(
  reservation: any,
  resource: AssignableResource,
  reservationId: string,
  locationId: string,
  context: Record<string, any>,
) {
  if (
    resource.capacity !== null &&
    Number.isFinite(resource.capacity) &&
    resource.capacity > 0 &&
    Number(reservation.party_size || 1) > resource.capacity
  ) {
    return "This table does not fit this party size.";
  }

  const active = await supabaseAdmin
    .from("location_reservations")
    .select(
      "id,status,reservation_date,reservation_time,duration_minutes,turn_time_minutes,bookable_item_id,bookable_item_name,bookable_item_type",
    )
    .eq("location_id", locationId)
    .eq("reservation_date", reservation.reservation_date)
    .neq("id", reservationId)
    .in("status", ACTIVE_STATUSES);
  if (active.error) {
    logDbFailure("validate_assignment_conflicts", context, active.error);
    if (isMissingColumn(active.error))
      throw new Error(MISSING_ASSIGNMENT_MESSAGE);
    throw new Error(UNKNOWN_ASSIGNMENT_MESSAGE);
  }

  const conflict = (active.data || []).some((entry: any) =>
    reservationConflictsWithResource(reservation, entry, resource),
  );
  return conflict
    ? "That table is already unavailable for this reservation time."
    : null;
}

export function shouldPersistBookableItemId(resource: AssignableResource) {
  return resource.source === BOOKABLE_TABLE && isUuid(resource.id);
}

export function reservationConflictsWithResource(
  requestedReservation: any,
  existingReservation: any,
  resource: AssignableResource,
) {
  const safeResourceId = shouldPersistBookableItemId(resource)
    ? resource.id
    : null;
  const requestedLabel = normalizeLabel(resource.label);
  const sameResource =
    Boolean(safeResourceId) &&
    existingReservation.bookable_item_id === safeResourceId;
  const sameLabel =
    Boolean(requestedLabel) &&
    [existingReservation.bookable_item_name]
      .map(normalizeLabel)
      .some((label) => label === requestedLabel);

  if (!sameResource && !sameLabel) return false;

  return overlaps(
    requestedReservation.reservation_time,
    requestedReservation.duration_minutes ||
      requestedReservation.turn_time_minutes ||
      90,
    existingReservation.reservation_time,
    existingReservation.duration_minutes ||
      existingReservation.turn_time_minutes ||
      90,
  );
}

export function buildAssignmentPayload(resource: AssignableResource, includeUpdatedAt: boolean) {
  const payload: Record<string, any> = {
    bookable_item_id: shouldPersistBookableItemId(resource) ? resource.id : null,
    bookable_item_name: clean(resource.label) || "Selected table",
    bookable_item_type: resource.type || "table",
  };
  if (includeUpdatedAt) payload.updated_at = new Date().toISOString();
  return payload;
}

async function updateReservationAssignment(
  reservationId: string,
  locationId: string,
  resource: AssignableResource,
  context: Record<string, any>,
  includeUpdatedAt: boolean,
) {
  const payload = buildAssignmentPayload(resource, includeUpdatedAt);
  let lastUpdateFailure: any = null;

  const makeUpdateError = () => {
    const error = new Error(UNKNOWN_ASSIGNMENT_MESSAGE) as Error & { code?: string; debugId?: string; updateFailure?: any };
    error.code = "assignment_update_failed";
    error.debugId = context.debugId;
    error.updateFailure = lastUpdateFailure;
    return error;
  };

  const runUpdate = async (
    nextPayload: Record<string, any>,
    operation: string,
  ) => {
    const update = await supabaseAdmin
      .from("location_reservations")
      .update(nextPayload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .select("*")
      .single();
    if (update.error) {
      lastUpdateFailure = { error: update.error, operation, payload: nextPayload };
      console.error("RESERVE_ASSIGN_RESOURCE_UPDATE_FAILED", {
        debugId: context.debugId,
        operation,
        reservationId,
        locationId,
        bodyLocationId: context.bodyLocationId,
        adminLocationId: context.adminLocationId,
        reservationLocationId: context.reservationLocationId,
        reservationType: context.reservationType,
        rawResourceId: resource.id,
        safeBookableItemId: shouldPersistBookableItemId(resource) ? resource.id : null,
        resourceLabel: resource.label,
        resourceType: resource.type,
        payload: nextPayload,
        code: update.error?.code,
        message: update.error?.message,
        details: update.error?.details,
      });
      logDbFailure(
        operation,
        { ...context, payloadColumns: Object.keys(nextPayload) },
        update.error,
      );
    }
    return update;
  };

  const update = await runUpdate(payload, "update_reservation_assignment");
  if (!update.error) return update.data;

  if (isInvalidUuidInput(update.error) && payload.bookable_item_id !== null) {
    const retryPayload = { ...payload, bookable_item_id: null };
    const retry = await runUpdate(
      retryPayload,
      "update_reservation_assignment_without_invalid_uuid",
    );
    if (!retry.error) return retry.data;
    if (isMissingColumn(retry.error))
      throw new Error(MISSING_ASSIGNMENT_MESSAGE);
    throw makeUpdateError();
  }

  if (
    includeUpdatedAt &&
    isMissingColumn(update.error) &&
    missingColumnName(update.error) === "updated_at"
  ) {
    const { updated_at: _updatedAt, ...withoutUpdatedAt } = payload;
    const retry = await runUpdate(
      withoutUpdatedAt,
      "update_reservation_assignment_without_updated_at",
    );
    if (!retry.error) return retry.data;
    if (isMissingColumn(retry.error))
      throw new Error(MISSING_ASSIGNMENT_MESSAGE);
  }

  if (isMissingColumn(update.error))
    throw new Error(MISSING_ASSIGNMENT_MESSAGE);
  throw makeUpdateError();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminLocationApiWrite();
  if (auth.error) return auth.error;

  const body = await request.json();
  const reservationId = clean(body.reservation_id);
  const bodyLocationId = clean(body.location_id);
  const adminLocationId = clean(body.adminLocationId);
  let locationId = clean(body.adminLocationId || body.location_id);
  const resourceId = clean(body.resource_id) || null;
  const resourceSource =
    clean(body.resource_source || body.resource_table || body.source) || null;
  const resourceLabel =
    clean(body.resource_label) || clean(body.resource_name) || null;
  const resourceType = clean(body.resource_type) || null;
  const parsedCapacity = Number(body.resource_capacity);
  const resourceCapacity = Number.isFinite(parsedCapacity)
    ? parsedCapacity
    : null;
  const context: Record<string, any> = {
    reservationId,
    locationId,
    bodyLocationId,
    adminLocationId,
    resourceId,
    resourceLabel,
    resourceSource,
  };

  if (!reservationId)
    return NextResponse.json(
      {
        success: false,
        error: "Select a reservation before assigning a table.",
      },
      { status: 400 },
    );
  if (!locationId)
    return NextResponse.json(
      { success: false, error: "Missing location ID." },
      { status: 400 },
    );
  if (!resourceId && !resourceLabel)
    return NextResponse.json(
      { success: false, error: "Choose a valid table or space." },
      { status: 400 },
    );

  let schemaState = { hasUpdatedAt: true };
  try {
    schemaState = await preflightAssignmentSchema(context);
  } catch (error: any) {
    const message = clean(error?.message) || UNKNOWN_ASSIGNMENT_MESSAGE;
    const status = message === MISSING_ASSIGNMENT_MESSAGE ? 500 : 500;
    return NextResponse.json(
      {
        success: false,
        code:
          message === MISSING_ASSIGNMENT_MESSAGE
            ? "missing_assignment_columns"
            : undefined,
        error: message,
      },
      { status },
    );
  }

  const before = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .eq("id", reservationId)
    .maybeSingle();
  if (before.error) {
    logDbFailure("load_reservation_before_assignment", context, before.error);
    return NextResponse.json(
      { success: false, error: UNKNOWN_ASSIGNMENT_MESSAGE },
      { status: 500 },
    );
  }
  if (!before.data)
    return NextResponse.json(
      {
        success: false,
        error: "Select a valid reservation before assigning a table.",
      },
      { status: 404 },
    );

  const authoritativeLocationId = clean(before.data.location_id);
  const authoritativeLocationType = clean(before.data.location_type);
  if (!authoritativeLocationId)
    return NextResponse.json(
      { success: false, error: "Select a valid reservation before assigning a table." },
      { status: 404 },
    );
  locationId = authoritativeLocationId;
  context.locationId = authoritativeLocationId;
  context.reservationLocationId = authoritativeLocationId;
  context.reservationType = authoritativeLocationType;

  try {
    const foundResource = resourceId && isUuid(resourceId)
      ? await findResource(resourceId, authoritativeLocationId, resourceSource, context)
      : null;
    const fallbackLabel = resourceLabel || "Selected table";
    if (!foundResource && !resourceLabel && !resourceId)
      return NextResponse.json(
        { success: false, error: RESOURCE_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
    const resource = foundResource
      ? {
          ...foundResource,
          label: foundResource.label || fallbackLabel,
          type: foundResource.type || resourceType,
          capacity: foundResource.capacity ?? resourceCapacity,
        }
      : manualLabelResource(
          resourceId,
          fallbackLabel,
          resourceType,
          resourceCapacity,
        );

    const validationError = await validateAssignment(
      before.data,
      resource,
      reservationId,
      authoritativeLocationId,
      context,
    );
    if (validationError)
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 409 },
      );

    const debugId = crypto.randomUUID();
    const updatedReservation = await updateReservationAssignment(
      reservationId,
      authoritativeLocationId,
      resource,
      {
        ...context,
        debugId,
        resourceLabel: resource.label,
        resourceSource: resource.source,
      },
      schemaState.hasUpdatedAt,
    );

    await logAdminLocationAction({
      adminUser: auth.adminUser,
      locationId: authoritativeLocationId,
      actionType: "admin_reservation_assign_resource",
      targetType: "reservation",
      targetId: reservationId,
      beforeData: before.data,
      afterData: updatedReservation,
      metadata: {
        resourceId,
        resourceSource,
        resourceLabel: resource.label,
        resourceType: resource.type,
        resourceCapacity: resource.capacity,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      reservation: updatedReservation,
      resource: updatedReservation?.bookable_item_id || resourceId,
    });
  } catch (error: any) {
    const message = clean(error?.message) || UNKNOWN_ASSIGNMENT_MESSAGE;
    console.error("RESERVE_ASSIGN_RESOURCE_FAILED", { ...context, debugId: error?.debugId, code: error?.code, message });
    const status =
      message === MISSING_ASSIGNMENT_MESSAGE
        ? 500
        : message === RESOURCE_NOT_FOUND_MESSAGE
          ? 404
          : message.includes("unavailable") || message.includes("fit")
            ? 409
            : 500;
    const updateFailure = error?.updateFailure || null;
    const updateError = updateFailure?.error || null;
    const debug =
      error?.debugId && adminLocationId && updateFailure
        ? {
            operation: updateFailure.operation,
            code: updateError?.code,
            message: updateError?.message,
            details: updateError?.details,
            hint: updateError?.hint,
            payloadKeys: Object.keys(updateFailure.payload || {}),
            payloadPreview: {
              bookable_item_id: updateFailure.payload?.bookable_item_id,
              bookable_item_name: updateFailure.payload?.bookable_item_name,
              bookable_item_type: updateFailure.payload?.bookable_item_type,
            },
          }
        : undefined;
    return NextResponse.json(
      { success: false, code: error?.code, error: message, debugId: error?.debugId, ...(debug ? { debug } : {}) },
      { status },
    );
  }
}
