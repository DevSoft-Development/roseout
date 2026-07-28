export type TaxonomyEntry = Readonly<{ aliases: readonly string[]; eligibleRoles?: readonly string[]; childCategories?: readonly string[] }>;

export const cuisines = { sushi: ["sushi", "sushi restaurant"], steakhouse: ["steak", "steakhouse"], italian: ["italian"], mexican: ["mexican", "tacos"], halal: ["halal"], vegan: ["vegan"], seafood: ["seafood", "lobster", "oyster"] } as const;
export const foods = { chicken: ["chicken", "fried chicken"], steak: ["steak"], sushi: ["sushi"], brunch: ["brunch"] } as const;
export const activities: Readonly<Record<string, TaxonomyEntry>> = {
  karaoke: { aliases: ["karaoke", "private karaoke", "karaoke lounge", "sing along"], eligibleRoles: ["karaoke_activity"] },
  sports_watch: { aliases: ["sports bar", "watch the game", "watch the knicks", "big screens", "live sports", "watch party"], eligibleRoles: ["sports_watch_activity"] },
  hookah: { aliases: ["hookah", "hookah lounge", "hookah bar", "shisha", "shisha lounge"], eligibleRoles: ["hookah_activity"] },
  rooftop: { aliases: ["rooftop", "roof deck", "rooftop drinks"], eligibleRoles: ["rooftop_activity"] },
  bowling: { aliases: ["bowling", "bowling alley"], eligibleRoles: ["bowling_activity"] },
  arcade: { aliases: ["arcade", "gaming center", "gaming city"], eligibleRoles: ["arcade_activity"] },
  museum: { aliases: ["museum", "exhibit", "exhibition"], eligibleRoles: ["museum_activity"] },
  gallery: { aliases: ["gallery", "art gallery"], eligibleRoles: ["gallery_activity"] },
  park: { aliases: ["park", "botanical garden", "garden"], eligibleRoles: ["relaxed_activity"] },
  billiards: { aliases: ["billiards", "pool hall", "shoot pool"], eligibleRoles: ["relaxed_activity"] },
  board_games: { aliases: ["board games", "board game cafe", "game cafe"], eligibleRoles: ["relaxed_activity"] },
  scenic_walk: { aliases: ["scenic walk", "waterfront walk", "promenade", "scenic"], eligibleRoles: ["relaxed_activity"] },
  paint_and_sip: { aliases: ["paint and sip", "paint & sip", "painting class"], eligibleRoles: ["relaxed_activity"] },
  theater: { aliases: ["theater", "theatre", "show"], eligibleRoles: ["theater_activity"] },
  comedy: { aliases: ["comedy", "comedy show", "comedy club"], eligibleRoles: ["comedy_activity"] },
  mini_golf: { aliases: ["mini golf", "mini-golf"], eligibleRoles: ["mini_golf_activity"] },
  live_music: { aliases: ["live music", "concert"], eligibleRoles: ["live_music_activity"] },
  dancing: { aliases: ["dancing", "dance floor"], eligibleRoles: ["general_activity"] },
  relaxed_activity: {
    aliases: ["relaxed activity", "relaxing activity", "chill activity", "low-key activity", "laid-back activity"],
    childCategories: ["museum", "gallery", "park", "billiards", "board_games", "scenic_walk", "paint_and_sip"],
    eligibleRoles: ["relaxed_activity"],
  },
};
export const features = {
  rooftop: ["rooftop", "roof deck"],
  cocktails: ["cocktails"],
  big_screens: ["big screens"],
  family_friendly: ["family-friendly", "family friendly"],
  casual: ["casual", "laid-back", "low-key", "relaxed dinner"],
} as const;
export const occasions = ["date_night", "girls_night", "family_outing"] as const;
export const audiences = ["family", "teen", "adult_only"] as const;

export function matchTaxonomy<T extends Record<string, readonly string[] | TaxonomyEntry>>(query: string, taxonomy: T): string[] {
  const normalized = query.toLowerCase();
  return Object.entries(taxonomy).filter(([, entry]) => { const values: readonly string[] = Array.isArray(entry) ? entry as readonly string[] : (entry as TaxonomyEntry).aliases; return values.some((alias: string) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(normalized)); }).map(([key]) => key);
}
export function activityRetrievalTerms(category: string): readonly string[] { const entry = activities[category]; if (!entry) return [category]; if (entry.childCategories) return [category, ...entry.childCategories.flatMap((child) => activities[child]?.aliases ?? [child])]; return entry.aliases; }
