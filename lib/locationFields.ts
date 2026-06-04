import { toDisplayLabel } from "./displayLabel";

export type LocationCategoryFields = {
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[] | string | null;
  vibe_tags?: string[] | string | null;
  best_for_tags?: string[] | string | null;
  google_types?: string[] | string | null;
  atmosphere?: string[] | string | null;
  best_for?: string[] | string | null;
  date_style_tags?: string[] | string | null;
  search_keywords?: string[] | string | null;
};

export function getPrimaryCategory(location: any) {
  const raw =
    location?.primary_category ||
    location?.cuisine ||
    location?.cuisine_type ||
    location?.activity_type ||
    location?.primary_tag ||
    "Experience";

  return toDisplayLabel(raw) || "Experience";
}

export function getCuisine(location: any) {
  const raw = location?.cuisine || location?.cuisine_type || null;
  return raw ? toDisplayLabel(raw) : null;
}

function normalizeTags(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [value];
}

export function getLocationTags(location: any) {
  const tags = [
    ...normalizeTags(location?.tags),
    ...normalizeTags(location?.vibe_tags),
    ...normalizeTags(location?.best_for_tags),
    ...normalizeTags(location?.google_types),
    ...normalizeTags(location?.atmosphere),
    ...normalizeTags(location?.best_for),
    ...normalizeTags(location?.date_style_tags),
    ...normalizeTags(location?.search_keywords),
    location?.primary_category,
    location?.primary_tag,
    location?.cuisine,
    location?.cuisine_type,
    location?.activity_type,
  ];

  return Array.from(
    new Set(
      tags
        .filter(Boolean)
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
    )
  );
}
