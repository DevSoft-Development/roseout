import { supabaseAdmin } from "@/lib/supabase-admin";

type SourceTable = "restaurants" | "activities";
type DataStatus =
  | "clean"
  | "missing_image"
  | "missing_category"
  | "missing_coordinates"
  | "missing_address"
  | "needs_review";

type SourceRow = Record<string, unknown> & { id: string | number };

export const RESTAURANT_LOCATION_SELECT = `
  id,
  name,
  restaurant_name,
  primary_category,
  cuisine,
  cuisine_type,
  food_type,
  primary_tag,
  google_place_id,
  main_image,
  image_url,
  images,
  external_reservation_url,
  reservation_url,
  reservation_link,
  theouthaven_score,
  roseout_score,
  quality_score,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  price_range,
  rating,
  review_count,
  phone,
  website,
  tags,
  vibe_tags,
  best_for_tags,
  google_types,
  search_keywords,
  review_keywords,
  date_style_tags,
  best_for,
  special_features,
  signature_items,
  popularity_score,
  trend_score,
  conversion_score,
  review_score,
  ranking_badge,
  status,
  is_hidden,
  is_featured,
  is_verified,
  reservation_enabled,
  operating_hours,
  special_hours,
  holiday_closures,
  atmosphere,
  qr_link,
  qr_code_data_url,
  claim_qr_url,
  claim_url,
  claim_token,
  claim_code,
  owner_user_id
`;

export const ACTIVITY_LOCATION_SELECT = `
  id,
  name,
  activity_name,
  location_type,
  primary_category,
  activity_type,
  primary_tag,
  google_place_id,
  main_image,
  image_url,
  images,
  external_reservation_url,
  reservation_url,
  reservation_link,
  theouthaven_score,
  roseout_score,
  quality_score,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  price_range,
  rating,
  review_count,
  phone,
  website,
  tags,
  vibe_tags,
  best_for_tags,
  google_types,
  search_keywords,
  review_keywords,
  date_style_tags,
  best_for,
  special_features,
  signature_items,
  popularity_score,
  trend_score,
  conversion_score,
  review_score,
  ranking_badge,
  status,
  is_hidden,
  is_featured,
  is_verified,
  reservation_enabled,
  operating_hours,
  special_hours,
  holiday_closures,
  atmosphere,
  qr_link,
  qr_code_data_url,
  claim_qr_url,
  claim_url,
  claim_token,
  claim_code,
  owner_user_id
`;

const SHARED_FIELDS = [
  "address",
  "city",
  "state",
  "zip_code",
  "neighborhood",
  "latitude",
  "longitude",
  "description",
  "price_range",
  "rating",
  "review_count",
  "phone",
  "website",
  "image_url",
  "images",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "google_types",
  "search_keywords",
  "review_keywords",
  "date_style_tags",
  "best_for",
  "special_features",
  "signature_items",
  "quality_score",
  "popularity_score",
  "trend_score",
  "conversion_score",
  "review_score",
  "ranking_badge",
  "status",
  "is_hidden",
  "is_featured",
  "is_verified",
  "reservation_enabled",
  "owner_user_id",
  "operating_hours",
  "special_hours",
  "holiday_closures",
] as const;

const QR_FIELDS = [
  "qr_link",
  "qr_code_data_url",
  "claim_qr_url",
  "claim_url",
  "claim_token",
  "claim_code",
] as const;

const REQUIRED_SEARCH_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "latitude",
  "longitude",
  "main_image",
] as const;

const TAG_KEYWORDS = [
  "seafood",
  "steakhouse",
  "steak",
  "sushi",
  "italian",
  "mexican",
  "jamaican",
  "caribbean",
  "soul food",
  "brunch",
  "breakfast",
  "dinner",
  "hookah",
  "lounge",
  "rooftop",
  "bar",
  "club",
  "nightlife",
  "bowling",
  "arcade",
  "museum",
  "spa",
  "comedy",
  "karaoke",
  "escape room",
  "paint",
  "art",
  "wine",
  "jazz",
  "live music",
  "romantic",
  "birthday",
  "group",
  "date night",
] as const;

function cleanString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstPresent<T = unknown>(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = cleanString(value);
      if (trimmed) return trimmed as T;
      continue;
    }

    if (value !== null && value !== undefined) return value as T;
  }

  return null;
}

function isPresent(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function getLocationName(table: SourceTable, row: SourceRow) {
  return table === "restaurants"
    ? firstPresent<string>(row.name, row.restaurant_name)
    : firstPresent<string>(row.name, row.activity_name);
}

function getPrimaryCategory(table: SourceTable, row: SourceRow) {
  return table === "restaurants"
    ? firstPresent<string>(
        row.primary_category,
        row.cuisine,
        row.cuisine_type,
        row.food_type,
        row.primary_tag,
      )
    : firstPresent<string>(
        row.primary_category,
        row.activity_type,
        row.primary_tag,
      );
}

function normalizeArray(value: unknown): string[] {
  if (!isPresent(value)) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeArray(item));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      normalizeArray(item),
    );
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueNormalizedStrings(...values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normalizeArray(value))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagsFromName(...values: unknown[]) {
  const text = values
    .flatMap((value) => normalizeArray(value))
    .join(" ")
    .toLowerCase();

  return TAG_KEYWORDS.filter((keyword) =>
    new RegExp(`(^|\\W)${escapeRegExp(keyword)}(\\W|$)`, "i").test(text),
  );
}

function getMainImage(row: SourceRow) {
  return firstPresent<string>(
    row.main_image,
    row.image_url,
    normalizeArray(row.images)[0],
  );
}

function buildTags(table: SourceTable, row: SourceRow) {
  const name = getLocationName(table, row);
  const primaryCategory = getPrimaryCategory(table, row);

  return uniqueNormalizedStrings(
    row.tags,
    extractTagsFromName(
      name,
      primaryCategory,
      row.cuisine,
      row.cuisine_type,
      row.food_type,
      row.activity_type,
      row.primary_tag,
    ),
  );
}

function buildSearchDocument(row: SourceRow, payload: Record<string, unknown>) {
  return uniqueNormalizedStrings(
    payload.name,
    payload.restaurant_name,
    payload.activity_name,
    payload.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.food_type,
    row.activity_type,
    row.primary_tag,
    payload.tags,
    row.vibe_tags,
    row.best_for_tags,
    row.google_types,
    row.search_keywords,
    row.review_keywords,
    row.date_style_tags,
    row.best_for,
    row.atmosphere,
    row.city,
    row.neighborhood,
    row.state,
    row.description,
  )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMissingFields(payload: Record<string, unknown>) {
  return REQUIRED_SEARCH_FIELDS.filter((field) => !isPresent(payload[field]));
}

function getDataStatus(missingFields: readonly string[]): DataStatus {
  if (missingFields.length === 0) return "clean";
  if (missingFields.includes("main_image")) return "missing_image";
  if (missingFields.includes("primary_category")) return "missing_category";
  if (
    missingFields.includes("latitude") ||
    missingFields.includes("longitude")
  ) {
    return "missing_coordinates";
  }
  if (
    missingFields.includes("address") ||
    missingFields.includes("city") ||
    missingFields.includes("state")
  ) {
    return "missing_address";
  }
  return "needs_review";
}

function getReservationUrl(row: SourceRow) {
  return firstPresent<string>(
    row.external_reservation_url,
    row.reservation_url,
    row.reservation_link,
  );
}

function getTheOutHavenScore(row: SourceRow) {
  return firstPresent<number | string>(
    row.theouthaven_score,
    row.roseout_score,
    row.quality_score,
    0,
  );
}

export function buildLocationPayload(table: SourceTable, row: SourceRow) {
  const locationType =
    table === "restaurants"
      ? "restaurant"
      : firstPresent<string>(row.location_type, row.activity_type) ||
        "activity";

  const payload: Record<string, unknown> = {
    source_table: table,
    source_id: String(row.id),
    location_type: locationType,
    name: getLocationName(table, row),
    restaurant_name:
      table === "restaurants"
        ? firstPresent<string>(row.restaurant_name)
        : null,
    activity_name:
      table === "activities" ? firstPresent<string>(row.activity_name) : null,
    primary_category: getPrimaryCategory(table, row),
    main_image: getMainImage(row),
    external_reservation_url: getReservationUrl(row),
    theouthaven_score: getTheOutHavenScore(row),
    primary_tag: firstPresent<string>(row.primary_tag),
    google_place_id: firstPresent<string>(row.google_place_id),
    tags: buildTags(table, row),
    vibe_tags: uniqueNormalizedStrings(row.vibe_tags),
    best_for_tags: uniqueNormalizedStrings(row.best_for_tags),
    google_types: uniqueNormalizedStrings(row.google_types),
    search_keywords: uniqueNormalizedStrings(
      row.search_keywords,
      buildTags(table, row),
    ),
    review_keywords: uniqueNormalizedStrings(row.review_keywords),
    date_style_tags: uniqueNormalizedStrings(row.date_style_tags),
    best_for: uniqueNormalizedStrings(row.best_for),
    special_features: uniqueNormalizedStrings(row.special_features),
    signature_items: uniqueNormalizedStrings(row.signature_items),
    atmosphere: uniqueNormalizedStrings(row.atmosphere),
    owner_user_id: firstPresent<string>(row.owner_user_id),
  };

  if (table === "restaurants") {
    payload.cuisine = firstPresent<string>(row.cuisine);
    payload.cuisine_type = firstPresent<string>(
      row.cuisine_type,
      row.food_type,
    );
  } else {
    payload.activity_type = firstPresent<string>(row.activity_type);
  }

  for (const field of SHARED_FIELDS) {
    if (field in payload) continue;
    const value = row[field];
    payload[field] = Array.isArray(value)
      ? uniqueNormalizedStrings(value)
      : firstPresent(value);
  }

  for (const field of QR_FIELDS) {
    payload[field] = firstPresent<string>(row[field]);
  }

  payload.images = normalizeArray(row.images);
  payload.search_document = buildSearchDocument(row, payload);

  const missingFields = getMissingFields(payload);
  const isSearchable = missingFields.length === 0;

  return {
    ...payload,
    is_searchable: isSearchable,
    data_status: getDataStatus(missingFields),
    missing_fields: missingFields,
    last_quality_check_at: new Date().toISOString(),
  };
}

export async function syncSourceRowToLocation(
  table: SourceTable,
  row: SourceRow,
) {
  const payload = buildLocationPayload(table, row);
  const { error } = await supabaseAdmin
    .from("locations")
    .upsert(payload, { onConflict: "source_table,source_id" });

  if (error) throw error;

  return payload;
}

export function syncRestaurantToLocation(restaurant: SourceRow) {
  return syncSourceRowToLocation("restaurants", restaurant);
}

export function syncActivityToLocation(activity: SourceRow) {
  return syncSourceRowToLocation("activities", activity);
}
