import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const allowedStatuses = [
  "pending",
  "confirmed",
  "checked_in",
  "arrived",
  "waitlisted",
  "declined",
  "cancelled",
  "completed",
  "no_show",
];

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: string) {
  const status = value.toLowerCase().trim();

  if (allowedStatuses.includes(status)) return status;

  return "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const reservationId = cleanString(body.reservation_id);
    const locationId = cleanString(body.location_id);
    const locationType = cleanString(body.location_type) || "restaurant";
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

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .update({
        status,
        checked_in_at: status === "checked_in" || status === "arrived" ? new Date().toISOString() : undefined,
        completed_at: status === "completed" ? new Date().toISOString() : undefined,
        cancelled_at: status === "cancelled" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}