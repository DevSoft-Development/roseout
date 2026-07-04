import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { resolveSelectedLocationAccess } from "@/lib/auth/selectedLocationAccess";
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

export function sourceTableVariantsForType(type: LocationType) {
  return type === "activities"
    ? ["activities", "activity"]
    : ["restaurants", "restaurant"];
}

function sourceTableForType(type: LocationType) {
  return sourceTableVariantsForType(type)[0];
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

async function findCanonicalLocationByIdOrSource({
  supabase,
  requestedType,
  id,
}: {
  supabase: ReturnType<typeof adminSupabase>;
  requestedType: LocationType;
  id: string;
}) {
  const sourceVariants = sourceTableVariantsForType(requestedType);

  const byId = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (byId.data) {
    return {
      data: byId.data,
      error: byId.error,
      matchedBy: "canonical_id" as const,
    };
  }

  const sourceOr = sourceVariants
    .map((sourceTable) => `and(source_table.eq.${sourceTable},source_id.eq.${id})`)
    .join(",");

  const bySource = await supabase
    .from("locations")
    .select("*")
    .or(sourceOr)
    .maybeSingle();

  if (bySource.data) {
    return {
      data: bySource.data,
      error: bySource.error,
      matchedBy: "source_id" as const,
    };
  }

  return {
    data: null,
    error: byId.error || bySource.error,
    matchedBy: null,
  };
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

  const canonical = await findCanonicalLocationByIdOrSource({
    supabase,
    requestedType,
    id: finalId,
  });

  let legacyData: Record<string, unknown> | null = null;
  let legacyError: unknown = null;

  if (!canonical.data) {
    const legacyResult = await supabase
      .from(requestedType)
      .select("*")
      .eq("id", finalId)
      .maybeSingle();

    legacyData = legacyResult.data as Record<string, unknown> | null;
    legacyError = legacyResult.error;

    if (legacyData?.id) {
      const canonicalFromLegacy = await findCanonicalLocationByIdOrSource({
        supabase,
        requestedType,
        id: String(legacyData.id),
      });

      if (canonicalFromLegacy.data) {
        return {
          data: canonicalFromLegacy.data,
          canonicalData: canonicalFromLegacy.data,
          legacyData,
          error: canonicalFromLegacy.error,
          finalId,
          sourceTable: sourceTableForType(requestedType),
          sourceTableVariants: sourceTableVariantsForType(requestedType),
          supabase,
          isLocationImpersonation: Boolean(isLocationImpersonation),
          matchedBy: canonicalFromLegacy.matchedBy,
        };
      }
    }
  }

  return {
    data: canonical.data || legacyData,
    canonicalData: canonical.data || null,
    legacyData,
    error: canonical.error || legacyError,
    finalId,
    sourceTable: sourceTableForType(requestedType),
    sourceTableVariants: sourceTableVariantsForType(requestedType),
    supabase,
    isLocationImpersonation: Boolean(isLocationImpersonation),
    matchedBy: canonical.matchedBy,
  };
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
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "semantic_search_text",
  "review_keywords",
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "semantic_search_text",
  "review_keywords",
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

const LOCATION_TEXT_ARRAY_FIELDS = new Set([
  "tags",
  "semantic_tags",
  "best_for_tags",
  "best_for",
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "review_keywords",
]);

function normalizeTextArrayField(value: unknown) {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) return [];
    value = trimmed.split(",");
  }
  const raw = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") continue;
    const normalized = String(item ?? "").trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function sanitizeCanonicalLocationPayload(payload: Record<string, unknown>) {
  const copy = sanitizeLocationPayload(payload);

  for (const key of Object.keys(copy)) {
    if (CANONICAL_LOCATION_BLOCKLIST.has(key) || !CANONICAL_LOCATION_EDIT_COLUMNS.has(key)) {
      delete copy[key];
    }
  }

  for (const field of LOCATION_TEXT_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(copy, field)) copy[field] = normalizeTextArrayField(copy[field]);
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


const FALLBACK_SAFE_LOCATION_COLUMNS = new Set([
  "id", "name", "restaurant_name", "activity_name", "description", "phone", "website", "address", "city", "state", "zip_code", "neighborhood", "main_image", "image_url", "images", "hours", "operating_hours", "is_searchable", "data_status", "price_range", "category", "cuisine", "activity_type", "latitude", "longitude", "google_place_id", "formatted_address", "updated_at",
]);

let locationsColumnSetPromise: Promise<Set<string>> | null = null;
export async function getLocationsColumnSet() {
  if (!locationsColumnSetPromise) {
    const supabase = adminSupabase();
    locationsColumnSetPromise = Promise.resolve(
      supabase
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", "locations")
        .then(({ data, error }) => {
          if (error || !data?.length) return new Set(FALLBACK_SAFE_LOCATION_COLUMNS);
          return new Set(data.map((row: any) => String(row.column_name)));
        }),
    );
  }
  return locationsColumnSetPromise;
}

async function filterLocationsPayloadForLiveColumns(payload: Record<string, unknown>) {
  const columns = await getLocationsColumnSet();
  const filtered: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (columns.has(key)) filtered[key] = value;
    else dropped.push(key);
  }
  if (dropped.length && process.env.NODE_ENV !== "production") console.warn("Dropped locations update keys missing from live schema:", dropped);
  return filtered;
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
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "semantic_search_text",
  "review_keywords",
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "semantic_search_text",
  "review_keywords",
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

    const { data, canonicalData, legacyData, error, finalId, isLocationImpersonation, matchedBy } = await resolveRequestedLocation({
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

    const resolvedData = data as Record<string, unknown>;
    const canonicalRow = canonicalData as Record<string, unknown> | null;
    const legacyRow = legacyData as Record<string, unknown> | null;

    const responseLocation: Record<string, unknown> = {
      ...resolvedData,
      canonical_location_id: canonicalRow?.id || null,
      legacy_source_id: legacyRow?.id || resolvedData.source_id || null,
    };
    if (!auth.access.isAdmin) {
      delete responseLocation.review_keywords;
      delete responseLocation.search_document;
      delete responseLocation.semantic_search_text;
      delete responseLocation.special_hours;
    }

    const canonicalId = canonicalRow?.id ? String(canonicalRow.id) : null;
    const sourceId = canonicalRow?.source_id
      ? String(canonicalRow.source_id)
      : legacyRow?.id
        ? String(legacyRow.id)
        : resolvedData.source_id
          ? String(resolvedData.source_id)
          : null;

    return NextResponse.json({
      location: responseLocation,
      canonicalId,
      sourceId,
      effectiveId: canonicalId || sourceId || finalId,
      hasCanonicalLocation: Boolean(canonicalId),
      matchedBy,
      isImpersonating: Boolean(isLocationImpersonation),
      isAdmin: Boolean(auth.access.isAdmin),
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

    const authClient = await createAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ctx = await resolveSelectedLocationAccess({ ...body, userId: user.id, locationId: body.locationId ?? body.id, location_id: body.location_id ?? body.id });
    if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

    const adminDb = adminSupabase();
    const resolved = { finalId: ctx.canonicalLocationId, supabase: adminDb, isLocationImpersonation: ctx.isDemoMode, canonicalData: ctx.location, legacyData: null as Record<string, unknown> | null };
    const finalId = resolved.finalId;
    const supabase = resolved.supabase;
    const isLocationImpersonation = resolved.isLocationImpersonation;
    const locationPayload = sanitizeCanonicalLocationPayload(payload);

    const existingLocation = resolved.canonicalData?.id
      ? await supabase
          .from("locations")
          .select("id, source_id, profile_managed_by, profile_field_sources, profile_owner_verified_at")
          .eq("id", String(resolved.canonicalData.id))
          .maybeSingle()
      : await findCanonicalLocationByIdOrSource({
          supabase,
          requestedType,
          id: finalId,
        }).then(async (match) => {
          if (!match.data?.id) return { data: null, error: match.error };
          return supabase
            .from("locations")
            .select("id, source_id, profile_managed_by, profile_field_sources, profile_owner_verified_at")
            .eq("id", String(match.data.id))
            .maybeSingle();
        });

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

    if (!ctx.access.isAdmin) {
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

    withManualProfileSource(locationPayload, existingLocation.data as Record<string, unknown>, ctx.access.isAdmin);

    const fullExistingLocation = await supabase.from("locations").select("*").eq("id", existingLocation.data.id).maybeSingle();
    const payloadWithSearchDocument = await filterLocationsPayloadForLiveColumns(profileUpdateWithSearchDocument((fullExistingLocation.data || existingLocation.data) as Record<string, unknown>, locationPayload));

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
      : resolved.legacyData?.id
        ? String(resolved.legacyData.id)
        : null;

    // locations is the canonical source of truth for admin edits.
    // Do not dual-write the full admin payload into legacy restaurants/activities.
    return NextResponse.json({
      success: true,
      savedTo: "locations",
      skippedLegacySync: true,
      canonicalId,
      sourceId,
      effectiveId: canonicalId,
      hasCanonicalLocation: true,
      isImpersonating: Boolean(isLocationImpersonation),
      isAdmin: Boolean(ctx.access.isAdmin),
    });
  } catch (error) {
    console.error("Edit context save error:", error);

    return NextResponse.json(
      { error: "Failed to save location." },
      { status: 500 }
    );
  }
}
