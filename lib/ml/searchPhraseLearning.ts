import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SearchIntent } from "@/lib/search/enterprise/types";

export type SuggestedIntent = Record<string, any>;
export type SearchPhraseMapping = {
  id?: string;
  phrase_key: string;
  display_phrase: string;
  match_type?: "exact" | "contains" | "semantic_key";
  priority?: number;
  approved_intent?: SuggestedIntent;
  activity_types?: string[];
  cuisines?: string[];
  vibes?: string[];
  occasions?: string[];
  exclusions?: string[];
  confidence_score?: number;
  support_score?: number;
  is_active?: boolean;
};

const FILLER = /\b(i want|i need|show me|find me|looking for|can you find|please|near me|somewhere|a place|places|spot|spots)\b/g;
const SYNONYMS: Array<[RegExp, string]> = [
  [/\blow[ -]?key\b/g, "lowkey"],
  [/\bdate\s+nights\b/g, "date night"],
  [/\bgirl'?s\s+night\b/g, "girls night"],
  [/\bnot\s+too\s+noisy\b/g, "not too loud"],
  [/\bcasual\s+but\s+nice\b/g, "casual but nice"],
];
const SIGNALS: Array<[string, RegExp]> = [
  ["something fun", /\bsomething fun\b|\bfun\b/], ["vibe", /\bvibes?\b/], ["cute", /\bcute\b/], ["chill", /\bchill\b/], ["lowkey", /\blowkey\b/], ["grown", /\bgrown\b/], ["romantic", /\bromantic\b/], ["not too loud", /\bnot too loud\b/], ["quiet", /\bquiet\b/], ["relaxed", /\brelaxed|laid back\b/], ["nice but not expensive", /\bnice but not expensive\b|\bnot expensive\b|\baffordable\b/], ["birthday", /\bbirthday\b/], ["girls night", /\bgirls night\b/], ["date night", /\bdate night\b/], ["family friendly", /\bfamily friendly\b|\bfamily\b/], ["good for pictures", /\bgood for pictures\b|\bpictures\b|\bphotos\b/], ["upscale", /\bupscale\b/], ["casual but nice", /\bcasual but nice\b/], ["after dinner", /\bafter dinner\b/], ["after brunch", /\bafter brunch\b/],
];
export function normalizeSearchPhrase(query: string): string {
  let q = String(query || "").toLowerCase().normalize("NFKD").replace(/[’']/g, "'").replace(/[^a-z0-9\s'&-]/g, " ");
  for (const [re, value] of SYNONYMS) q = q.replace(re, value);
  return q.replace(FILLER, " ").replace(/\s+/g, " ").trim();
}
export function getPhraseKey(query: string): string {
  let q = normalizeSearchPhrase(query);
  q = q.replace(/\b(i|we|us|me|my|our|the|to|for|with|and)\b/g, " ").replace(/\s+/g, " ").trim();
  const signals = detectVagueLanguageSignals(q);
  const anchors = ["dinner", "brunch", "lunch", "breakfast", "date night", "girls night", "birthday", "family", "pictures", "upscale", "quiet", "cute", "romantic", "fun", "vibe", "after dinner", "after brunch"].filter((t) => q.includes(t));
  return Array.from(new Set([...signals, ...anchors])).join("|") || q.slice(0, 120);
}
export function detectVagueLanguageSignals(query: string): string[] {
  const q = normalizeSearchPhrase(query);
  return SIGNALS.filter(([, re]) => re.test(q)).map(([label]) => label);
}
function uniq(values: any[]) { return Array.from(new Set(values.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim().toLowerCase()))); }
export function buildSuggestedIntentFromOutcomes(input: { phrase?: string; phraseKey?: string; exampleQueries?: string[]; clicks?: number; saves?: number; completions?: number; bounces?: number; resultCount?: number; }): SuggestedIntent {
  const text = normalizeSearchPhrase([input.phrase, ...(input.exampleQueries || [])].join(" "));
  const afterMeal = /after dinner|dinner/.test(text) ? "dinner" : /after brunch|brunch/.test(text) ? "brunch" : undefined;
  const date = /date night|romantic|cute/.test(text);
  const family = /family/.test(text);
  const quiet = /not too loud|quiet|relaxed|lowkey|chill/.test(text);
  return {
    searchType: afterMeal || /then|after|activity|something fun/.test(text) ? "mixed_outing" : date ? "paired_outing" : "any",
    needsRestaurant: Boolean(afterMeal || /dinner|brunch|restaurant/.test(text)),
    needsActivity: /fun|activity|after|then|vibe|date night|girls night|birthday/.test(text),
    wantsPairing: /after|then|date night|dinner|brunch/.test(text),
    pairingIntent: /same area|nearby|after|then/.test(text) ? "nearby_pair" : "auto",
    mealTerms: afterMeal ? [afterMeal] : [],
    activityTypes: family ? ["museum", "arcade", "bowling", "activity"] : date ? ["lounge", "wine bar", "dessert", "museum", "scenic", "cafe"] : ["lounge", "bowling", "comedy", "karaoke", "arcade", "rooftop", "live music"],
    cuisines: date ? ["italian", "sushi", "dessert", "wine bar", "cafe"] : [],
    vibes: uniq([date && "romantic", date && "cute", quiet && "quiet", quiet && "relaxed", /upscale/.test(text) && "upscale", /grown/.test(text) && "grown", /vibe/.test(text) && "vibe"]),
    occasions: uniq([date && "date night", /girls night/.test(text) && "girls night", /birthday/.test(text) && "birthday", family && "family friendly"]),
    exclusions: quiet ? ["loud", "nightclub", "club", "dance club"] : [],
  };
}
export function scorePhraseLearningCandidate(input: { queryCount?: number; clickCount?: number; saveCount?: number; completionCount?: number; bounceCount?: number; negativeOutcomeCount?: number; resultCount?: number; }): number {
  const impressions = Math.max(0, input.queryCount || 0) * 0.1;
  const score = impressions + (input.clickCount || 0) * 1.5 + (input.saveCount || 0) * 3 + (input.completionCount || 0) * 5 - (input.bounceCount || 0) * 1.25 - (input.negativeOutcomeCount || 0) * 2;
  return Math.max(0, Number(score.toFixed(2)));
}
export function matchApprovedMapping(query: string, mappings: SearchPhraseMapping[]): SearchPhraseMapping | null {
  const norm = normalizeSearchPhrase(query); const key = getPhraseKey(query);
  return mappings.filter((m) => m.is_active !== false).sort((a,b)=>(a.priority ?? 100)-(b.priority ?? 100)).find((m) => {
    const pk = m.phrase_key; const display = normalizeSearchPhrase(m.display_phrase || pk);
    if (m.match_type === "exact") return norm === display || key === pk;
    if (m.match_type === "semantic_key") return key === pk;
    return norm.includes(display) || key.includes(pk) || pk.includes(key);
  }) || null;
}
export async function getApprovedSearchPhraseMapping(query: string) {
  const { data, error } = await supabaseAdmin.from("search_phrase_learning_mappings").select("*").eq("is_active", true).order("priority", { ascending: true }).limit(100);
  if (error || !data) return null;
  return matchApprovedMapping(query, data as SearchPhraseMapping[]);
}
function appendUnique(existing: string[] = [], additions: string[] = []) { return Array.from(new Set([...existing, ...additions].filter(Boolean))); }
function hasExplicitAny(query: string, terms: string[]) { const q = normalizeSearchPhrase(query); return terms.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)); }
const ACTIVITY_EXPLICIT = ["bowling","karaoke","arcade","comedy","museum","rooftop","lounge","live music","mini golf","hookah"];
const CUISINE_EXPLICIT = ["italian","sushi","mexican","tacos","pizza","seafood","steak","steakhouse","thai","chinese","indian","brunch","dessert"];
export function applyApprovedSearchPhraseMapping(query: string, existingIntent: Partial<SearchIntent> = {}, mapping?: SearchPhraseMapping | null): Partial<SearchIntent> & { searchLearningApplied?: boolean; searchLearningPhraseKey?: string; searchLearningMappingId?: string; searchLearningConfidence?: number } {
  if (!mapping) return existingIntent as any;
  const approved = mapping.approved_intent || {};
  const explicitActivity = hasExplicitAny(query, ACTIVITY_EXPLICIT);
  const explicitCuisine = hasExplicitAny(query, CUISINE_EXPLICIT);
  const next: any = { ...existingIntent };
  next.searchType = next.searchType && next.searchType !== "any" ? next.searchType : approved.searchType || next.searchType;
  next.primaryDomain = next.primaryDomain && next.primaryDomain !== "any" ? next.primaryDomain : approved.primaryDomain || (approved.searchType === "mixed_outing" ? "mixed" : next.primaryDomain);
  next.needsRestaurant = Boolean(next.needsRestaurant || approved.needsRestaurant);
  next.needsActivity = Boolean(next.needsActivity || approved.needsActivity);
  next.wantsPairing = Boolean(next.wantsPairing || approved.wantsPairing);
  next.pairingIntent = next.pairingIntent || approved.pairingIntent;
  next.restaurantIntent = { ...(next.restaurantIntent || {}), mealTerms: appendUnique(next.restaurantIntent?.mealTerms, approved.mealTerms), cuisineTerms: explicitCuisine ? (next.restaurantIntent?.cuisineTerms || []) : appendUnique(next.restaurantIntent?.cuisineTerms, mapping.cuisines || approved.cuisines), vibeTerms: appendUnique(next.restaurantIntent?.vibeTerms, mapping.vibes || approved.vibes), negativeTerms: appendUnique(next.restaurantIntent?.negativeTerms, mapping.exclusions || approved.exclusions) };
  next.activityIntent = { ...(next.activityIntent || {}), activityTerms: explicitActivity ? (next.activityIntent?.activityTerms || []) : appendUnique(next.activityIntent?.activityTerms, mapping.activity_types || approved.activityTypes), vibeTerms: appendUnique(next.activityIntent?.vibeTerms, mapping.vibes || approved.vibes), negativeTerms: appendUnique(next.activityIntent?.negativeTerms, mapping.exclusions || approved.exclusions) };
  next.vibe = appendUnique(next.vibe, mapping.vibes || approved.vibes);
  next.occasion = next.occasion || (mapping.occasions?.[0] ?? approved.occasions?.[0] ?? null);
  next.searchLearningApplied = true; next.searchLearningPhraseKey = mapping.phrase_key; next.searchLearningMappingId = mapping.id; next.searchLearningConfidence = Number(mapping.confidence_score || 0);
  return next;
}
