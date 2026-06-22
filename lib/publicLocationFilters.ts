import { ACTIVE_MARKET_STATES } from "@/lib/location-publishability";
export const PUBLIC_LOW_LEVEL_SELECT_FIELDS = [
  "is_low_level",
  "public_visibility_tier",
  "curation_tier",
  "source_quality_status",
  "import_confidence",
  "has_photos",
  "photo_status",
  "duplicate_status",
  "status",
  "quality_status",
].join(",");

export function applyPublicLocationFilters(query: any) {
  return query
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .in("state", [...ACTIVE_MARKET_STATES])
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .is("duplicate_of", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .not("status", "in", '("closed","archived","rejected")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","internal","pending_review","hidden","rejected")')
    .not("is_demo", "is", true)
    .not("training_only", "is", true)
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low");
}

export function isPublicLocationRecord(item: any) {
  const status = String(item?.status || "").toLowerCase();
  return item?.is_searchable === true &&
    item?.quality_status === "publish_ready" &&
    item?.duplicate_status !== "duplicate" &&
    item?.duplicate_of == null &&
    item?.has_photos === true &&
    item?.photo_status !== "missing_photo" &&
    item?.data_status === "clean" &&
    item?.is_hidden !== true &&
    item?.deleted_at == null &&
    status !== "closed" &&
    status !== "archived" &&
    item?.is_low_level !== true &&
    !["low_level", "internal", "pending_review", "hidden", "rejected"].includes(String(item?.public_visibility_tier || "").toLowerCase()) &&
    item?.is_demo !== true &&
    item?.training_only !== true &&
    String(item?.curation_tier || "").toLowerCase() !== "low_level" &&
    !["imported_unverified", "generic_restaurant", "needs_enrichment", "low_level_review"].includes(String(item?.source_quality_status || "").toLowerCase()) &&
    String(item?.import_confidence || "").toLowerCase() !== "low" &&
    Boolean(item?.main_image || item?.image_url) &&
    ACTIVE_MARKET_STATES.includes(String(item?.state || "").toUpperCase() as any) &&
    Boolean(item?.address) && Boolean(item?.city) && item?.latitude != null && item?.longitude != null &&
    status !== "rejected";
}
