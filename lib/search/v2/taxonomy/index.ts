export type TaxonomyDomain = "restaurant" | "activity" | "nightlife" | "restaurant_category" | "cuisine" | "food" | "audience" | "occasion" | "feature" | "meal_period" | "vibe";
export type EvidenceField = "location_type" | "primary_category" | "categories" | "cuisines" | "food_terms" | "features" | "description" | "manual_override";
export interface CanonicalTaxonomyEntry {
  id: string; domain: TaxonomyDomain; aliases: readonly string[]; retrievalTerms: readonly string[];
  relatedCategories: readonly string[]; eligibleRoles: readonly string[]; evidenceRules: readonly EvidenceField[];
  exclusions: readonly string[]; incompatibleCategories: readonly string[]; audienceRestrictions: readonly string[];
  mealPeriods: readonly string[]; features: readonly string[];
}

const entry = (id: string, domain: TaxonomyDomain, aliases: readonly string[], options: Partial<Omit<CanonicalTaxonomyEntry, "id" | "domain" | "aliases" | "retrievalTerms">> = {}): CanonicalTaxonomyEntry => ({
  id, domain, aliases, retrievalTerms: [id.replaceAll("_", " "), ...aliases], relatedCategories: options.relatedCategories ?? [], eligibleRoles: options.eligibleRoles ?? [domain], evidenceRules: options.evidenceRules ?? ["categories", "primary_category"], exclusions: options.exclusions ?? [], incompatibleCategories: options.incompatibleCategories ?? [], audienceRestrictions: options.audienceRestrictions ?? [], mealPeriods: options.mealPeriods ?? [], features: options.features ?? [],
});

export const canonicalTaxonomy: readonly CanonicalTaxonomyEntry[] = [
  entry("restaurant", "restaurant", ["restaurant", "dining"]), entry("cafe", "restaurant_category", ["cafe", "coffee shop"], { incompatibleCategories: ["dinner"] }), entry("fast_casual", "restaurant_category", ["fast casual", "counter service"]), entry("fine_dining", "restaurant_category", ["fine dining", "upscale restaurant"]),
  entry("italian", "cuisine", ["italian", "trattoria"]), entry("mexican", "cuisine", ["mexican", "tacos"]), entry("sushi", "cuisine", ["sushi", "japanese sushi"]), entry("steakhouse", "cuisine", ["steakhouse", "steak dinner"]), entry("halal", "cuisine", ["halal"]), entry("vegan", "cuisine", ["vegan"]), entry("seafood", "cuisine", ["seafood", "lobster", "oyster"]),
  entry("chicken", "food", ["chicken", "fried chicken"]), entry("steak", "food", ["steak"]), entry("brunch_food", "food", ["brunch food", "pancakes"]),
  entry("bowling", "activity", ["bowling", "bowling alley"]),
  entry("karaoke", "activity", ["karaoke", "private karaoke", "sing along"]),
  entry("arcade", "activity", ["arcade", "gaming center", "gaming city", "immersive gamebox"]),
  entry("escape_room", "activity", ["escape room", "escape games", "komnata quest"]),
  entry("axe_throwing", "activity", ["axe throwing", "axe house", "axe range", "bury the hatchet"]),
  entry("paintball", "activity", ["paintball"]),
  entry("mini_golf", "activity", ["mini golf", "mini-golf"]),
  entry("golf", "activity", ["golf simulator", "indoor golf", "golf"]),
  entry("movie", "activity", ["movie", "cinema", "cinemas"]),
  entry("museum", "activity", ["museum", "exhibit", "exhibition"]),
  entry("gallery", "activity", ["gallery", "art gallery"]),
  entry("pottery", "activity", ["pottery", "clay studio", "ceramics"]),
  entry("cooking_class", "activity", ["cooking class", "cooking school", "culinary studio"]),
  entry("candle_making", "activity", ["candle making", "candle lab", "candle studio"]),
  entry("dance_class", "activity", ["dance studio", "dance class", "dance workshop"]),
  entry("spa", "activity", ["spa", "bathhouse", "sauna", "massage"]),
  entry("yoga", "activity", ["yoga", "hot yoga"]),
  entry("kayaking", "activity", ["kayak", "kayaking", "boathouse"]),
  entry("bike_rental", "activity", ["bike rental", "bicycle rental", "bike and scooter rentals"]),
  entry("ice_skating", "activity", ["ice rink", "ice pavilion", "skating rink", "rink"]),
  entry("park", "activity", ["park", "botanical garden"]), entry("billiards", "activity", ["billiards", "pool hall"]), entry("board_games", "activity", ["board games", "game cafe"]), entry("scenic_walk", "activity", ["scenic walk", "waterfront walk", "promenade"]), entry("paint_and_sip", "activity", ["paint and sip", "painting class"]), entry("theater", "activity", ["theater", "theatre", "show"]), entry("comedy", "activity", ["comedy", "comedy club"]), entry("live_music", "activity", ["live music", "concert"], { evidenceRules: ["categories", "features", "manual_override"] }),
  entry("bar", "nightlife", ["bar", "cocktail bar"], { audienceRestrictions: ["adult_only"] }), entry("lounge", "nightlife", ["lounge"]), entry("nightclub", "nightlife", ["nightclub", "dance club"], { audienceRestrictions: ["adult_only"] }),
  entry("breakfast", "meal_period", ["breakfast"]), entry("brunch", "meal_period", ["brunch"]), entry("lunch", "meal_period", ["lunch"]), entry("dinner", "meal_period", ["dinner", "dinner menu"], { evidenceRules: ["features", "manual_override"] }), entry("late_night", "meal_period", ["late night", "open late"]),
  entry("rooftop", "feature", ["rooftop", "roof deck"]), entry("cocktails", "feature", ["cocktails", "craft cocktails"]), entry("big_screens", "feature", ["big screens", "watch the game"]), entry("family_friendly", "feature", ["family friendly", "family-friendly"]), entry("casual", "feature", ["casual", "laid-back", "low-key"]), entry("outdoor_seating", "feature", ["outdoor seating", "patio"]),
  entry("family", "audience", ["family", "kids", "family friendly"], { incompatibleCategories: ["adult_only"] }), entry("teen", "audience", ["teen", "teenager"]), entry("adult_only", "audience", ["21+", "adults only"], { incompatibleCategories: ["family"] }),
  entry("date_night", "occasion", ["date night", "romantic"]), entry("girls_night", "occasion", ["girls night", "girls' night"]), entry("family_outing", "occasion", ["family outing"]),
  entry("relaxed", "vibe", ["relaxed", "chill", "low-key"]), entry("lively", "vibe", ["lively", "energetic"]), entry("romantic", "vibe", ["romantic", "intimate"]),
];

export const cuisines = Object.fromEntries(canonicalTaxonomy.filter((item) => item.domain === "cuisine").map((item) => [item.id, item.aliases])) as Readonly<Record<string, readonly string[]>>;
export const foods = Object.fromEntries(canonicalTaxonomy.filter((item) => item.domain === "food").map((item) => [item.id, item.aliases])) as Readonly<Record<string, readonly string[]>>;
export const features = Object.fromEntries(canonicalTaxonomy.filter((item) => item.domain === "feature").map((item) => [item.id, item.aliases])) as Readonly<Record<string, readonly string[]>>;
export const occasions = canonicalTaxonomy.filter((item) => item.domain === "occasion").map((item) => item.id);
export const audiences = canonicalTaxonomy.filter((item) => item.domain === "audience").map((item) => item.id);
export const activities = Object.fromEntries(canonicalTaxonomy.filter((item) => item.domain === "activity").map((item) => [item.id, { aliases: item.aliases, eligibleRoles: item.eligibleRoles }])) as Readonly<Record<string, { aliases: readonly string[]; eligibleRoles: readonly string[] }>>;

export function findTaxonomyMatches(input: string): CanonicalTaxonomyEntry[] { const normalized = input.toLowerCase(); return canonicalTaxonomy.filter((item) => item.aliases.some((alias) => normalized.includes(alias.toLowerCase()))); }
function aliasesOf(value: readonly string[] | { aliases: readonly string[] }): readonly string[] { return Array.isArray(value) ? value : (value as { aliases: readonly string[] }).aliases; }
export function matchTaxonomy<T extends Record<string, readonly string[] | { aliases: readonly string[] }>>(query: string, taxonomy: T): string[] { const normalized = query.toLowerCase(); return Object.entries(taxonomy).filter(([, value]) => aliasesOf(value).some((alias: string) => normalized.includes(alias.toLowerCase()))).map(([id]) => id); }
export function activityRetrievalTerms(category: string): readonly string[] { return canonicalTaxonomy.find((item) => item.id === category && item.domain === "activity")?.retrievalTerms ?? [category]; }

export function validateCanonicalTaxonomy(): string[] {
  const errors: string[] = []; const ids = new Set<string>(); const aliases = new Map<string, string>();
  for (const item of canonicalTaxonomy) { if (ids.has(item.id)) errors.push(`duplicate_id:${item.id}`); ids.add(item.id); if (!item.retrievalTerms.length) errors.push(`empty_retrieval_terms:${item.id}`); if (!item.eligibleRoles.length) errors.push(`missing_roles:${item.id}`); if (!item.evidenceRules.length) errors.push(`missing_evidence_fields:${item.id}`); for (const alias of item.aliases) { const owner = aliases.get(alias); if (owner && item.incompatibleCategories.includes(owner)) errors.push(`incompatible_alias:${alias}`); aliases.set(alias, item.id); } }
  for (const item of canonicalTaxonomy) for (const reference of [...item.relatedCategories, ...item.incompatibleCategories]) if (!ids.has(reference)) errors.push(`missing_reference:${item.id}:${reference}`);
  return errors;
}
