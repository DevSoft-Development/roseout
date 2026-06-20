import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
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

const CANONICAL_LOCATION_BLOCKLIST = new Set([
  "source_table",
  "source_id",
]);

const CANONICAL_LOCATION_EDIT_COLUMNS = new Set([
  "name",
  "restaurant_name",
  "activity_name",
  "formatted_address",
  "address",
  "days_of_operation",
  "dress_code",
  "parking_info",
  "reservation_discovery_status",
  "reservation_manual_override",
  "reservation_provider",
  "reservation_url",
  "external_reservation_url",
  "reservation_phone",
  "booking_url",
  "website",
  "website_url",
  "phone",
  "description",
  "short_description",
  "neighborhood",
  "borough",
  "city",
  "state",
  "zip_code",
  "postal_code",
  "country",
  "latitude",
  "longitude",
  "price_level",
  "price_range",
  "ambiance",
  "atmosphere",
  "good_for",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "tags",
  "primary_tag",
  "primary_category",
  "category",
  "is_searchable",
  "publish_ready",
  "data_status",
  "photo_status",
  "image_url",
  "main_image",
  "images",
  "google_place_id",
  "health_department_score",
  "health_department_grade",
  "health_department_source",
  "health_department_source_url",
  "health_department_last_inspection_date",
  "updated_at",
]);

function sanitizeCanonicalLocationPayload(payload: Record<string, unknown>) {
  const copy = sanitizeLocationPayload(payload);

  for (const key of Object.keys(copy)) {
    if (CANONICAL_LOCATION_BLOCKLIST.has(key) || !CANONICAL_LOCATION_EDIT_COLUMNS.has(key)) {
      delete copy[key];
    }
  }

  copy.updated_at = new Date().toISOString();

  if (
    copy.health_department_score !== undefined &&
    copy.health_department_score !== null &&
    copy.health_department_score !== ""
  ) {
    const numericScore = Number(copy.health_department_score);
    copy.health_department_score = Number.isFinite(numericScore)
      ? numericScore
      : null;
  }

  if (
    typeof copy.health_department_grade === "string" &&
    copy.health_department_grade.trim()
  ) {
    copy.health_department_grade = copy.health_department_grade
      .trim()
      .toUpperCase();
  }

  if (
    typeof copy.health_department_source === "string" &&
    !copy.health_department_source.trim()
  ) {
    copy.health_department_source = null;
  }

  if (
    typeof copy.health_department_source_url === "string" &&
    !copy.health_department_source_url.trim()
  ) {
    copy.health_department_source_url = null;
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
    const locationPayload = sanitizeCanonicalLocationPayload(payload);

    const existingLocation = await supabase
      .from("locations")
      .select("id, source_id")
      .or(`id.eq.${finalId},and(source_table.eq.${sourceTable},source_id.eq.${finalId})`)
      .maybeSingle();

    if (!existingLocation.data?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Canonical location row not found. Please repair this location before editing.",
          code: "CANONICAL_LOCATION_MISSING",
        },
        { status: 404 },
      );
    }

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
        { status: 400 },
      );
    }

    // locations is the canonical source of truth for admin edits.
    // Do not dual-write the full admin payload into legacy restaurants/activities.
    return NextResponse.json({
      success: true,
      savedTo: "locations",
      skippedLegacySync: true,
      canonicalId: existingLocation.data.id,
      effectiveId: String(existingLocation.data.source_id || finalId),
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