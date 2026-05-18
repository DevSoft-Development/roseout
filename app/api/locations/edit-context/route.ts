import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { syncActivityToLocation, syncRestaurantToLocation } from "@/lib/sync-location";

export const dynamic = "force-dynamic";

type LocationType = "restaurants" | "activities";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function validType(type: string | null): type is LocationType {
  return type === "restaurants" || type === "activities";
}

const ACTIVITY_UPDATE_BLOCKLIST = new Set([
  "cuisine",
  "cuisine_type",
  "food_type",
  "hours_of_operation",
  "days_of_operation",
  "kitchen_closing_time",
  "google_maps_link",
]);

function sanitizePayloadForType(type: LocationType, payload: Record<string, unknown>) {
  if (type !== "activities") return payload;

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !ACTIVITY_UPDATE_BLOCKLIST.has(key))
  );
}

function sourceTableForType(type: LocationType) {
  return type;
}

function sanitizeLocationPayload(payload: Record<string, unknown>) {
  const copy = { ...payload };
  if (typeof copy.reservation_source === "string" && !["internal", "external", "both", "none"].includes(copy.reservation_source)) {
    copy.reservation_source = "external";
  }
  return copy;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const requestedType = searchParams.get("type");
    const requestedId = searchParams.get("id");

    if (!validType(requestedType) || !requestedId) {
      return NextResponse.json(
        { error: "Missing or invalid location request." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const impersonatedLocationId =
      cookieStore.get("theouthaven_impersonate_location_id")?.value;

    const impersonatedLocationType =
      cookieStore.get("theouthaven_impersonate_location_type")?.value;

    const isLocationImpersonation =
      impersonatedLocationId &&
      validType(impersonatedLocationType || "") &&
      impersonatedLocationType === requestedType;

    const finalId = isLocationImpersonation
      ? impersonatedLocationId
      : requestedId;

    const supabase = adminSupabase();

    const sourceTable = sourceTableForType(requestedType);
    let { data, error } = await supabase
      .from("locations")
      .select("*")
      .or(`id.eq.${finalId},and(source_table.eq.${sourceTable},source_id.eq.${finalId})`)
      .maybeSingle();

    if (!data) {
      const legacyResult = await supabase
        .from(requestedType)
        .select("*")
        .eq("id", finalId)
        .maybeSingle();

      if (legacyResult.data) {
        data = legacyResult.data;
        error = legacyResult.error;
      }
    }

    if (error || !data) {
      return NextResponse.json(
        { error: "Location not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      location: data,
      effectiveId: String((data as Record<string, unknown>).source_id || finalId),
      canonicalId: (data as Record<string, unknown>).id || null,
      isImpersonating: Boolean(isLocationImpersonation),
    });
  } catch (error) {
    console.error("Edit context load error:", error);

    return NextResponse.json(
      { error: "Failed to load location." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const requestedType = body.type;
    const requestedId = body.id;
    const payload = body.payload;

    if (!validType(requestedType) || !requestedId || !payload) {
      return NextResponse.json(
        { error: "Missing update details." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const impersonatedLocationId =
      cookieStore.get("theouthaven_impersonate_location_id")?.value;

    const impersonatedLocationType =
      cookieStore.get("theouthaven_impersonate_location_type")?.value;

    const isLocationImpersonation =
      impersonatedLocationId &&
      validType(impersonatedLocationType || "") &&
      impersonatedLocationType === requestedType;

    const finalId = isLocationImpersonation
      ? impersonatedLocationId
      : requestedId;

    const supabase = adminSupabase();

    const sourceTable = sourceTableForType(requestedType);
    const locationPayload = sanitizeLocationPayload(payload);
    const legacyPayload = sanitizePayloadForType(requestedType, payload);

    const existingLocation = await supabase
      .from("locations")
      .select("id, source_id")
      .or(`id.eq.${finalId},and(source_table.eq.${sourceTable},source_id.eq.${finalId})`)
      .maybeSingle();

    if (existingLocation.data?.id) {
      const { error } = await supabase
        .from("locations")
        .update(locationPayload)
        .eq("id", existingLocation.data.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const legacyId = String(existingLocation.data?.source_id || finalId);
    const { data: legacyRow, error } = await supabase
      .from(requestedType)
      .update(legacyPayload)
      .eq("id", legacyId)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (legacyRow) {
      try {
        if (requestedType === "restaurants") {
          await syncRestaurantToLocation(legacyRow as Record<string, unknown> & { id: string | number });
        } else {
          await syncActivityToLocation(legacyRow as Record<string, unknown> & { id: string | number });
        }
      } catch (syncError) {
        console.error("Location canonical sync failed:", syncError);
      }
    }

    return NextResponse.json({
      success: true,
      effectiveId: legacyId,
      isImpersonating: Boolean(isLocationImpersonation),
    });
  } catch (error) {
    console.error("Edit context save error:", error);

    return NextResponse.json(
      { error: "Failed to save location." },
      { status: 500 }
    );
  }
}