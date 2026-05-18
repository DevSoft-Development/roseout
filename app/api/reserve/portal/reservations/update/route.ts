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

    const updatePayload: Record<string, string> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "arrived") updatePayload.arrived_at = new Date().toISOString();
    if (status === "completed") updatePayload.completed_at = new Date().toISOString();
    if (status === "cancelled") updatePayload.customer_cancelled_at = new Date().toISOString();

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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}