import { detectChainBrand } from "@/lib/location-growth/chainDetection";
import {
  hasLocationPhoto,
  getPhotoStatus,
} from "@/lib/location-growth/photoDetection";
import {
  calculateLocationQuality as sharedCalculateLocationQuality,
  cleanText,
  normalizePhone,
  nullIfEmpty,
  removeDuplicatedCityStateZipFromAddress,
} from "@/lib/location-growth/shared";

export function cleanLocationRow(row: any) {
  const name =
    nullIfEmpty(row.name) ||
    nullIfEmpty(row.restaurant_name) ||
    nullIfEmpty(row.activity_name);
  const address = removeDuplicatedCityStateZipFromAddress(row);
  const primaryCategory =
    nullIfEmpty(row.primary_category) ||
    nullIfEmpty(row.cuisine) ||
    nullIfEmpty(row.cuisine_type) ||
    nullIfEmpty(row.activity_type) ||
    nullIfEmpty(row.primary_tag);
  return {
    ...row,
    name,
    address,
    phone: normalizePhone(row.phone) || nullIfEmpty(row.phone),
    primary_category: primaryCategory,
  };
}

export function calculateLocationQuality(row: any) {
  return sharedCalculateLocationQuality(row);
}

export function buildLocationCleanupUpdates(row: any) {
  const cleaned = cleanLocationRow(row);
  const qualityScore = calculateLocationQuality(cleaned);
  const hasPhotos = hasLocationPhoto(cleaned);
  const photoStatus = getPhotoStatus(cleaned);
  const chain = detectChainBrand(
    String(
      cleaned.name || cleaned.restaurant_name || cleaned.activity_name || "",
    ),
  );
  const qualityStatus =
    qualityScore >= 75 && !hasPhotos
      ? "needs_photo"
      : qualityScore >= 75
        ? "publish_ready"
        : qualityScore >= 55
          ? "review"
          : "reject";
  const hasAddress = Boolean(cleanText(cleaned.address));
  const hasCoordinates = cleaned.latitude != null && cleaned.longitude != null;
  const hasCategory = Boolean(cleanText(cleaned.primary_category));
  const isDuplicate = cleaned.duplicate_status === "duplicate";
  const isSearchable =
    qualityScore >= 75 &&
    hasPhotos &&
    hasAddress &&
    hasCoordinates &&
    hasCategory &&
    !isDuplicate;

  return {
    name: cleaned.name,
    address: cleaned.address,
    phone: cleaned.phone,
    primary_category: cleaned.primary_category,
    normalized_name: cleanText(cleaned.name).toLowerCase() || null,
    normalized_address: cleanText(cleaned.address).toLowerCase() || null,
    normalized_phone: normalizePhone(cleaned.phone),
    quality_score: qualityScore,
    quality_status: qualityStatus,
    is_searchable: isSearchable,
    has_photos: hasPhotos,
    photo_status: photoStatus,
    is_chain: chain.isChain,
    brand_type: chain.isChain ? "chain" : "independent",
    chain_brand: chain.chainBrand,
    curation_tier: chain.isChain
      ? "utility"
      : cleaned.curation_tier || "standard",
    date_score: chain.isChain ? 20 : (cleaned.date_score ?? 50),
    search_boost: chain.isChain ? -25 : (cleaned.search_boost ?? 0),
    ...(chain.isChain ? { is_featured: false } : {}),
    data_status: qualityStatus === "publish_ready" ? "clean" : "needs_review",
    last_cleaned_at: new Date().toISOString(),
    last_quality_check_at: new Date().toISOString(),
  };
}
