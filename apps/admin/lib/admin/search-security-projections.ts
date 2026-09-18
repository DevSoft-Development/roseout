import "server-only";

export const SEARCH_ANCHOR_LIST_FIELDS = [
  "id",
  "canonical_name",
  "normalized_name",
  "aliases",
  "anchor_type",
  "source_type",
  "city",
  "state",
  "borough",
  "neighborhood",
  "county",
  "market",
  "latitude",
  "longitude",
  "default_radius_miles",
  "max_radius_miles",
  "radius_strategy",
  "google_place_id",
  "external_id",
  "linked_location_id",
  "priority",
  "confidence",
  "is_active",
  "is_searchable",
  "review_status",
  "usage_count",
  "successful_search_count",
  "no_result_count",
  "created_at",
  "updated_at",
].join(",");

export const SEARCH_ANCHOR_DETAIL_FIELDS = `${SEARCH_ANCHOR_LIST_FIELDS},metadata`;

export const SEARCH_BENCHMARK_QUERY_FIELDS = [
  "id",
  "query_key",
  "query_text",
  "expected_result_type",
  "expected_market",
  "required_constraints",
  "optional_preferences",
  "max_distance_miles",
  "active",
  "updated_at",
].join(",");

export const SEARCH_BENCHMARK_LABEL_FIELDS = [
  "id",
  "query_id",
  "result_key",
  "location_id",
  "restaurant_location_id",
  "activity_location_id",
  "relevance_grade",
  "violation_codes",
  "notes",
  "labeled_by",
  "labeled_at",
].join(",");

export const SEARCH_BENCHMARK_SCORECARD_FIELDS = [
  "id",
  "run_key",
  "status",
  "started_at",
  "completed_at",
  "query_count",
  "labeled_query_count",
  "control_score",
  "shadow_score",
  "score_delta",
  "release_gate_passed",
  "control_precision_at_3",
  "shadow_precision_at_3",
  "control_precision_at_5",
  "shadow_precision_at_5",
  "control_mrr",
  "shadow_mrr",
  "control_ndcg_at_5",
  "shadow_ndcg_at_5",
  "control_constraint_pass_rate",
  "shadow_constraint_pass_rate",
  "control_wrong_domain_rate",
  "shadow_wrong_domain_rate",
  "control_wrong_market_rate",
  "shadow_wrong_market_rate",
  "control_distance_violation_rate",
  "shadow_distance_violation_rate",
  "control_bad_pair_rate",
  "shadow_bad_pair_rate",
].join(",");

const SEARCH_ANCHOR_WRITABLE_FIELDS = new Set([
  "canonical_name",
  "aliases",
  "anchor_type",
  "source_type",
  "city",
  "state",
  "borough",
  "neighborhood",
  "county",
  "market",
  "latitude",
  "longitude",
  "default_radius_miles",
  "max_radius_miles",
  "radius_strategy",
  "google_place_id",
  "external_id",
  "linked_location_id",
  "priority",
  "confidence",
  "is_active",
  "is_searchable",
  "review_status",
  "metadata",
]);

function boundedString(value: unknown, max = 500) {
  if (typeof value !== "string") return value;
  return value.trim().slice(0, max);
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 10_000) return undefined;
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

export function sanitizeSearchAnchorPayload(input: unknown) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SEARCH_ANCHOR_WRITABLE_FIELDS.has(key)) continue;
    if (key === "metadata") {
      const metadata = sanitizeMetadata(value);
      if (metadata !== undefined) out.metadata = metadata;
      continue;
    }
    if (["canonical_name", "anchor_type", "source_type", "city", "state", "borough", "neighborhood", "county", "market", "radius_strategy", "google_place_id", "external_id", "linked_location_id", "review_status"].includes(key)) {
      out[key] = boundedString(value);
      continue;
    }
    out[key] = value;
  }
  if (Array.isArray(out.aliases)) out.aliases = out.aliases.filter((value): value is string => typeof value === "string").slice(0, 50).map((value) => value.trim().slice(0, 200));
  return out;
}

export function boundedMergeNotes(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1000) || null : null;
}
