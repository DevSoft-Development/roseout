import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { syncActivityToLocation, syncRestaurantToLocation } from "@/lib/sync-location";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";

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


async function getAuthenticatedOwnerAccess() {
  const authSupabase = await createAuthClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), access: null };
  }

  const access = await getLocationOwnerAccess(user.id);
  if (!access.isAdmin && access.ownedLocationIds.length === 0 && access.ownedSourceLocationIds.length === 0) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }), access: null };
  }

  return { response: null, access };
}

async function resolveRequestedLocation({
  requestedType,
  requestedId,
  allowImpersonation,
}: {
  requestedType: LocationType;
  requestedId: string;
  allowImpersonation: boolean;
}) {
  const cookieStore = await cookies();
  const impersonatedLocationId = cookieStore.get("theouthaven_impersonate_location_id")?.value;
  const impersonatedLocationType = cookieStore.get("theouthaven_impersonate_location_type")?.value;
  const isLocationImpersonation =
    allowImpersonation &&
    impersonatedLocationId &&
    validType(impersonatedLocationType || "") &&
    impersonatedLocationType === requestedType;
  const finalId = isLocationImpersonation ? impersonatedLocationId : requestedId;
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

  return { data, error, finalId, sourceTable, supabase, isLocationImpersonation: Boolean(isLocationImpersonation) };
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

    const auth = await getAuthenticatedOwnerAccess();
    if (auth.response || !auth.access) return auth.response;

    const { data, error, finalId, isLocationImpersonation } = await resolveRequestedLocation({
      requestedType,
      requestedId,
      allowImpersonation: auth.access.isAdmin,
    });

    if (data && !hasOwnerAccessToLocation(auth.access, data as Record<string, any>)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    const auth = await getAuthenticatedOwnerAccess();
    if (auth.response || !auth.access) return auth.response;

    const resolved = await resolveRequestedLocation({
      requestedType,
      requestedId,
      allowImpersonation: auth.access.isAdmin,
    });

    if (resolved.error || !resolved.data) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    if (!hasOwnerAccessToLocation(auth.access, resolved.data as Record<string, any>)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const finalId = resolved.finalId;
    const supabase = resolved.supabase;
    const isLocationImpersonation = resolved.isLocationImpersonation;

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
        const schemaCacheHint =
          typeof error.message === "string" &&
          error.message.toLowerCase().includes("schema cache")
            ? " Run the latest Supabase migrations and reload the PostgREST schema cache."
            : "";

        return NextResponse.json(
          { error: `${error.message}${schemaCacheHint}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        effectiveId: String(existingLocation.data.source_id || finalId),
        canonicalId: existingLocation.data.id,
        savedTo: "locations",
        skippedLegacySync: true,
        isImpersonating: Boolean(isLocationImpersonation),
      });
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