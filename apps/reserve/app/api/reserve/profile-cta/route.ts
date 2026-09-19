import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { hasInternalDemoAccess } from "@/lib/demo/internal-demo-access";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import { getInternalReservationHref } from "@/lib/reservation";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const locationId = String(searchParams.get("locationId") || "").trim();
  const routeType = String(searchParams.get("type") || "restaurant").toLowerCase();

  if (!locationId) {
    return NextResponse.json({ enabled: false }, { status: 400 });
  }

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,location_type,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_source,is_hidden,is_searchable,demo_key",
    )
    .eq("id", locationId)
    .maybeSingle();

  if (error || !location?.id) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const publicVisible = isPublicSearchVisible(location);
  const demoPreview =
    searchParams.get("demo") === "1" &&
    searchParams.get("fromDemoCenter") === "1" &&
    searchParams.get("adminLocationId") === String(location.id) &&
    location.demo_key === MIRROR_DEMO_KEY;

  if (!publicVisible) {
    if (!demoPreview || !(await hasInternalDemoAccess())) {
      return NextResponse.json({ enabled: false }, { status: 404 });
    }
  }

  const reservationSource = String(location.reservation_source || "external").toLowerCase();
  const hasInternalReservations = Boolean(
    location.reservation_enabled ||
      location.internal_reservations_enabled ||
      location.uses_internal_reservations,
  );

  if (
    !hasInternalReservations ||
    (reservationSource !== "internal" && reservationSource !== "both")
  ) {
    return NextResponse.json({ enabled: false });
  }

  const fallbackType =
    routeType === "activity" || routeType === "activities"
      ? "activity"
      : "restaurant";
  const href = getInternalReservationHref(
    {
      id: String(location.id),
      location_type: location.location_type || fallbackType,
    },
    fallbackType,
  );

  if (!href) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({
    enabled: true,
    href,
    label: "Reserve on TheOutHaven",
  });
}
