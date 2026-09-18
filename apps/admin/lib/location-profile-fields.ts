export const PRICE_RANGE_OPTIONS = [
  { label: "Budget-Friendly ($)", value: "$" },
  { label: "Moderate ($$)", value: "$$" },
  { label: "Upscale ($$$)", value: "$$$" },
  { label: "Luxury ($$$$)", value: "$$$$" },
  { label: "Free", value: "free" },
  { label: "Varies", value: "varies" },
] as const;

export function normalizeTagList(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item ?? "").trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function mergeTagLists(...inputs: unknown[]): string[] {
  return normalizeTagList(inputs.flatMap((input) => Array.isArray(input) ? input : String(input ?? "").split(",")));
}

function text(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(text);
  if (value && typeof value === "object") return [JSON.stringify(value)];
  const s = String(value ?? "").trim();
  return s ? [s] : [];
}

export function buildLocationSearchDocument(location: Record<string, unknown>): string {
  const parts = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.location_type,
    location.category,
    location.primary_category,
    location.cuisine,
    location.description,
    location.primary_tag,
    location.semantic_tags,
    location.best_for_tags,
    location.best_for,
    location.review_keywords,
    location.tags,
    location.search_keywords,
    location.intent_tags,
    location.vibe_tags,
    location.date_style_tags,
    location.special_features,
    location.semantic_search_text,
  ].flatMap(text);
  return mergeTagLists(parts.join(" ")).join(" ").slice(0, 12000);
}

export function profileUpdateWithSearchDocument(existing: Record<string, unknown>, updates: Record<string, unknown>) {
  const merged = { ...existing, ...updates };
  return { ...updates, search_document: buildLocationSearchDocument(merged) };
}
