import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const allowedStatuses = [
  "pending",
  "confirmed",
  "arrived",
  "declined",
  "cancelled",
  "completed",
  "no_show",
];

type ReservationUpdatePayload = {
  status: string;
  updated_at: string;
  arrived_at?: string;
  completed_at?: string;
  customer_cancelled_at?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(value: string) {
  const type = value.toLowerCase().trim();

  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";

  return "restaurant";
}

function normalizeStatus(value: string) {
  const status = value.toLowerCase().trim();
  return allowedStatuses.includes(status) ? status : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function dateKey(value: Date) {
  return value.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = cleanString(searchParams.get("locationId"));
    const locationType = normalizeType(cleanString(searchParams.get("type")));
    const status = normalizeStatus(cleanString(searchParams.get("status")));
    const filter = cleanString(searchParams.get("filter")).toLowerCase();
    const today = dateKey(new Date());

    let query = supabaseAdmin
      .from("location_reservations")
      .select("*")
      .order("reservation_date", { ascending: filter === "upcoming" })
      .order("reservation_time", { ascending: filter === "upcoming" })
      .limit(200);

    if (locationId) {
      query = query.eq("location_id", locationId).eq("location_type", locationType);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (filter === "today") {
      query = query.eq("reservation_date", today);
    }

    if (filter === "upcoming") {
      query = query.gte("reservation_date", today);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reservations: data || [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const reservationId = cleanString(body.reservation_id);
    const locationId = cleanString(body.location_id);
    const locationType = normalizeType(
      cleanString(body.location_type) || "restaurant"
    );
    const status = normalizeStatus(cleanString(body.status));

    if (!reservationId) {
      return NextResponse.json(
        { error: "Missing reservation ID." },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json(
        { error: "Missing location ID." },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: "Invalid reservation status." },
        { status: 400 }
      );
    }

    const updatePayload: ReservationUpdatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "arrived") {
      updatePayload.arrived_at = new Date().toISOString();
    }

    if (status === "completed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    if (status === "cancelled") {
      updatePayload.customer_cancelled_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update(updatePayload)
      .eq("id", reservationId)
      .eq("location_id", locationId)
      .eq("location_type", locationType)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reservation: data,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
