import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminLocationApiWrite } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";

const allowedStatuses = [
  "pending",
  "confirmed",
  "arrived",
  "checked_in",
  "seated",
  "waitlisted",
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
    const adminLocationId = cleanString(body.adminLocationId || body.admin_location_id);
    if (adminLocationId) {
      const auth = await requireAdminLocationApiWrite();
      if (auth.error) return auth.error;
      body.__adminUser = auth.adminUser;
    }

    const locationId = adminLocationId || cleanString(body.location_id);
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

    const beforeResult = adminLocationId
      ? await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", locationId).maybeSingle()
      : null;

    const updatePayload: Record<string, string> = {
      status,
      updated_at: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    if (status === "arrived" || status === "checked_in") {
      updatePayload.arrived_at = now;
      updatePayload.checked_in_at = now;
    }
    if (status === "seated") updatePayload.seated_at = now;
    if (status === "completed") updatePayload.completed_at = now;
    if (status === "cancelled") {
      updatePayload.customer_cancelled_at = now;
      updatePayload.cancelled_at = now;
    }
    if (status === "no_show") updatePayload.no_show_at = now;

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

    if (adminLocationId) {
      await logAdminLocationAction({
        adminUser: body.__adminUser,
        locationId,
        actionType: status === "cancelled" ? "admin_reservation_cancel" : `admin_reservation_${status}`,
        targetType: "reservation",
        targetId: reservationId,
        beforeData: beforeResult?.data || null,
        afterData: data,
        metadata: { locationType },
        request,
      });
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