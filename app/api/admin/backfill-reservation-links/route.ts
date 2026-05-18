import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { extractReservationUrl } from "@/lib/reservation-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BackfillTable = "locations" | "restaurants" | "activities";

type BackfillRow = {
  id: string;
  slug?: string | null;
  location_id?: string | null;
  google_place_id?: string | null;
  reservation_url?: string | null;
  booking_url?: string | null;
  reservation_link?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
  phone?: string | null;
  rating?: number | string | null;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function getGoogleKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
}

function hasSecretAuthorization(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;
  const bearer = getBearerToken(request);
  const importSecret = request.headers.get("x-internal-import-secret");

  return Boolean(
    (process.env.ADMIN_SECRET && bearer === process.env.ADMIN_SECRET) ||
      (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) ||
      (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET),
  );
}

async function requireAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) return null;
  const { error } = await requireAdminApiRole(["superuser", "admin", "editor"]);
  return error;
}

async function fetchGoogleDetails(placeId: string) {
  const key = getGoogleKey();
  if (!key) throw new Error("Missing Google Places API key");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "place_id",
      "name",
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "url",
      "rating",
      "user_ratings_total",
      "price_level",
    ].join(","),
  );
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const data = await response.json();
  if (data.status !== "OK") {
    throw new Error(data.error_message || `Google Places error: ${data.status}`);
  }
  return data.result || {};
}

function parseTables(value: string | null): BackfillTable[] {
  if (value === "all") return ["locations", "restaurants", "activities"];
  if (value === "restaurants" || value === "activities") return [value];
  return ["locations"];
}

function existingReservation(row: BackfillRow) {
  return row.reservation_url || row.booking_url || row.reservation_link || null;
}

async function syncLegacyFromLocation(location: BackfillRow, update: Record<string, unknown>) {
  const filters = [
    location.id ? { key: "location_id", value: location.id } : null,
    location.google_place_id ? { key: "google_place_id", value: location.google_place_id } : null,
    location.slug ? { key: "slug", value: location.slug } : null,
  ].filter(Boolean) as { key: string; value: string }[];

  for (const table of ["restaurants", "activities"] as const) {
    for (const filter of filters) {
      await supabaseAdmin.from(table).update(update).eq(filter.key, filter.value);
    }
  }
}

async function runTable(table: BackfillTable, limit: number, dryRun: boolean, onlyMissing: boolean, minRating: number | null) {
  const summary = {
    checked: 0,
    updated: 0,
    skippedAlreadyHasLink: 0,
    skippedNoGooglePlaceId: 0,
    skippedNoBookingLink: 0,
    failed: 0,
  };

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, slug, location_id, google_place_id, reservation_url, booking_url, reservation_link, website, google_maps_url, phone, rating")
    .not("google_place_id", "is", null)
    .limit(limit);

  if (error) throw new Error(error.message);

  for (const row of ((data || []) as BackfillRow[])) {
    summary.checked += 1;

    if (!row.google_place_id) {
      summary.skippedNoGooglePlaceId += 1;
      continue;
    }

    if (onlyMissing && existingReservation(row)) {
      summary.skippedAlreadyHasLink += 1;
      continue;
    }

    try {
      const details = await fetchGoogleDetails(row.google_place_id);
      const rating = Number(details.rating || row.rating || 0);
      if (minRating !== null && rating && rating < minRating) {
        summary.skippedNoBookingLink += 1;
        continue;
      }

      const reservationUrl = extractReservationUrl(details);
      if (!reservationUrl) {
        summary.skippedNoBookingLink += 1;
        continue;
      }

      const update: Record<string, unknown> = {
        website: row.website || details.website || null,
        google_maps_url: row.google_maps_url || details.url || null,
        phone: row.phone || details.formatted_phone_number || details.international_phone_number || null,
        rating: rating || null,
      };

      if (!existingReservation(row)) {
        update.reservation_url = reservationUrl;
        update.booking_url = reservationUrl;
      }

      if (!dryRun) {
        await supabaseAdmin.from(table).update(update).eq("id", row.id).throwOnError();
        if (table === "locations") await syncLegacyFromLocation(row, update);
      }

      summary.updated += 1;
    } catch (error) {
      console.error(`Reservation backfill failed for ${table}:${row.id}`, error);
      summary.failed += 1;
    }
  }

  return summary;
}

export async function GET(request: NextRequest) {
  const authError = await requireAuthorization(request);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 50), 250));
  const dryRun = searchParams.get("dryRun") === "true";
  const onlyMissing = searchParams.get("onlyMissing") !== "false";
  const minRatingParam = searchParams.get("minRating");
  const minRating = minRatingParam ? Number(minRatingParam) : null;
  const tables = parseTables(searchParams.get("table"));

  const result = {
    checked: 0,
    updated: 0,
    skippedAlreadyHasLink: 0,
    skippedNoGooglePlaceId: 0,
    skippedNoBookingLink: 0,
    failed: 0,
    dryRun,
    tables: {} as Record<string, unknown>,
  };

  for (const table of tables) {
    const tableResult = await runTable(table, limit, dryRun, onlyMissing, minRating);
    result.tables[table] = tableResult;
    result.checked += tableResult.checked;
    result.updated += tableResult.updated;
    result.skippedAlreadyHasLink += tableResult.skippedAlreadyHasLink;
    result.skippedNoGooglePlaceId += tableResult.skippedNoGooglePlaceId;
    result.skippedNoBookingLink += tableResult.skippedNoBookingLink;
    result.failed += tableResult.failed;
  }

  return NextResponse.json(result);
}
