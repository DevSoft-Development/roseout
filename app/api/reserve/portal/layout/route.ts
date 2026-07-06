import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  requireAdminLocationApiRead,
  requireAdminLocationApiWrite,
} from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { getLocationName } from "@/lib/locationName";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  ACTIVE_RESERVATION_STATUSES,
  LAYOUT_ITEM_STATUSES,
  cleanString,
  logStaffActivity,
  normalizeReservationType,
  rangesOverlap,
  sendReservationSms,
} from "@/lib/reservationOperations";

const LEGACY_TABLE = "location_bookable_items";
const NEUTRAL_TABLE = "layout_items";

function dateKey(value: Date) {
  return value.toISOString().split("T")[0];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function isMissingTable(error: any) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "").includes("does not exist")
  );
}

function normalizeStatus(value: unknown) {
  const status = cleanString(value).toLowerCase();
  if (["available", "unavailable", "hidden"].includes(status)) return status;
  if (LAYOUT_ITEM_STATUSES.includes(status as any)) return status;
  return "available";
}

function isMissingColumn(error: any) {
  return (
    error?.code === "42703" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("column")
  );
}

function withoutOptionalFields<T extends Record<string, any>>(payload: T) {
  const copy = { ...payload };
  delete copy.duration_minutes;
  delete copy.default_duration_minutes;
  delete copy.reservation_duration_minutes;
  delete copy.notes;
  return copy;
}

export function normalizeWaitlistContact<T extends Record<string, any>>(waitlist: T) {
  return {
    ...waitlist,
    contact_name: waitlist.contact_name || waitlist.customer_name || null,
    customer_name: waitlist.customer_name || waitlist.contact_name || null,
    contact_phone: waitlist.contact_phone || waitlist.customer_phone || null,
    customer_phone: waitlist.customer_phone || waitlist.contact_phone || null,
    contact_email: waitlist.contact_email || waitlist.customer_email || null,
    customer_email: waitlist.customer_email || waitlist.contact_email || null,
    notes: waitlist.notes || waitlist.special_request || waitlist.special_requests || null,
  };
}

function currentTimeKey(date = new Date()) {
  return date.toISOString().slice(11, 16);
}

async function fetchReservationById(id: unknown) {
  const reservationId = cleanString(id);
  if (!reservationId) return null;
  const { data, error } = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function createWaitlistReservation(waitlist: Record<string, any>, body: Record<string, any>) {
  const normalizedWaitlist = normalizeWaitlistContact(waitlist);
  const existingReservation = await fetchReservationById(
    normalizedWaitlist.converted_reservation_id,
  );
  if (existingReservation) return existingReservation;

  const now = new Date();
  const guestName = normalizedWaitlist.contact_name || normalizedWaitlist.customer_name || "Waitlist Guest";
  const guestPhone = normalizedWaitlist.contact_phone || normalizedWaitlist.customer_phone || null;
  const guestEmail = normalizedWaitlist.contact_email || normalizedWaitlist.customer_email || null;
  const guestNotes = normalizedWaitlist.notes || normalizedWaitlist.special_request || normalizedWaitlist.special_requests || "Converted from waitlist";
  const payload = {
    location_id: normalizedWaitlist.location_id,
    location_type: normalizeReservationType(
      cleanString(body.location_type) || cleanString(body.type) || "restaurant",
    ),
    customer_name: guestName,
    customer_email: guestEmail,
    customer_phone: guestPhone,
    party_size: Math.max(Number(normalizedWaitlist.party_size || 2), 1),
    reservation_date: normalizedWaitlist.reservation_date || dateKey(now),
    reservation_time: String(normalizedWaitlist.reservation_time || currentTimeKey(now)).slice(0, 5),
    status: "checked_in",
    source: "waitlist",
    special_request: guestNotes,
    special_requests: guestNotes,
    notes: guestNotes,
    duration_minutes: Number(body.duration_minutes || 90),
    checked_in_at: now.toISOString(),
    arrived_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  let insertResult = await supabaseAdmin
    .from("location_reservations")
    .insert(payload)
    .select("*")
    .single();
  if (insertResult.error && isMissingColumn(insertResult.error)) {
    const fallbackPayload = withoutOptionalFields(payload);
    insertResult = await supabaseAdmin
      .from("location_reservations")
      .insert(fallbackPayload)
      .select("*")
      .single();
  }
  if (insertResult.error) throw new Error(insertResult.error.message);
  return insertResult.data;
}

export function toLegacyItem(item: any) {
  return {
    id: item.id,
    location_id: item.location_id,
    location_type: normalizeReservationType(
      item.location_type ||
        item.source_table ||
        item.resource_table ||
        "restaurant",
    ),
    item_name: item.item_name || item.name || item.label,
    item_type: item.item_type || item.type,
    capacity_min: Number(item.capacity_min || item.capacity || 1),
    capacity_max: Number(item.capacity_max || item.capacity || 4),
    max_concurrent: Number(item.max_concurrent || 1),
    auto_confirm: item.auto_confirm !== false,
    is_active: item.is_active !== false,
    layout_x: Number(item.layout_x || item.x_position || 0),
    layout_y: Number(item.layout_y || item.y_position || 0),
    layout_width: Number(item.layout_width || item.width || 1),
    layout_height: Number(item.layout_height || item.height || 1),
    layout_zone: item.layout_zone || item.item_type || "Main Area",
    rotation: Number(item.rotation || 0),
    status: item.status || "available",
    source_table:
      item.source_table ||
      item.location_type ||
      item.resource_table ||
      "locations",
    resource_source:
      item.resource_source ||
      item.resource_table ||
      item.source ||
      (item.location_type ? LEGACY_TABLE : NEUTRAL_TABLE),
    resource_table:
      item.resource_table ||
      item.resource_source ||
      item.source ||
      (item.location_type ? LEGACY_TABLE : NEUTRAL_TABLE),
    source_id: item.source_id || null,
    sort_order: Number(item.sort_order || 0),
    duration_minutes: Number(
      item.duration_minutes ||
        item.default_duration_minutes ||
        item.reservation_duration_minutes ||
        item.turn_time_minutes ||
        90,
    ),
    default_duration_minutes: Number(
      item.default_duration_minutes ||
        item.duration_minutes ||
        item.reservation_duration_minutes ||
        90,
    ),
    reservation_duration_minutes: Number(
      item.reservation_duration_minutes ||
        item.duration_minutes ||
        item.default_duration_minutes ||
        90,
    ),
    notes: item.notes || item.description || item.internal_notes || null,
  };
}

export function mergeLayoutResources(
  layoutItems: any[] = [],
  legacyItems: any[] = [],
) {
  const merged = new Map<string, any>();
  const keyFor = (item: any) => {
    const name = String(item.item_name || item.name || item.label || "")
      .trim()
      .toLowerCase();
    const type = String(item.item_type || item.type || "")
      .trim()
      .toLowerCase();
    const capacity = Number(
      item.capacity_max || item.capacity || item.capacity_min || 0,
    );
    return name
      ? `${name}|${type}|${capacity}`
      : String(item.id || `${type}|${capacity}`);
  };
  for (const item of legacyItems.map(toLegacyItem))
    merged.set(keyFor(item), {
      ...item,
      resource_source: LEGACY_TABLE,
      resource_table: LEGACY_TABLE,
    });
  for (const item of layoutItems.map(toLegacyItem))
    merged.set(keyFor(item), {
      ...item,
      resource_source: NEUTRAL_TABLE,
      resource_table: NEUTRAL_TABLE,
    });
  return Array.from(merged.values()).sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      Number(a.layout_y || 0) - Number(b.layout_y || 0) ||
      Number(a.layout_x || 0) - Number(b.layout_x || 0) ||
      String(a.item_name || "").localeCompare(String(b.item_name || "")),
  );
}

async function selectLayoutItems(locationId: string, locationType: string) {
  let query = supabaseAdmin
    .from(NEUTRAL_TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("y_position", { ascending: true })
    .order("x_position", { ascending: true });

  if (locationId) query = query.eq("location_id", locationId);

  const result = await query;
  if (result.error && !isMissingTable(result.error))
    return { error: result.error, data: [], source: NEUTRAL_TABLE };

  let legacyQuery = supabaseAdmin
    .from(LEGACY_TABLE)
    .select("*")
    .order("layout_zone", { ascending: true })
    .order("layout_y", { ascending: true })
    .order("layout_x", { ascending: true })
    .order("item_name", { ascending: true });

  if (locationId) legacyQuery = legacyQuery.eq("location_id", locationId);

  const legacy = await legacyQuery;
  if (legacy.error && !isMissingTable(legacy.error))
    return { error: legacy.error, data: [], source: LEGACY_TABLE };

  return {
    data: mergeLayoutResources(result.data || [], legacy.data || []),
    source: result.error ? LEGACY_TABLE : "merged",
  };
}

async function updateLayoutItem(id: string, payload: any) {
  const neutralPayload = {
    item_type: payload.item_type,
    item_name: payload.item_name,
    item_number: payload.item_number,
    capacity: payload.capacity,
    x_position: payload.layout_x,
    y_position: payload.layout_y,
    width: payload.layout_width,
    height: payload.layout_height,
    rotation: payload.rotation,
    status: payload.status,
    is_active: payload.is_active,
    sort_order: payload.sort_order,
    duration_minutes: payload.duration_minutes,
    default_duration_minutes: payload.default_duration_minutes,
    reservation_duration_minutes: payload.reservation_duration_minutes,
    notes: payload.notes,
    updated_at: new Date().toISOString(),
  };

  let neutral = await supabaseAdmin
    .from(NEUTRAL_TABLE)
    .update(neutralPayload)
    .eq("id", id)
    .select("*")
    .single();

  if (neutral.error && isMissingColumn(neutral.error)) {
    neutral = await supabaseAdmin
      .from(NEUTRAL_TABLE)
      .update(withoutOptionalFields(neutralPayload))
      .eq("id", id)
      .select("*")
      .single();
  }

  if (!neutral.error) return toLegacyItem(neutral.data);
  if (!isMissingTable(neutral.error)) throw new Error(neutral.error.message);

  const legacy = await supabaseAdmin
    .from(LEGACY_TABLE)
    .update({
      item_type: payload.item_type,
      item_name: payload.item_name,
      capacity_min: payload.capacity,
      capacity_max: payload.capacity,
      layout_x: payload.layout_x,
      layout_y: payload.layout_y,
      layout_width: payload.layout_width,
      layout_height: payload.layout_height,
      is_active: payload.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (legacy.error) throw new Error(legacy.error.message);
  return toLegacyItem(legacy.data);
}

async function createLayoutItem(body: any) {
  const locationType = normalizeReservationType(
    body.location_type || body.source_table,
  );
  const payload = {
    location_id: cleanString(body.location_id),
    source_table: locationType,
    source_id: cleanString(body.source_id) || null,
    item_type: cleanString(body.item_type) || "table",
    item_name: cleanString(body.item_name) || "New layout item",
    item_number: cleanString(body.item_number) || null,
    capacity: Math.max(1, Number(body.capacity || 2)),
    x_position: Number(body.layout_x || body.x_position || 0),
    y_position: Number(body.layout_y || body.y_position || 0),
    width: Math.max(1, Number(body.layout_width || body.width || 1)),
    height: Math.max(1, Number(body.layout_height || body.height || 1)),
    rotation: Number(body.rotation || 0),
    status: normalizeStatus(body.status),
    is_active: body.is_active !== false,
    sort_order: Number(body.sort_order || 0),
    duration_minutes: Number(
      body.duration_minutes ||
        body.default_duration_minutes ||
        body.reservation_duration_minutes ||
        90,
    ),
    default_duration_minutes: Number(
      body.default_duration_minutes ||
        body.duration_minutes ||
        body.reservation_duration_minutes ||
        90,
    ),
    reservation_duration_minutes: Number(
      body.reservation_duration_minutes ||
        body.duration_minutes ||
        body.default_duration_minutes ||
        90,
    ),
    notes: cleanString(body.notes) || null,
  };

  let neutral = await supabaseAdmin
    .from(NEUTRAL_TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (neutral.error && isMissingColumn(neutral.error)) {
    neutral = await supabaseAdmin
      .from(NEUTRAL_TABLE)
      .insert(withoutOptionalFields(payload))
      .select("*")
      .single();
  }
  if (!neutral.error) return toLegacyItem(neutral.data);
  if (!isMissingTable(neutral.error)) throw new Error(neutral.error.message);

  const legacy = await supabaseAdmin
    .from(LEGACY_TABLE)
    .insert({
      location_id: payload.location_id,
      location_type: locationType,
      item_type: payload.item_type,
      item_name: payload.item_name,
      capacity_min: payload.capacity,
      capacity_max: payload.capacity,
      max_concurrent: 1,
      auto_confirm: true,
      is_active: payload.is_active,
      layout_x: payload.x_position,
      layout_y: payload.y_position,
      layout_width: payload.width,
      layout_height: payload.height,
      layout_zone: payload.item_type,
    })
    .select("*")
    .single();

  if (legacy.error) throw new Error(legacy.error.message);
  return toLegacyItem(legacy.data);
}

async function deleteLayoutItem(id: string) {
  const neutral = await supabaseAdmin.from(NEUTRAL_TABLE).delete().eq("id", id);
  if (!neutral.error) return;
  if (!isMissingTable(neutral.error)) throw new Error(neutral.error.message);

  const legacy = await supabaseAdmin
    .from(LEGACY_TABLE)
    .update({ is_active: false })
    .eq("id", id);
  if (legacy.error) throw new Error(legacy.error.message);
}

async function assertNoOverlap(reservationId: string, itemId: string) {
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("location_reservations")
    .select(
      "id, location_id, location_type, reservation_date, reservation_time, duration_minutes, turn_time_minutes, party_size",
    )
    .eq("id", reservationId)
    .single();

  if (reservationError) throw new Error(reservationError.message);

  const { data: item, error: itemError } = await supabaseAdmin
    .from(NEUTRAL_TABLE)
    .select("id, capacity, status, is_active, item_name, item_type")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError && !isMissingTable(itemError))
    throw new Error(itemError.message);

  if (item) {
    if (
      item.is_active === false ||
      ["blocked", "maintenance"].includes(item.status)
    ) {
      throw new Error("This layout item is blocked or under maintenance.");
    }
    if (Number(reservation.party_size || 1) > Number(item.capacity || 1)) {
      throw new Error("This layout item does not fit the party size.");
    }
  }

  const { data: active, error: activeError } = await supabaseAdmin
    .from("location_reservations")
    .select("id, reservation_time, duration_minutes, turn_time_minutes")
    .eq("location_id", reservation.location_id)
    .eq("location_type", reservation.location_type)
    .eq("bookable_item_id", itemId)
    .eq("reservation_date", reservation.reservation_date)
    .neq("id", reservationId)
    .in("status", ACTIVE_RESERVATION_STATUSES);

  if (activeError) throw new Error(activeError.message);

  const reservationDuration = Number(
    reservation.duration_minutes || reservation.turn_time_minutes || 90,
  );
  const conflicts = (active || []).some((entry: any) =>
    rangesOverlap(
      String(reservation.reservation_time || "00:00"),
      reservationDuration,
      String(entry.reservation_time || "00:00"),
      Number(entry.duration_minutes || entry.turn_time_minutes || 90),
    ),
  );

  if (conflicts) {
    throw new Error("This layout item already has an overlapping reservation.");
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reservationLayouts);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const adminLocationId = cleanString(searchParams.get("adminLocationId"));
    let adminUser: any = auth.adminUser;
    if (adminLocationId) {
      const adminAuth = await requireAdminLocationApiRead();
      if (adminAuth.error) return adminAuth.error;
      adminUser = adminAuth.adminUser;
    }
    const locationId =
      adminLocationId || cleanString(searchParams.get("locationId"));
    const locationType = normalizeReservationType(searchParams.get("type"));
    const selectedDate =
      cleanString(searchParams.get("date")) || dateKey(new Date());
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") || 100)),
    );
    const q = cleanString(searchParams.get("q")).toLowerCase();

    let reservationQuery = supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("reservation_date", selectedDate)
      .in("status", ["pending", ...ACTIVE_RESERVATION_STATUSES])
      .order("reservation_time", { ascending: true });

    let waitlistQuery = supabaseAdmin
      .from("reservation_waitlist")
      .select("*")
      .in("status", ["waiting", "notified"])
      .order("created_at", { ascending: true });

    if (locationId) {
      reservationQuery = reservationQuery
        .eq("location_id", locationId)
        .eq("location_type", locationType);
      waitlistQuery = waitlistQuery.eq("location_id", locationId);
    }

    const [itemsResult, reservationsResult, locationsResult, waitlistResult] =
      await Promise.all([
        selectLayoutItems(locationId, locationType),
        reservationQuery,
        supabaseAdmin
          .from("locations")
          .select(
            "id, location_type, name, restaurant_name, activity_name, city, state, address, cuisine, source_table, rating",
            { count: "exact" },
          )
          .order("name", { ascending: true })
          .range(
            Math.max(0, Number(searchParams.get("page") || 1) - 1) *
              Math.min(
                100,
                Math.max(1, Number(searchParams.get("pageSize") || 100)),
              ),
            Math.max(0, Number(searchParams.get("page") || 1) - 1) *
              Math.min(
                100,
                Math.max(1, Number(searchParams.get("pageSize") || 100)),
              ) +
              Math.min(
                100,
                Math.max(1, Number(searchParams.get("pageSize") || 100)),
              ) -
              1,
          ),
        waitlistQuery,
      ]);

    if (itemsResult.error)
      return NextResponse.json(
        { error: itemsResult.error.message },
        { status: 500 },
      );
    if (reservationsResult.error)
      return NextResponse.json(
        { error: reservationsResult.error.message },
        { status: 500 },
      );
    if (locationsResult.error)
      return NextResponse.json(
        { error: locationsResult.error.message },
        { status: 500 },
      );

    if (adminLocationId) {
      await logAdminLocationAction({
        adminUser,
        locationId,
        actionType: "admin_location_layout_view",
        targetType: "layout_items",
        metadata: { selectedDate },
        request,
      });
    }

    return NextResponse.json({
      date: selectedDate,
      items: itemsResult.data || [],
      itemSource: itemsResult.source,
      reservations: reservationsResult.data || [],
      waitlist:
        waitlistResult.error && !isMissingTable(waitlistResult.error)
          ? []
          : waitlistResult.data || [],
      locationsTotal:
        locationsResult.count || (locationsResult.data || []).length,
      locationsPage: page,
      locationsPageSize: pageSize,
      locations: (locationsResult.data || [])
        .filter((item: any) => {
          if (!q) return true;
          const hay = [
            item.name,
            item.restaurant_name,
            item.activity_name,
            item.address,
            item.city,
            item.state,
            item.source_table,
            item.id,
            item.cuisine,
            item.category,
            item.primary_category,
            item.phone,
            item.google_place_id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((item) => {
          const type =
            item.location_type === "restaurant" ? "restaurant" : "activity";
          return {
            id: item.id,
            type,
            name: getLocationName(
              item,
              type === "restaurant" ? "Restaurant" : "Activity",
            ),
            city: item.city || "",
            state: item.state || "",
          };
        }),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.reservationLayouts);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const adminLocationId = cleanString(
      body.adminLocationId || body.admin_location_id,
    );
    let adminUser: any = auth.adminUser;
    if (adminLocationId) {
      const adminAuth = await requireAdminLocationApiWrite();
      if (adminAuth.error) return adminAuth.error;
      adminUser = adminAuth.adminUser;
      body.location_id = adminLocationId;
    }
    const action = cleanString(body.action);

    if (["create_layout_item", "duplicate_layout_item"].includes(action)) {
      const source = body.source_item || body;
      const item = await createLayoutItem({
        ...source,
        item_name:
          action === "duplicate_layout_item"
            ? `${source.item_name || "Layout item"} Copy`
            : source.item_name,
        layout_x:
          Number(source.layout_x || source.x_position || 0) +
          (action === "duplicate_layout_item" ? 1 : 0),
        layout_y:
          Number(source.layout_y || source.y_position || 0) +
          (action === "duplicate_layout_item" ? 1 : 0),
      });
      await logStaffActivity({
        locationId: item.location_id,
        action,
        details: { itemId: item.id },
      });
      if (adminLocationId) {
        await logAdminLocationAction({
          adminUser,
          locationId: adminLocationId,
          actionType:
            action === "create_layout_item"
              ? "layout_resource_create"
              : "layout_resource_update",
          targetType: "layout_item",
          targetId: item.id,
          afterData: item,
          request,
        });
      }
      return NextResponse.json({ success: true, item });
    }

    if (action === "delete_layout_item") {
      const id = cleanString(body.id);
      if (!id)
        return NextResponse.json(
          { error: "Missing layout item id." },
          { status: 400 },
        );
      await deleteLayoutItem(id);
      await logStaffActivity({ action, details: { itemId: id } });
      if (adminLocationId) {
        await logAdminLocationAction({
          adminUser,
          locationId: adminLocationId,
          actionType: "layout_resource_delete",
          targetType: "layout_item",
          targetId: id,
          metadata: { softDelete: true },
          request,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (
      ["move_layout_item", "update_layout_item", "update_item_status"].includes(
        action,
      )
    ) {
      const id = cleanString(body.id);
      if (!id)
        return NextResponse.json(
          { error: "Missing layout item id." },
          { status: 400 },
        );
      const item = await updateLayoutItem(id, {
        item_type: cleanString(body.item_type) || "table",
        item_name: cleanString(body.item_name) || "Layout item",
        item_number: cleanString(body.item_number) || null,
        capacity: Math.max(1, Number(body.capacity || body.capacity_max || 2)),
        layout_x: Number(body.layout_x || 0),
        layout_y: Number(body.layout_y || 0),
        layout_width: Math.max(1, Number(body.layout_width || 1)),
        layout_height: Math.max(1, Number(body.layout_height || 1)),
        rotation: Number(body.rotation || 0),
        status: normalizeStatus(body.status),
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order || 0),
        duration_minutes: Number(
          body.duration_minutes ||
            body.default_duration_minutes ||
            body.reservation_duration_minutes ||
            90,
        ),
        default_duration_minutes: Number(
          body.default_duration_minutes ||
            body.duration_minutes ||
            body.reservation_duration_minutes ||
            90,
        ),
        reservation_duration_minutes: Number(
          body.reservation_duration_minutes ||
            body.duration_minutes ||
            body.default_duration_minutes ||
            90,
        ),
        notes: cleanString(body.notes) || null,
      });
      await logStaffActivity({
        locationId: item.location_id,
        action,
        details: { itemId: item.id },
      });
      if (adminLocationId) {
        await logAdminLocationAction({
          adminUser,
          locationId: adminLocationId,
          actionType:
            action === "update_item_status"
              ? "layout_resource_status_update"
              : "layout_resource_update",
          targetType: "layout_item",
          targetId: item.id,
          afterData: item,
          request,
        });
      }
      return NextResponse.json({ success: true, item });
    }

    if (action === "update_reservation_status") {
      const reservationId = cleanString(body.reservation_id);
      const status = cleanString(body.status).toLowerCase();
      const allowedStatuses = [
        "pending",
        "confirmed",
        "arrived",
        "seated",
        "occupied",
        "completed",
        "cancelled",
        "declined",
        "no_show",
      ];
      if (!reservationId)
        return NextResponse.json(
          { error: "Missing reservation id." },
          { status: 400 },
        );
      if (!allowedStatuses.includes(status))
        return NextResponse.json(
          { error: "Invalid reservation status." },
          { status: 400 },
        );

      const updatePayload: Record<string, string> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "arrived")
        updatePayload.arrived_at = new Date().toISOString();
      if (status === "seated" || status === "occupied")
        updatePayload.seated_at = new Date().toISOString();
      if (status === "completed")
        updatePayload.completed_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update(updatePayload)
        .eq("id", reservationId)
        .select("*")
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      await logStaffActivity({
        locationId: data.location_id,
        reservationId,
        action: `reservation_${status}`,
      });
      return NextResponse.json({ success: true, reservation: data });
    }

    if (action === "move_reservation") {
      const reservationId = cleanString(body.reservation_id);
      const itemId = cleanString(body.bookable_item_id);
      if (!reservationId || !itemId)
        return NextResponse.json(
          { error: "Missing reservation or layout item id." },
          { status: 400 },
        );
      await assertNoOverlap(reservationId, itemId);

      const items = await selectLayoutItems("", "restaurant");
      const item = (items.data || []).find(
        (candidate: any) => candidate.id === itemId,
      );
      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({
          bookable_item_id: itemId,
          bookable_item_name: item?.item_name || null,
          bookable_item_type: item?.item_type || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId)
        .select("*")
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      await logStaffActivity({
        locationId: data.location_id,
        reservationId,
        action,
        details: { itemId },
      });
      return NextResponse.json({ success: true, reservation: data });
    }

    if (action === "notify_waitlist") {
      const waitlistId = cleanString(body.waitlist_id);
      if (!waitlistId)
        return NextResponse.json(
          { error: "Missing waitlist id." },
          { status: 400 },
        );
      const { data: waitlist, error } = await supabaseAdmin
        .from("reservation_waitlist")
        .select("*")
        .eq("id", waitlistId)
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      const normalizedWaitlist = normalizeWaitlistContact(waitlist);
      const now = new Date().toISOString();
      const phone = normalizedWaitlist.contact_phone || normalizedWaitlist.customer_phone || null;
      await sendReservationSms({
        locationId: normalizedWaitlist.location_id,
        to: phone,
        messageType: "waitlist_ready",
        body: "TheOutHaven Reserve: A table is ready for you. Please check in with the host within 10 minutes.",
      });

      const reservation = await createWaitlistReservation(normalizedWaitlist, body);
      const { data: updatedWaitlist, error: updateError } = await supabaseAdmin
        .from("reservation_waitlist")
        .update({
          status: "booked",
          converted_reservation_id: reservation.id,
          converted_at: normalizedWaitlist.converted_at || now,
          notified_at: normalizedWaitlist.notified_at || now,
          expires_at: null,
        })
        .eq("id", waitlistId)
        .select("*")
        .single();
      if (updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 });

      return NextResponse.json({
        success: true,
        waitlist: normalizeWaitlistContact(updatedWaitlist),
        reservation,
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
