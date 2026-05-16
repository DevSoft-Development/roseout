import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getLocationName } from "@/lib/locationName";

const ACTIVE_STATUSES = ["pending", "confirmed", "arrived", "seated"];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLocationType(value: unknown) {
  const type = cleanString(value).toLowerCase();

  if (type === "activity" || type === "activities") return "activity";

  return "restaurant";
}

function dateKey(value: Date) {
  return value.toISOString().split("T")[0];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole([
    "superuser",
    "admin",
    "editor",
    "viewer",
  ]);

  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);

    const locationId = cleanString(searchParams.get("locationId"));
    const locationType = normalizeLocationType(searchParams.get("type"));
    const selectedDate = cleanString(searchParams.get("date")) || dateKey(new Date());

    let itemQuery = supabaseAdmin
      .from("location_bookable_items")
      .select(
        "id, location_id, location_type, item_name, item_type, capacity_min, capacity_max, max_concurrent, auto_confirm, is_active, layout_x, layout_y, layout_width, layout_height, layout_zone"
      )
      .order("layout_zone", { ascending: true })
      .order("layout_y", { ascending: true })
      .order("layout_x", { ascending: true })
      .order("item_name", { ascending: true });

    let reservationQuery = supabaseAdmin
      .from("location_reservations")
      .select("*")
      .eq("reservation_date", selectedDate)
      .in("status", ACTIVE_STATUSES)
      .order("reservation_time", { ascending: true });

    if (locationId) {
      itemQuery = itemQuery
        .eq("location_id", locationId)
        .eq("location_type", locationType);

      reservationQuery = reservationQuery
        .eq("location_id", locationId)
        .eq("location_type", locationType);
    }

    const [itemsResult, reservationsResult, locationsResult] =
      await Promise.all([
        itemQuery,
        reservationQuery,
        supabaseAdmin
          .from("locations")
          .select("id, location_type, name, restaurant_name, activity_name, city, state")
          .order("name", { ascending: true }),
      ]);

    if (itemsResult.error) {
      return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
    }

    if (reservationsResult.error) {
      return NextResponse.json(
        { error: reservationsResult.error.message },
        { status: 500 }
      );
    }

    if (locationsResult.error) {
      return NextResponse.json(
        { error: locationsResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      date: selectedDate,
      items: itemsResult.data || [],
      reservations: reservationsResult.data || [],
      locations: (locationsResult.data || []).map((item) => {
        const locationType =
          item.location_type === "restaurant" ? "restaurant" : "activity";

        return {
          id: item.id,
          type: locationType,
          name: getLocationName(
            item,
            locationType === "restaurant" ? "Restaurant" : "Activity",
          ),
          city: item.city || "",
          state: item.state || "",
        };
      }),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]);

  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const action = cleanString(body.action);

    if (action === "move_layout_item") {
      const id = cleanString(body.id);

      if (!id) {
        return NextResponse.json({ error: "Missing layout item id." }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("location_bookable_items")
        .update({
          layout_x: Number(body.layout_x || 0),
          layout_y: Number(body.layout_y || 0),
          layout_width: Math.max(1, Number(body.layout_width || 1)),
          layout_height: Math.max(1, Number(body.layout_height || 1)),
          layout_zone: cleanString(body.layout_zone) || "Main Area",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, item: data });
    }

    if (action === "update_reservation_status") {
      const reservationId = cleanString(body.reservation_id);
      const status = cleanString(body.status).toLowerCase();

      if (!reservationId) {
        return NextResponse.json(
          { error: "Missing reservation id." },
          { status: 400 }
        );
      }

      const allowedStatuses = [
        "pending",
        "confirmed",
        "arrived",
        "seated",
        "completed",
        "cancelled",
        "declined",
        "no_show",
      ];

      if (!allowedStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid reservation status." },
          { status: 400 }
        );
      }

      const updatePayload: Record<string, string> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "arrived") updatePayload.arrived_at = new Date().toISOString();
      if (status === "seated") updatePayload.seated_at = new Date().toISOString();
      if (status === "completed") {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update(updatePayload)
        .eq("id", reservationId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reservation: data });
    }

    if (action === "move_reservation") {
      const reservationId = cleanString(body.reservation_id);
      const itemId = cleanString(body.bookable_item_id);

      if (!reservationId || !itemId) {
        return NextResponse.json(
          { error: "Missing reservation or option id." },
          { status: 400 }
        );
      }

      const { data: item, error: itemError } = await supabaseAdmin
        .from("location_bookable_items")
        .select("id, item_name, item_type")
        .eq("id", itemId)
        .single();

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }

      const { data, error } = await supabaseAdmin
        .from("location_reservations")
        .update({
          bookable_item_id: item.id,
          bookable_item_name: item.item_name,
          bookable_item_type: item.item_type,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reservation: data });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}