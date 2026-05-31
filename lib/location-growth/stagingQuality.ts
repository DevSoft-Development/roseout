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

type StageableRow = Record<string, unknown>;

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

  return {
    normalized_name:
      normalizeLocationText(
        row.name || row.restaurant_name || row.activity_name,
      ) || null,
    normalized_address: normalizeLocationText(row.address) || null,
    normalized_phone: normalizePhone(row.phone),
    location_key: buildLocationKey(row),
    quality_score: qualityScore,
    quality_status: qualityStatusForScore(qualityScore, hasPhotos),
    has_photos: hasPhotos,
    photo_status: photoStatus,
    is_chain: chain.isChain,
    brand_type: chain.isChain ? "chain" : "independent",
    chain_brand: chain.chainBrand,
    curation_tier: chain.isChain
      ? "utility"
      : String(row.curation_tier || "standard"),
    date_score: chain.isChain ? 20 : Number(row.date_score ?? 50),
    search_boost: chain.isChain ? -25 : Number(row.search_boost ?? 0),
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
