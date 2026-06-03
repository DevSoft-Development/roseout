import { createHash } from "crypto";
import { detectChainBrand } from "@/lib/location-growth/chainDetection";
import {
  hasLocationPhoto,
  getPhotoStatus,
} from "@/lib/location-growth/photoDetection";
import {
  calculateLocationQuality,
  cleanText,
  normalizePhone,
} from "@/lib/location-growth/shared";
import { isLowLevelLocation, isUnverifiedNycRestaurant } from "@/lib/search/lowLevel";

type StageableRow = Record<string, unknown>;

const THEATER_CLASSIFICATION_TERMS = [
  "theater",
  "theatre",
  "cinema",
  "movie theater",
  "movie theatre",
  "movie_theater",
  "performing arts",
  "performing_arts",
  "playhouse",
  "concert hall",
  "opera house",
];

function toTextArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

function isTheaterLikeLocation(row: StageableRow) {
  const googleTypes = toTextArray(row.google_types)
    .map((value) => normalizeLocationText(value.replace(/_/g, " ")))
    .join(" ");
  const categoryText = [
    row.location_type,
    row.primary_category,
    row.category,
    row.activity_type,
    row.name,
    row.activity_name,
  ]
    .filter(Boolean)
    .map((value) => normalizeLocationText(String(value).replace(/_/g, " ")))
    .join(" ");
  const searchable = `${categoryText} ${googleTypes}`;

  return THEATER_CLASSIFICATION_TERMS.some((term) =>
    searchable.includes(term.replace(/_/g, " "))
  );
}

export function normalizeLocationText(value: unknown) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLocationKey(row: StageableRow) {
  const name = row.name || row.restaurant_name || row.activity_name;
  const joined = [
    normalizeLocationText(name),
    normalizeLocationText(row.address),
    normalizeLocationText(row.city),
    cleanText(row.state).toUpperCase(),
  ].join("|");

  return createHash("md5").update(joined).digest("hex");
}

export function qualityStatusForScore(score: number, hasPhotos = true) {
  if (score >= 75 && !hasPhotos) return "needs_photo";
  if (score >= 75) return "publish_ready";
  if (score >= 55) return "review";
  return "reject";
}

export function calculateStagingQuality(row: StageableRow) {
  const qualityScore = calculateLocationQuality(row);
  const hasPhotos = hasLocationPhoto(row);
  const photoStatus = getPhotoStatus(row);
  const name = row.name || row.restaurant_name || row.activity_name;
  const chain = detectChainBrand(String(name || ""));
  const lowLevel = isLowLevelLocation({ ...row, has_photos: hasPhotos, photo_status: photoStatus });
  const unverifiedNyc = isUnverifiedNycRestaurant({ ...row, has_photos: hasPhotos, photo_status: photoStatus });
  const lowLevelReason = unverifiedNyc ? "nyc_import_unverified" : lowLevel ? "low_level_review" : null;
  const theaterLike = isTheaterLikeLocation(row);

  return {
    normalized_name:
      normalizeLocationText(
        row.name || row.restaurant_name || row.activity_name,
      ) || null,
    normalized_address: normalizeLocationText(row.address) || null,
    normalized_phone: normalizePhone(row.phone),
    location_key: buildLocationKey(row),
    ...(theaterLike
      ? {
          location_type: "activity",
          activity_type: row.activity_type || "theater",
          activity_name: row.activity_name || name || null,
          restaurant_name: null,
          cuisine: null,
          cuisine_type: null,
          food_type: null,
        }
      : {}),
    quality_score: qualityScore,
    quality_status: lowLevel || unverifiedNyc ? "low_level_review" : qualityStatusForScore(qualityScore, hasPhotos),
    has_photos: hasPhotos,
    photo_status: photoStatus,
    is_chain: chain.isChain,
    brand_type: chain.isChain ? "chain" : "independent",
    chain_brand: chain.chainBrand,
    curation_tier: chain.isChain
      ? "utility"
      : String(row.curation_tier || "standard"),
    date_score: chain.isChain ? 20 : Number(row.date_score ?? 50),
    search_boost: lowLevel || unverifiedNyc ? -500 : chain.isChain ? -25 : Number(row.search_boost ?? 0),
    is_low_level: lowLevel || unverifiedNyc,
    low_level_reason: lowLevelReason,
    low_level_detected_at: lowLevel || unverifiedNyc ? new Date().toISOString() : null,
    low_level_source: lowLevel || unverifiedNyc ? "staging_quality" : null,
    public_visibility_tier: lowLevel || unverifiedNyc ? "hidden" : String(row.public_visibility_tier || "standard"),
    import_confidence: lowLevel || unverifiedNyc ? "low" : String(row.import_confidence || "unknown"),
    source_quality_status: unverifiedNyc ? "imported_unverified" : lowLevel ? "low_level_review" : String(row.source_quality_status || "unknown"),
  };
}

export function hasCompleteStagingQuality(row: StageableRow) {
  return Boolean(
    row.normalized_name &&
    row.normalized_address &&
    row.location_key &&
    row.quality_score !== null &&
    row.quality_score !== undefined &&
    row.quality_status,
  );
}
