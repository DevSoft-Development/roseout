import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

type BackfillTable = "restaurants" | "activities";
type BackfillField =
  | "phone"
  | "website"
  | "google_maps_url"
  | "review_count"
  | "rating"
  | "price_level";

const DEFAULT_BACKFILL_FIELDS: BackfillField[] = [
  "phone",
  "website",
  "google_maps_url",
  "review_count",
  "rating",
  "price_level",
];

type BackfillItem = {
  id: string;
  google_place_id: string;
  phone?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
  review_count?: number | string | null;
  rating?: number | string | null;
  price_level?: number | string | null;
};

type BackfillBody = {
  limit?: number | string;
  minRating?: number | string;
  minReviews?: number | string;
  fields?: string[] | string;
};

type BackfillLogPayload = Record<string, unknown> | null;

type GooglePlaceDetails = {
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  review_count: number | null;
  rating: number | null;
  price_level: number | null;
};

function getGoogleKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function hasSecretAuthorization(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;

  const importSecret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);

  if (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET) {
    return true;
  }

  if (process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET) {
    return true;
  }

  return false;
}

// Clear AI cache after imports
await supabaseAdmin
  .from("ai_response_cache")
  .delete()
  .gte("created_at", "2000-01-01");

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function logImportRun(result: BackfillLogPayload, errorMessage?: string) {
  try {
    await supabaseAdmin.from("import_logs").insert({
      job_name: "google_details_backfill",
      run_date: new Date().toISOString().split("T")[0],
      meta: result || {},
      error: errorMessage || null,
    });
  } catch (err) {
    console.error("Backfill logging failed:", err);
  }
}

function shouldSkipLowQualityExisting(
  item: BackfillItem,
  minRating: number,
  minReviews: number
) {
  const rating = Number(item.rating || 0);
  const reviewCount = Number(item.review_count || 0);

  if (!rating || !reviewCount) return false;

  return rating < minRating || reviewCount < minReviews;
}

function parseBackfillFields(value: unknown): BackfillField[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const allowed = new Set(DEFAULT_BACKFILL_FIELDS);
  const fields = raw.filter((field): field is BackfillField =>
    allowed.has(field as BackfillField)
  );

  return fields.length ? fields : DEFAULT_BACKFILL_FIELDS;
}

function getMissingDetailsFilter(fields: BackfillField[]) {
  const filters: Record<BackfillField, string[]> = {
    phone: ["phone.is.null", "phone.eq."],
    website: ["website.is.null", "website.eq."],
    google_maps_url: ["google_maps_url.is.null", "google_maps_url.eq."],
    review_count: ["review_count.is.null", "review_count.eq.0"],
    rating: ["rating.is.null", "rating.eq.0"],
    price_level: [],
  };

  return fields.flatMap((field) => filters[field]).filter(Boolean).join(",");
}

function shouldUpdateField(item: BackfillItem, field: BackfillField, phoneOnly: boolean) {
  if (!phoneOnly) return true;

  const value = item[field];
  return value === null || value === undefined || value === "" || value === 0;
}

async function getGooglePlaceDetails(
  placeId: string
): Promise<GooglePlaceDetails | null> {
  const apiKey = getGoogleKey();

  if (!apiKey) throw new Error("Missing Google API key");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");

  url.searchParams.set("key", apiKey);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "url",
      "user_ratings_total",
      "rating",
      "price_level",
    ].join(",")
  );

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || data.status !== "OK") {
    console.error("Google Details failed:", {
      placeId,
      status: data.status,
      error_message: data.error_message,
    });

    return null;
  }

  const result = data.result || {};

  return {
    phone:
      result.formatted_phone_number ||
      result.international_phone_number ||
      null,
    website: result.website || null,
    google_maps_url: result.url || null,
    review_count: result.user_ratings_total ?? null,
    rating: result.rating ?? null,
    price_level: result.price_level ?? null,
  };
}

async function backfillTable(
  table: BackfillTable,
  limit: number,
  minRating: number,
  minReviews: number,
  fields: BackfillField[]
) {
  const phoneOnly = fields.length === 1 && fields[0] === "phone";
  const missingFilter = getMissingDetailsFilter(fields);
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      "id, google_place_id, phone, website, google_maps_url, review_count, rating"
    )
    .not("google_place_id", "is", null)
    .or(missingFilter || "phone.is.null,phone.eq.")
    .limit(limit);

  if (error) throw new Error(error.message);

  let checked = 0;
  let enriched = 0;
  let skippedLowQuality = 0;
  let skippedNoDetails = 0;
  let failed = 0;

  for (const item of data || []) {
    checked++;

    try {
      if (!phoneOnly && shouldSkipLowQualityExisting(item, minRating, minReviews)) {
        skippedLowQuality++;
        continue;
      }

      const details = await getGooglePlaceDetails(item.google_place_id);

      if (!details) {
        skippedNoDetails++;
        continue;
      }

      const finalRating = Number(details.rating || item.rating || 0);
      const finalReviewCount = Number(
        details.review_count || item.review_count || 0
      );

      if (!phoneOnly && (finalRating < minRating || finalReviewCount < minReviews)) {
        skippedLowQuality++;
        continue;
      }

      const updatePayload: Partial<GooglePlaceDetails> = {};

      if (fields.includes("phone") && details.phone && shouldUpdateField(item, "phone", phoneOnly)) {
        updatePayload.phone = details.phone;
      }
      if (fields.includes("website") && details.website && shouldUpdateField(item, "website", phoneOnly)) {
        updatePayload.website = details.website;
      }
      if (
        fields.includes("google_maps_url") &&
        details.google_maps_url &&
        shouldUpdateField(item, "google_maps_url", phoneOnly)
      ) {
        updatePayload.google_maps_url = details.google_maps_url;
      }
      if (fields.includes("review_count") && details.review_count !== null) {
        updatePayload.review_count = details.review_count;
      }
      if (fields.includes("rating") && details.rating !== null) {
        updatePayload.rating = details.rating;
      }
      if (fields.includes("price_level") && details.price_level !== null) {
        updatePayload.price_level = details.price_level;
      }

      if (Object.keys(updatePayload).length === 0) {
        skippedNoDetails++;
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from(table)
        .update(updatePayload)
        .eq("id", item.id);

      if (updateError) {
        console.error(`${table} enrichment update failed:`, updateError);
        failed++;
      } else {
        enriched++;
      }
    } catch (error) {
      console.error(`Backfill failed for ${table}:`, error);
      failed++;
    }
  }

  return {
    table,
    checked,
    enriched,
    skippedLowQuality,
    skippedNoDetails,
    failed,
    fields,
  };
}

async function requireBackfillAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) return null;

  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  return error;
}

async function runBackfill(request: NextRequest) {
  let responsePayload: BackfillLogPayload = null;

  try {
    const authError = await requireBackfillAuthorization(request);

    if (authError) {
      return authError;
    }

    let body: BackfillBody = {};

    if (request.method !== "GET") {
      body = await request.json().catch(() => ({}));
    }

    const searchParams = request.nextUrl.searchParams;

    const limit = Math.min(
      Number(body.limit || searchParams.get("limit") || 25),
      100
    );

    const fields = parseBackfillFields(
      body.fields || searchParams.get("fields") || searchParams.get("field")
    );
    const phoneOnly = fields.length === 1 && fields[0] === "phone";

    const minRating = Number(
      body.minRating || searchParams.get("minRating") || (phoneOnly ? 0 : 4.2)
    );

    const minReviews = Number(
      body.minReviews || searchParams.get("minReviews") || (phoneOnly ? 0 : 75)
    );

    const restaurants = await backfillTable(
      "restaurants",
      limit,
      minRating,
      minReviews,
      fields
    );

    const activities = await backfillTable(
      "activities",
      limit,
      minRating,
      minReviews,
      fields
    );

    responsePayload = {
      success: true,
      message:
        "Smart Google Details backfill complete. Phone numbers, websites, Google Maps URLs, ratings, review counts, and price levels were only imported for higher-quality listings.",
      settings: {
        limit,
        minRating,
        minReviews,
        fields,
      },
      restaurants,
      activities,
    };

    await logImportRun(responsePayload);

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    responsePayload = {
      error: getErrorMessage(error) || "Backfill failed",
    };

    await logImportRun(responsePayload, String(responsePayload.error));

    return NextResponse.json(responsePayload, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runBackfill(request);
}

export async function POST(request: NextRequest) {
  return runBackfill(request);
}