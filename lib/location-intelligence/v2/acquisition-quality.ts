/** Zero-provider-spend screen. Unknown categories are quarantined, never silently rejected. */
export type Candidate = { name?: string | null; category?: string | null; primary_category?: string | null; state?: string | null; google_place_id?: string | null; normalized_address?: string | null; claimed?: boolean | null };
export type QualityDecision = { action: "accept" | "reject" | "quarantine" | "duplicate" | "protected"; reason: string };
const EXCLUDED_BRANDS = ["mcdonalds","burger king","wendys","taco bell","kfc","subway","dunkin","popeyes","chipotle","five guys","chick fil a"];
const EXCLUDED_CATEGORIES = ["gas station","convenience store","supermarket","grocery store","pharmacy","car wash","fast food restaurant","fast food","department store"];
const ALLOWED = ["restaurant","bar","lounge","nightclub","cafe","coffee shop","bakery","museum","theater","art gallery","amusement","entertainment","escape room","bowling","live music","attraction","activity","experience","wine bar","cocktail"];
const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[’\u0027]/g,"").replace(/[^a-z0-9]+/g," ").trim();
export function screenAcquisitionCandidate(candidate: Candidate, knownKeys: ReadonlySet<string> = new Set()): QualityDecision {
  if (candidate.claimed) return {action:"protected",reason:"claimed_location"};
  const name = normalize(candidate.name || "");
  const category = normalize(candidate.primary_category || candidate.category || "");
  const state = String(candidate.state || "").trim().toUpperCase();
  if (state && !["NY","NJ","CT"].includes(state)) return {action:"reject",reason:"outside_market"};
  if (!name) return {action:"quarantine",reason:"missing_name"};
  const key = candidate.google_place_id ? "google:"+candidate.google_place_id : "name_address:"+name+"|"+normalize(candidate.normalized_address || "");
  if (knownKeys.has(key)) return {action:"duplicate",reason:"existing_identity"};
  if (EXCLUDED_BRANDS.some(brand => name === brand || name.startsWith(brand+" "))) return {action:"reject",reason:"excluded_fast_food_brand"};
  if (EXCLUDED_CATEGORIES.some(value => category === value || category.includes(value))) return {action:"reject",reason:"excluded_category"};
  if (!category) return {action:"quarantine",reason:"missing_category"};
  if (!ALLOWED.some(value => category.includes(value))) return {action:"quarantine",reason:"unknown_category"};
  return {action:"accept",reason:"eligible_category"};
}
