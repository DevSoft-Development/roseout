import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { profileUpdateWithSearchDocument } from "@/lib/location-profile-fields";

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
  "operating_hours",
  "special_hours",
  "semantic_tags",
  "best_for_tags",
  "best_for",
  "holiday_closures",
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
  "profile_managed_by",
  "profile_manual_lock",
  "profile_owner_verified_at",
  "profile_last_owner_update_at",
  "profile_last_admin_update_at",
  "profile_field_sources",
  "health_department_score",
  "health_department_grade",
  "health_department_source",
  "health_department_source_url",
  "health_department_last_inspection_date",
  "missing_fields",
  "claim_status",
  "theouthaven_score",
  "google_regular_opening_hours",
  "hours_backfill_status",
  "hours_confidence",
  "hours_source",
  "hours_last_backfilled_at",
  "hours_backfill_error",
  "kitchen_closing_time",
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

const PROFILE_SOURCE_FIELDS = [
  "name",
  "restaurant_name",
  "activity_name",
  "description",
  "short_description",
  "address",
  "city",
  "state",
  "zip_code",
  "neighborhood",
  "borough",
  "latitude",
  "longitude",
  "phone",
  "website",
  "reservation_url",
  "booking_url",
  "operating_hours",
  "special_hours",
  "semantic_tags",
  "best_for_tags",
  "best_for",
  "main_image",
  "image_url",
  "images",
  "price_range",
  "cuisine",
  "activity_type",
  "tags",
  "primary_tag",
  "category",
  "is_searchable",
  "publish_ready",
  "data_status",
  "photo_status",
  "missing_fields",
  "google_place_id",
  "formatted_address",
];

function withManualProfileSource(
  payload: Record<string, unknown>,
  existing: Record<string, unknown>,
  isAdmin: boolean,
) {
  const now = new Date().toISOString();
  const source = isAdmin ? "admin" : "owner";
  const fieldSources = {
    ...((existing.profile_field_sources && typeof existing.profile_field_sources === "object" && !Array.isArray(existing.profile_field_sources))
      ? existing.profile_field_sources as Record<string, unknown>
      : {}),
  };

  for (const field of PROFILE_SOURCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) fieldSources[field] = source;
  }

  payload.profile_field_sources = fieldSources;
  payload.profile_manual_lock = true;

  if (isAdmin) {
    payload.profile_managed_by = existing.profile_managed_by === "owner" ? "owner" : "admin";
    payload.profile_last_admin_update_at = now;
  } else {
    payload.profile_managed_by = "owner";
    payload.profile_last_owner_update_at = now;
    payload.profile_owner_verified_at = existing.profile_owner_verified_at || now;
  }

  return payload;
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

    const responseLocation = { ...(data as Record<string, unknown>) };
    if (!auth.access.isAdmin) {
      delete responseLocation.review_keywords;
      delete responseLocation.search_document;
      delete responseLocation.semantic_search_text;
      delete responseLocation.special_hours;
    }

    const canonicalId = String((data as Record<string, unknown>).id || finalId);
    const sourceId = (data as Record<string, unknown>).source_id
      ? String((data as Record<string, unknown>).source_id)
      : null;

    return NextResponse.json({
      location: responseLocation,
      canonicalId,
      sourceId,
      effectiveId: sourceId || canonicalId,
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
      .select("id, source_id, profile_managed_by, profile_field_sources, profile_owner_verified_at")
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

    if (!auth.access.isAdmin) {
      delete locationPayload.review_keywords;
      delete locationPayload.search_document;
      delete locationPayload.semantic_search_text;
      delete locationPayload.special_hours;
      delete locationPayload.data_status;
      delete locationPayload.missing_fields;
      delete locationPayload.claim_status;
      delete locationPayload.theouthaven_score;
      delete locationPayload.profile_managed_by;
      delete locationPayload.profile_manual_lock;
      delete locationPayload.profile_owner_verified_at;
      delete locationPayload.profile_last_admin_update_at;
      delete locationPayload.profile_field_sources;
    }

    withManualProfileSource(locationPayload, existingLocation.data as Record<string, unknown>, auth.access.isAdmin);

    const fullExistingLocation = await supabase.from("locations").select("*").eq("id", existingLocation.data.id).maybeSingle();
    const payloadWithSearchDocument = profileUpdateWithSearchDocument((fullExistingLocation.data || existingLocation.data) as Record<string, unknown>, locationPayload);

    const { error } = await supabase
      .from("locations")
      .update(payloadWithSearchDocument)
      .eq("id", existingLocation.data.id);

    if (error) {
      const schemaCacheHint =
        typeof error.message === "string" &&
        error.message.toLowerCase().includes("schema cache")
          ? " Run the latest Supabase migrations and reload the PostgREST schema cache."
          : "";

      console.error("Edit context update error:", error);
      return NextResponse.json(
        { error: `We could not save this location right now.${schemaCacheHint}` },
        { status: 400 },
      );
    }

    const canonicalId = String(existingLocation.data.id);
    const sourceId = existingLocation.data.source_id
      ? String(existingLocation.data.source_id)
      : null;

    // locations is the canonical source of truth for admin edits.
    // Do not dual-write the full admin payload into legacy restaurants/activities.
    return NextResponse.json({
      success: true,
      savedTo: "locations",
      skippedLegacySync: true,
      canonicalId,
      sourceId,
      effectiveId: sourceId || canonicalId,
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
