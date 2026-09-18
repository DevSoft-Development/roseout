export type CanonicalLocationQualityState =
  | "ready"
  | "needs_enrichment"
  | "duplicate_review"
  | "needs_photo"
  | "hidden"
  | "rejected";

export type LocationQualityStateInput = {
  status?: unknown;
  import_status?: unknown;
  quality_status?: unknown;
  data_status?: unknown;
  source_quality_status?: unknown;
  import_confidence?: unknown;
  public_visibility_tier?: unknown;
  duplicate_status?: unknown;
  is_hidden?: unknown;
  is_low_level?: unknown;
  has_photos?: unknown;
  photo_status?: unknown;
  main_image?: unknown;
  image_url?: unknown;
  images?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  location_type?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const ACTIVE_STATES = new Set(["NY", "NJ", "CT"]);

function hasImage(input: LocationQualityStateInput) {
  if (text(input.main_image) || text(input.image_url)) return true;
  if (Array.isArray(input.images)) return input.images.some((value) => text(value));
  if (typeof input.images === "string") return text(input.images) !== "" && text(input.images) !== "[]";
  return input.has_photos === true || ["has_photo", "cached", "google_live_proxy"].includes(lower(input.photo_status));
}

function hasCoordinates(input: LocationQualityStateInput) {
  return Number.isFinite(Number(input.latitude)) && Number.isFinite(Number(input.longitude));
}

export function deriveLocationQualityState(input: LocationQualityStateInput): CanonicalLocationQualityState {
  const status = lower(input.status);
  const importStatus = lower(input.import_status);
  const duplicateStatus = lower(input.duplicate_status);
  const visibility = lower(input.public_visibility_tier);
  const sourceQuality = lower(input.source_quality_status);
  const confidence = lower(input.import_confidence);
  const quality = lower(input.quality_status);
  const dataStatus = lower(input.data_status);
  const state = text(input.state).toUpperCase();

  if (["rejected", "closed", "archived"].includes(status) || importStatus === "rejected") return "rejected";
  if (["duplicate", "possible_duplicate"].includes(duplicateStatus) || importStatus === "duplicate") return "duplicate_review";
  if (
    input.is_hidden === true ||
    input.is_low_level === true ||
    importStatus === "hidden" ||
    ["hidden", "low_level", "internal"].includes(visibility) ||
    sourceQuality === "low_level_review" ||
    (state && !ACTIVE_STATES.has(state))
  ) return "hidden";
  if (!hasImage(input) || quality === "needs_photo") return "needs_photo";
  if (
    importStatus === "published" ||
    quality === "publish_ready"
  ) return "ready";
  if (
    dataStatus && dataStatus !== "clean" ||
    sourceQuality === "imported_unverified" ||
    confidence === "low" ||
    !text(input.address) ||
    !text(input.city) ||
    !hasCoordinates(input) ||
    !text(input.location_type)
  ) return "needs_enrichment";
  return "needs_enrichment";
}

export const LOCATION_QUALITY_STATE_LABELS: Record<CanonicalLocationQualityState, string> = {
  ready: "Ready",
  needs_enrichment: "Needs enrichment",
  duplicate_review: "Duplicate review",
  needs_photo: "Needs photo",
  hidden: "Hidden",
  rejected: "Rejected",
};
