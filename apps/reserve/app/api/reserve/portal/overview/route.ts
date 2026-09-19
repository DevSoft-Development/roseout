import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiRead } from "@/lib/admin/admin-access";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

const TIME_ZONE = "America/New_York";
const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "waiting",
  "arrived",
  "seated",
  "waitlisted",
]);
const COUNTABLE_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "waiting",
  "arrived",
  "seated",
  "completed",
  "no_show",
  "waitlisted",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function easternDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function shiftDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function partySize(reservation: any) {
  const value = Number(reservation?.party_size || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminLocationId = clean(searchParams.get("adminLocationId"));
    let locationId = adminLocationId || clean(searchParams.get("locationId"));

    if (!locationId) {
      return NextResponse.json({ error: "Missing location ID." }, { status: 400 });
    }

    if (adminLocationId) {
      const auth = await requireAdminLocationApiRead();
      if (auth.error) return auth.error;
    } else {
      const permission = await requireReservePermission(locationId, "viewDashboard");
      if (permission.error) return permission.error;
      locationId = getReserveCanonicalLocationId(permission.access, locationId);
    }

    const selectedDate =
      validDateKey(clean(searchParams.get("date"))) || easternDateKey();
    const trailingStart = shiftDateKey(selectedDate, -29);
    const futureEnd = shiftDateKey(selectedDate, 29);

    const [locationResult, reservationsResult] = await Promise.all([
      supabaseAdmin
        .from("locations")
        .select(
          "id,name,restaurant_name,activity_name,location_type,type,primary_category",
        )
        .eq("id", locationId)
        .maybeSingle(),
      supabaseAdmin
        .from("location_reservations")
        .select(
          "id,reservation_date,reservation_time,party_size,status,customer_name,reservable_item_name,reservable_item_type,location_id,location_type",
        )
        .eq("location_id", locationId)
        .gte("reservation_date", trailingStart)
        .lte("reservation_date", futureEnd)
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true })
        .limit(2000),
    ]);

    if (reservationsResult.error) {
      return NextResponse.json(
        { error: "We could not load reservation overview metrics." },
        { status: 500 },
      );
    }

    const reservations = reservationsResult.data || [];
    const selected = reservations.filter(
      (reservation: any) => reservation.reservation_date === selectedDate,
    );
    const trailing = reservations.filter(
      (reservation: any) =>
        reservation.reservation_date >= trailingStart &&
        reservation.reservation_date <= selectedDate,
    );
    const future = reservations.filter(
      (reservation: any) =>
        reservation.reservation_date >= selectedDate &&
        reservation.reservation_date <= futureEnd,
    );

    const selectedCountable = selected.filter((reservation: any) =>
      COUNTABLE_STATUSES.has(String(reservation.status || "").toLowerCase()),
    );
    const trailingCountable = trailing.filter((reservation: any) =>
      COUNTABLE_STATUSES.has(String(reservation.status || "").toLowerCase()),
    );
    const futureActive = future.filter((reservation: any) =>
      ACTIVE_STATUSES.has(String(reservation.status || "").toLowerCase()),
    );
    const completedOrNoShow = trailing.filter((reservation: any) =>
      ["completed", "no_show"].includes(
        String(reservation.status || "").toLowerCase(),
      ),
    );
    const noShows = completedOrNoShow.filter(
      (reservation: any) =>
        String(reservation.status || "").toLowerCase() === "no_show",
    );
    const cancellationBase = trailing.filter(
      (reservation: any) =>
        String(reservation.status || "").toLowerCase() !== "declined",
    );
    const cancellations = cancellationBase.filter(
      (reservation: any) =>
        String(reservation.status || "").toLowerCase() === "cancelled",
    );

    const location = locationResult.data;
    const locationName =
      location?.name ||
      location?.restaurant_name ||
      location?.activity_name ||
      "TheOutHaven location";
    const locationType =
      clean(location?.location_type || location?.type || location?.primary_category) ||
      "restaurant";

    return NextResponse.json({
      success: true,
      locationId,
      locationName,
      locationType,
      selectedDate,
      range: { trailingStart, futureEnd },
      metrics: {
        reservations: selectedCountable.length,
        guests: selectedCountable.reduce(
          (sum: number, reservation: any) => sum + partySize(reservation),
          0,
        ),
        needsAction: selected.filter((reservation: any) =>
          ["pending", "confirmed"].includes(
            String(reservation.status || "").toLowerCase(),
          ),
        ).length,
        seatedNow: selected.filter(
          (reservation: any) =>
            String(reservation.status || "").toLowerCase() === "seated",
        ).length,
        trailingReservations: trailingCountable.length,
        trailingGuests: trailingCountable.reduce(
          (sum: number, reservation: any) => sum + partySize(reservation),
          0,
        ),
        noShowRate: percent(noShows.length, completedOrNoShow.length),
        cancellationRate: percent(cancellations.length, cancellationBase.length),
        futureReservations: futureActive.length,
        futureGuests: futureActive.reduce(
          (sum: number, reservation: any) => sum + partySize(reservation),
          0,
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We could not load the reservation overview.",
      },
      { status: 500 },
    );
  }
}
