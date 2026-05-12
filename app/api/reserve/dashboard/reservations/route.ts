import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type LocationKind = "restaurant" | "activity";

type ReservationRow = {
  id: string;
  location_id: string;
  location_type: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  reservation_date: string | null;
  reservation_time: string | null;
  party_size: number | null;
  status: string | null;
  special_request: string | null;
  bookable_item_name: string | null;
  bookable_item_type: string | null;
  created_at: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
};

type LocationSummary = {
  id: string;
  type: LocationKind;
  name: string;
  city: string | null;
  state: string | null;
  total: number;
  pending: number;
  confirmed: number;
  nextReservation: string | null;
};

type RestaurantLocation = {
  id: string;
  restaurant_name?: string | null;
  city?: string | null;
  state?: string | null;
};

type ActivityLocation = {
  id: string;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
};

function normalizeKind(value: string | null): LocationKind | "all" {
  const type = String(value || "all").toLowerCase();

  if (["restaurant", "restaurants"].includes(type)) return "restaurant";
  if (["activity", "activities"].includes(type)) return "activity";

  return "all";
}

function normalizeReservationKind(value: string | null): LocationKind {
  const type = String(value || "restaurant").toLowerCase();
  return ["activity", "activities"].includes(type) ? "activity" : "restaurant";
}

function reservationDateTime(reservation: ReservationRow) {
  if (!reservation.reservation_date) return null;
  return `${reservation.reservation_date}T${reservation.reservation_time || "00:00"}`;
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdminApiRole([
    "superuser",
    "admin",
    "editor",
    "viewer",
  ]);

  if (error) return error;

  const url = new URL(request.url);
  const kind = normalizeKind(url.searchParams.get("kind"));
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

  const { data: reservationsData, error: reservationsError } = await supabaseAdmin
    .from("location_reservations")
    .select("*")
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })
    .limit(500);

  if (reservationsError) {
    return NextResponse.json({ error: reservationsError.message }, { status: 500 });
  }

  const reservations = (reservationsData || []) as ReservationRow[];

  const [{ data: restaurants }, { data: activities }] = await Promise.all([
    supabaseAdmin.from("restaurants").select("id, restaurant_name, city, state"),
    supabaseAdmin.from("activities").select("id, activity_name, city, state"),
  ]);

  const locationMap = new Map<
    string,
    { id: string; type: LocationKind; name: string; city: string | null; state: string | null }
  >();

  ((restaurants || []) as RestaurantLocation[]).forEach((item) => {
    locationMap.set(`restaurant:${item.id}`, {
      id: item.id,
      type: "restaurant",
      name: item.restaurant_name || "Untitled restaurant",
      city: item.city || null,
      state: item.state || null,
    });
  });

  ((activities || []) as ActivityLocation[]).forEach((item) => {
    locationMap.set(`activity:${item.id}`, {
      id: item.id,
      type: "activity",
      name: item.activity_name || "Untitled activity",
      city: item.city || null,
      state: item.state || null,
    });
  });

  const decoratedReservations = reservations.map((reservation) => {
    const reservationKind = normalizeReservationKind(reservation.location_type);
    const location = locationMap.get(`${reservationKind}:${reservation.location_id}`);

    return {
      ...reservation,
      location_type: reservationKind,
      location_name: location?.name || "Unknown location",
      location_city: location?.city || null,
      location_state: location?.state || null,
    };
  });

  const locationSummaries = Array.from(locationMap.values()).map((location) => {
    const locationReservations = decoratedReservations.filter(
      (reservation) =>
        reservation.location_id === location.id && reservation.location_type === location.type
    );
    const nextReservation = locationReservations
      .map(reservationDateTime)
      .filter(Boolean)
      .sort()[0] || null;

    return {
      ...location,
      total: locationReservations.length,
      pending: locationReservations.filter((item) => item.status === "pending").length,
      confirmed: locationReservations.filter((item) => item.status === "confirmed").length,
      nextReservation,
    } satisfies LocationSummary;
  });

  const matchesSearch = (value: string | null | undefined) =>
    String(value || "").toLowerCase().includes(search);

  const filteredReservations = decoratedReservations.filter((reservation) => {
    const reservationKind = normalizeReservationKind(reservation.location_type);

    if (kind !== "all" && reservationKind !== kind) return false;
    if (!search) return true;

    return (
      matchesSearch(reservation.location_name) ||
      matchesSearch(reservation.customer_name) ||
      matchesSearch(reservation.customer_email) ||
      matchesSearch(reservation.customer_phone) ||
      matchesSearch(reservation.bookable_item_name)
    );
  });

  const filteredLocations = locationSummaries.filter((location) => {
    if (kind !== "all" && location.type !== kind) return false;
    if (!search) return true;

    return (
      matchesSearch(location.name) ||
      matchesSearch(location.city) ||
      matchesSearch(location.state)
    );
  });

  return NextResponse.json({
    reservations: filteredReservations,
    locations: filteredLocations,
  });
}
