import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCuisine,
  uniqueLower,
  type StagedLocationInput,
} from "@/lib/location-growth/shared";

const NYC_ENDPOINT = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const BORO_CITY: Record<string, string> = {
  MANHATTAN: "Manhattan",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  BRONX: "Bronx",
  "STATEN ISLAND": "Staten Island",
};
const NYC_SELECT_FIELDS =
  "camis,dba,boro,building,street,zipcode,phone,cuisine_description,latitude,longitude,max(record_date) as record_date";
const NYC_GROUP_FIELDS =
  "camis,dba,boro,building,street,zipcode,phone,cuisine_description,latitude,longitude";

type NycRestaurantRow = Record<string, unknown> & {
  camis?: unknown;
  dba?: unknown;
  boro?: unknown;
  building?: unknown;
  street?: unknown;
  zipcode?: unknown;
  phone?: unknown;
  cuisine_description?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Unknown error");
  }
  return String(error || "Unknown error");
}

async function assertTableExists(
  table: "location_import_batches" | "location_import_staging",
) {
  const { error } = await supabaseAdmin.from(table).select("id").limit(1);
  if (error) {
    throw new Error(
      `Required location growth table ${table} is unavailable: ${getErrorMessage(error)}`,
    );
  }
}

async function assertRequiredTablesExist() {
  await assertTableExists("location_import_batches");
  await assertTableExists("location_import_staging");
}

async function markBatchFailed(batchId: string | null, error: unknown) {
  if (!batchId) return;

  const message = getErrorMessage(error);
  const { error: updateError } = await supabaseAdmin
    .from("location_import_batches")
    .update({
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (updateError) {
    console.error(
      "[location-growth/import-nyc-restaurants] Failed to mark batch failed",
      updateError,
    );
  }
}


function getCompletenessScore(item: any) {
  let score = 0;
  if (item.name) score += 10;
  if (item.address) score += 10;
  if (item.city) score += 5;
  if (item.state) score += 5;
  if (item.zip_code) score += 5;
  if (item.phone) score += 8;
  if (item.latitude != null && item.longitude != null) score += 15;
  if (item.primary_category) score += 8;
  if (item.cuisine) score += 8;
  if (item.raw_payload?.grade) score += 4;
  if (item.raw_payload?.record_date) score += 4;
  return score;
}

function getRecordTimestamp(item: any) {
  const value = item.raw_payload?.record_date;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickBetterStagedLocation(existing: any, incoming: any) {
  const existingScore = getCompletenessScore(existing);
  const incomingScore = getCompletenessScore(incoming);

  if (incomingScore > existingScore) return incoming;
  if (incomingScore < existingScore) return existing;

  const existingTime = getRecordTimestamp(existing);
  const incomingTime = getRecordTimestamp(incoming);

  if (incomingTime > existingTime) return incoming;

  return existing;
}

function dedupeStagedLocationsForUpsert<
  T extends { source: string; source_id: string },
>(items: T[]) {
  const byKey = new Map<string, T>();

  for (const item of items) {
    const key = `${item.source}::${item.source_id}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    byKey.set(key, pickBetterStagedLocation(existing, item) as T);
  }

  return Array.from(byKey.values());
}

function mapNycRow(row: NycRestaurantRow): StagedLocationInput | null {
  const name = clean(row.dba);
  const sourceId = clean(row.camis);
  const building = clean(row.building);
  const street = clean(row.street);
  if (!name || !sourceId || !building || !street) return null;

  const cuisineDescription = clean(row.cuisine_description);
  const cuisine = normalizeCuisine(cuisineDescription);
  const city =
    BORO_CITY[clean(row.boro).toUpperCase()] || clean(row.boro) || "New York";
  const address = [building, street].filter(Boolean).join(" ");
  const keywords = uniqueLower([
    name,
    cuisine,
    cuisineDescription,
    city,
    "restaurant",
    "dinner",
    "date night",
    "nyc",
  ]);

  return {
    source: "nyc_open_data",
    source_id: sourceId,
    source_url: `${NYC_ENDPOINT}?camis=${encodeURIComponent(sourceId)}`,
    location_type: "restaurant",
    name,
    restaurant_name: name,
    address,
    city,
    state: "NY",
    zip_code: clean(row.zipcode) || null,
    phone: clean(row.phone) || null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    primary_category: cuisine,
    cuisine,
    cuisine_type: cuisine,
    primary_tag: cuisine,
    tags: uniqueLower(["restaurant", cuisine, cuisineDescription]),
    search_keywords: keywords,
    description: `${name} is a ${String(cuisine).replace(/_/g, " ")} restaurant in ${city}.`,
    raw_payload: row,
  };
}

async function fetchNycRestaurants(cappedLimit: number, safeOffset: number) {
  const url = new URL(NYC_ENDPOINT);
  url.searchParams.set("$limit", String(cappedLimit));
  url.searchParams.set("$offset", String(safeOffset));
  url.searchParams.set("$select", NYC_SELECT_FIELDS);
  url.searchParams.set("$group", NYC_GROUP_FIELDS);
  url.searchParams.set(
    "$where",
    "dba IS NOT NULL AND building IS NOT NULL AND street IS NOT NULL",
  );
  url.searchParams.set("$order", "camis");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `NYC Open Data request failed with status ${response.status}: ${
        text || response.statusText || "No response body"
      }`,
    );
  }

  try {
    const rows = text ? JSON.parse(text) : [];
    if (!Array.isArray(rows)) {
      throw new Error("NYC Open Data returned a non-array response");
    }
    return rows as NycRestaurantRow[];
  } catch (error) {
    throw new Error(
      `NYC Open Data returned invalid JSON: ${getErrorMessage(error)}`,
    );
  }
}

export async function importNycRestaurants({
  limit = 500,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
}) {
  const cappedLimit = Math.min(Math.max(Number(limit || 500), 1), 1000);
  const safeOffset = Math.max(Number(offset || 0), 0);
  let batchId: string | null = null;

  await assertRequiredTablesExist();

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("location_import_batches")
    .insert({
      source: "nyc_open_data",
      source_label: "NYC Open Data Restaurants",
      status: "running",
      metadata: { limit: cappedLimit, offset: safeOffset },
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(
      `Failed to create NYC restaurant import batch: ${getErrorMessage(batchError)}`,
    );
  }

  batchId = String(batch.id);

  try {
    const rows = await fetchNycRestaurants(cappedLimit, safeOffset);
    const mapped = rows
      .map(mapNycRow)
      .filter((item): item is StagedLocationInput => Boolean(item))
      .map((item) => ({ ...item, batch_id: batchId }));

    const staged = dedupeStagedLocationsForUpsert(mapped);
    const duplicatesRemoved = mapped.length - staged.length;

    if (staged.length) {
      const { error } = await supabaseAdmin
        .from("location_import_staging")
        .upsert(staged, { onConflict: "source,source_id" });
      if (error) {
        throw new Error(
          `Failed to stage NYC restaurants: ${getErrorMessage(error)}`,
        );
      }
    }

    const { error: qualityError } = await supabaseAdmin.rpc(
      "oh_refresh_staging_quality",
      {
        p_batch_id: batchId,
      },
    );
    if (qualityError) {
      throw new Error(
        `Failed to score staged NYC restaurants: ${getErrorMessage(qualityError)}`,
      );
    }

    const { error: dedupeError } = await supabaseAdmin.rpc(
      "oh_find_staging_duplicates",
      {
        p_batch_id: batchId,
      },
    );
    if (dedupeError) {
      throw new Error(
        `Failed to dedupe staged NYC restaurants: ${getErrorMessage(dedupeError)}`,
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: "staged",
        total_seen: rows.length || 0,
        total_staged: staged.length,
        metadata: {
          limit: cappedLimit,
          offset: safeOffset,
          mapped: mapped.length,
          duplicatesRemoved,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (updateError) {
      throw new Error(
        `Failed to finalize NYC restaurant import batch: ${getErrorMessage(updateError)}`,
      );
    }

    return {
      batchId,
      seen: rows.length,
      mapped: mapped.length,
      staged: staged.length,
      duplicatesRemoved,
      limit: cappedLimit,
      offset: safeOffset,
      nextOffset: safeOffset + cappedLimit,
    };
  } catch (error) {
    await markBatchFailed(batchId, error);
    throw error;
  }
}
