export const ACTIVE_MARKET_STATES = ["NY", "NJ", "CT"] as const;
export type ActiveMarketState = (typeof ACTIVE_MARKET_STATES)[number];

export type LocationPublishabilityInput = {
  id?: string | null; name?: string | null; state?: string | null; status?: string | null; data_status?: string | null; quality_status?: string | null; source_quality_status?: string | null; import_confidence?: string | null; public_visibility_tier?: string | null; duplicate_status?: string | null; is_searchable?: boolean | null; is_hidden?: boolean | null; is_low_level?: boolean | null; has_photos?: boolean | null; photo_status?: string | null; main_image?: string | null; image_url?: string | null; images?: string[] | null; address?: string | null; city?: string | null; latitude?: number | string | null; longitude?: number | string | null; location_type?: string | null;
};

export type LocationPublishabilityResult = {
  isSearchable: boolean;
  isReadyToApprove: boolean;
  qualityStatus: string;
  sourceQualityStatus: string;
  importConfidence: string;
  publicVisibilityTier: string;
  isHidden: boolean;
  isLowLevel: boolean;
  normalizedImages: string[];
  primaryImage: string | null;
  reasons: string[];
  reviewLabel: "Ready to approve" | "Needs review" | "Needs photo" | "Low-level / hidden" | "Duplicate" | "Out of market" | "Missing required data";
};

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
const text = (v: unknown) => String(v ?? "").trim();
const isBlank = (v: unknown) => text(v) === "";
const hasCoordinate = (v: unknown) => !isBlank(v) && Number.isFinite(Number(v));

export function normalizeLocationImages(location: LocationPublishabilityInput) {
  const raw = Array.isArray(location.images) ? location.images : [];
  const images = raw.map((item) => text(item)).filter(Boolean);
  const primary = text(location.main_image) || text(location.image_url) || images[0] || null;
  if (images.length === 0 && primary) images.push(primary);
  return { normalizedImages: Array.from(new Set(images)), primaryImage: primary };
}

export function isActiveMarketState(state?: string | null): state is ActiveMarketState {
  return ACTIVE_MARKET_STATES.includes(text(state).toUpperCase() as ActiveMarketState);
}

export function evaluateLocationPublishability(location: LocationPublishabilityInput, options: { allowApproval?: boolean } = {}): LocationPublishabilityResult {
  const reasons: string[] = [];
  const state = text(location.state).toUpperCase();
  const status = lower(location.status) || "approved";
  const dataStatus = lower(location.data_status) || "clean";
  const locationType = lower(location.location_type);
  const duplicateStatus = lower(location.duplicate_status || "unknown");
  const sourceQuality = lower(location.source_quality_status || "unknown");
  const importConfidence = lower(location.import_confidence || "unknown");
  const isHidden = location.is_hidden === true || lower(location.public_visibility_tier) === "hidden";
  const isLowLevel = location.is_low_level === true || ["low_level", "internal", "pending_review", "rejected"].includes(lower(location.public_visibility_tier)) || sourceQuality === "low_level_review";
  const { normalizedImages, primaryImage } = normalizeLocationImages(location);
  const hasPhoto = location.has_photos === true && Boolean(primaryImage) && lower(location.photo_status) !== "missing_photo";

  if (!isActiveMarketState(state)) reasons.push("Out of active market");
  if (!["approved", ""].includes(status)) reasons.push(status === "rejected" || status === "closed" || status === "archived" ? `Status ${status}` : "Not approved");
  if (!["restaurant", "activity"].includes(locationType)) reasons.push("Unsupported location type");
  if (dataStatus !== "clean") reasons.push("Needs review");
  if (lower(location.public_visibility_tier || "standard") !== "standard") reasons.push(isHidden ? "Hidden" : isLowLevel ? "Low-level" : "Non-standard visibility tier");
  if (isHidden && !reasons.includes("Hidden")) reasons.push("Hidden");
  if (isLowLevel && !reasons.includes("Low-level")) reasons.push("Low-level");
  if (!hasPhoto) reasons.push("Missing photo");
  if (!primaryImage) reasons.push("Missing image");
  if (normalizedImages.length === 0) reasons.push("Missing image array");
  if (isBlank(location.address)) reasons.push("Missing address");
  if (isBlank(location.city)) reasons.push("Missing city");
  if (!hasCoordinate(location.latitude) || !hasCoordinate(location.longitude)) reasons.push("Missing coordinates");
  if (duplicateStatus === "duplicate") reasons.push("Duplicate");
  if (sourceQuality === "imported_unverified") reasons.push("Imported unverified");
  if (sourceQuality === "low_level_review") reasons.push("Low-level");
  if (importConfidence === "low") reasons.push("Low import confidence");

  const eligible = reasons.length === 0;
  const isSearchable = eligible;
  let qualityStatus = lower(location.quality_status || "needs_review");
  let sourceQualityStatus = sourceQuality;
  let nextImportConfidence = importConfidence;
  let publicVisibilityTier = lower(location.public_visibility_tier || "standard");

  if (isSearchable) {
    qualityStatus = "publish_ready";
    sourceQualityStatus = "enriched";
    nextImportConfidence = "high";
    publicVisibilityTier = "standard";
  } else if (reasons.includes("Missing photo") || reasons.includes("Missing image")) {
    qualityStatus = "needs_photo";
  } else if (isHidden || isLowLevel || sourceQuality === "imported_unverified" || importConfidence === "low") {
    qualityStatus = "low_level_review";
  } else if (qualityStatus === "publish_ready") {
    qualityStatus = "needs_review";
  }
  if (isHidden) publicVisibilityTier = "hidden";
  else if (isLowLevel) publicVisibilityTier = "low_level";

  const reviewLabel = eligible && options.allowApproval ? "Ready to approve" : !isActiveMarketState(state) ? "Out of market" : duplicateStatus === "duplicate" ? "Duplicate" : (isHidden || isLowLevel || sourceQuality === "imported_unverified" || importConfidence === "low") ? "Low-level / hidden" : (!hasPhoto || !primaryImage) ? "Needs photo" : reasons.some((r) => r.startsWith("Missing") || r === "Unsupported location type") ? "Missing required data" : "Needs review";

  return { isSearchable, isReadyToApprove: eligible, qualityStatus, sourceQualityStatus, importConfidence: nextImportConfidence, publicVisibilityTier, isHidden: isSearchable ? false : isHidden, isLowLevel: isSearchable ? false : isLowLevel, normalizedImages, primaryImage, reasons: Array.from(new Set(reasons)), reviewLabel };
}

export function buildPublishabilityUpdate(location: LocationPublishabilityInput, options: { allowApproval?: boolean } = {}) {
  const result = evaluateLocationPublishability(location, options);
  return {
    result,
    update: {
      is_searchable: result.isSearchable,
      quality_status: result.qualityStatus,
      source_quality_status: result.sourceQualityStatus,
      import_confidence: result.importConfidence,
      public_visibility_tier: result.publicVisibilityTier,
      is_hidden: result.isHidden,
      is_low_level: result.isLowLevel,
      images: result.normalizedImages,
    },
  };
}
