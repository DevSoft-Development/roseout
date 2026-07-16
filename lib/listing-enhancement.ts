export type LocationTableName = "locations" | "restaurants" | "activities";

export type EnhancementFieldName =
  | "description"
  | "primary_tag"
  | "cuisine"
  | "tags"
  | "vibe_tags"
  | "mood_tags"
  | "best_for_tags"
  | "date_style_tags"
  | "cuisine_tags"
  | "search_keywords"
  | "review_keywords"
  | "semantic_tags"
  | "intent_tags"
  | "special_features"
  | "price_range"
  | "price_level"
  | "dress_code"
  | "hours"
  | "hours_of_operation"
  | "operating_hours"
  | "special_hours"
  | "reservation_url"
  | "reservation_link"
  | "external_reservation_url"
  | "reservation_enabled"
  | "reservation_type"
  | "reservation_source"
  | "internal_reservations_enabled"
  | "uses_internal_reservations"
  | "instagram_url"
  | "owner_instagram";

export type EnhancementFormValue = string | string[] | boolean | Record<string, unknown> | unknown[] | null;
export type EnhancementFormState = Partial<Record<EnhancementFieldName, EnhancementFormValue>>;

export const ARRAY_ENHANCEMENT_FIELDS = [
  "tags",
  "vibe_tags",
  "mood_tags",
  "best_for_tags",
  "date_style_tags",
  "cuisine_tags",
  "search_keywords",
  "review_keywords",
  "semantic_tags",
  "intent_tags",
  "special_features",
] as const satisfies readonly EnhancementFieldName[];

export const JSON_ENHANCEMENT_FIELDS = ["operating_hours", "special_hours"] as const satisfies readonly EnhancementFieldName[];
export const BOOLEAN_ENHANCEMENT_FIELDS = ["reservation_enabled", "internal_reservations_enabled", "uses_internal_reservations"] as const satisfies readonly EnhancementFieldName[];

export const ENHANCEMENT_FIELD_MAP = {
  locations: [
    "description", "primary_tag", "cuisine", "tags", "vibe_tags", "best_for_tags", "date_style_tags", "search_keywords", "review_keywords", "semantic_tags", "intent_tags", "special_features", "price_range", "operating_hours", "special_hours", "reservation_url", "reservation_link", "external_reservation_url", "reservation_enabled", "reservation_type", "reservation_source", "internal_reservations_enabled", "uses_internal_reservations", "instagram_url", "owner_instagram",
  ],
  restaurants: [
    "description", "primary_tag", "cuisine", "tags", "mood_tags", "best_for_tags", "date_style_tags", "cuisine_tags", "search_keywords", "review_keywords", "special_features", "price_range", "price_level", "dress_code", "hours", "hours_of_operation", "operating_hours", "special_hours", "reservation_url", "reservation_link", "external_reservation_url", "reservation_enabled", "reservation_type", "reservation_source", "internal_reservations_enabled", "uses_internal_reservations", "instagram_url",
  ],
  activities: [
    "description", "primary_tag", "tags", "vibe_tags", "best_for_tags", "date_style_tags", "search_keywords", "review_keywords", "special_features", "price_range", "price_level", "dress_code", "hours", "operating_hours", "special_hours", "reservation_url", "reservation_link", "external_reservation_url", "reservation_enabled", "reservation_type", "reservation_source", "internal_reservations_enabled", "uses_internal_reservations", "instagram_url",
  ],
} as const satisfies Record<LocationTableName, readonly EnhancementFieldName[]>;

export function isLocationTableName(value: unknown): value is LocationTableName {
  return value === "locations" || value === "restaurants" || value === "activities";
}

export function isEnhancementFieldName(value: unknown): value is EnhancementFieldName {
  return typeof value === "string" && Object.values(ENHANCEMENT_FIELD_MAP).some((fields) => (fields as readonly string[]).includes(value));
}

export function getEnhancementFieldsForTable(table: LocationTableName): readonly EnhancementFieldName[] {
  return ENHANCEMENT_FIELD_MAP[table];
}

export function isArrayEnhancementField(field: EnhancementFieldName): boolean {
  return (ARRAY_ENHANCEMENT_FIELDS as readonly EnhancementFieldName[]).includes(field);
}

export function isJsonEnhancementField(field: EnhancementFieldName): boolean {
  return (JSON_ENHANCEMENT_FIELDS as readonly EnhancementFieldName[]).includes(field);
}

export function isBooleanEnhancementField(field: EnhancementFieldName): boolean {
  return (BOOLEAN_ENHANCEMENT_FIELDS as readonly EnhancementFieldName[]).includes(field);
}

export function tagsArrayToInput(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
  if (typeof value === "string") return value;
  return "";
}

export function inputToTagsArray(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function jsonValueToInput(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function parseJsonInput(value: string): { ok: true; value: Record<string, unknown> | unknown[] | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null || Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null)) return { ok: true, value: parsed as Record<string, unknown> | unknown[] | null };
    return { ok: false, error: "JSON must be an object or array." };
  } catch {
    return { ok: false, error: "Enter valid JSON, or leave this field blank." };
  }
}
