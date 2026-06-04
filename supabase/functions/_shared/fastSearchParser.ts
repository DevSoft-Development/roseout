import { normalizeSearchQuery } from "./normalizeQuery.ts";

const STEAK_TERMS = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const MEAL_TERMS = ["dinner", "brunch", "lunch", "breakfast", "restaurant", "food", "eat", "date dinner", "casual dinner"];
const FOOD_TERMS = [...STEAK_TERMS, "sushi", "seafood", "italian", "mexican", "caribbean", "soul food", "pizza", "pasta", "burgers", "tacos", "wings", "halal", "vegan", "vegetarian", "bbq", "barbecue", "korean", "chinese", "thai", "indian", "mediterranean", "latin", "dominican", "jamaican"];
const ACTIVITY_ALIASES: Record<string, string[]> = {
  bowling: ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"],
  hookah: ["hookah", "hookah lounge"],
  nightlife: ["cocktails", "drinks", "lounge", "bar", "rooftop bar", "wine bar", "speakeasy", "nightlife", "hookah"],
  karaoke: ["karaoke"],
  spa: ["spa", "massage"],
  arcade: ["arcade"],
  comedy: ["comedy", "comedy club"],
  music: ["jazz", "live music"],
  museum: ["museum"],
  theater: ["theater", "theatre", "cinema", "movie theater", "movie theatre", "movie_theater", "movies", "showtimes", "box office", "performing arts", "performing_arts", "performance", "playhouse", "concert hall", "opera house", "movie", "show"],
  "paint and sip": ["paint and sip"],
  "escape room": ["escape room"],
  "pool hall": ["pool hall", "billiards"],
  "axe throwing": ["axe throwing"],
  "mini golf": ["mini golf"],
};
const ACTIVITY_CATEGORY_TERMS: Record<string, string[]> = {
  nightlife: ["nightlife"],
  theater: ["theater"],
};
const GEO: Record<string, Record<string, unknown>> = {
  astoria: { raw: "Astoria", neighborhood: "Astoria", city: "New York", borough: "Queens", county: "Queens County", region: null, state: "NY", aliases: ["Astoria", "astoria", "Queens", "New York", "Queens County", "NY"], latitude: 40.7644, longitude: -73.9235, radiusMiles: 3, geoStrictness: "strict" },
  "long island city": { raw: "Long Island City", neighborhood: "Long Island City", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7447, longitude: -73.9485, radiusMiles: 3, geoStrictness: "strict" },
  flushing: { raw: "Flushing", neighborhood: "Flushing", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7675, longitude: -73.8331, radiusMiles: 3, geoStrictness: "strict" },
  jamaica: { raw: "Jamaica", neighborhood: "Jamaica", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7027, longitude: -73.7890, radiusMiles: 3, geoStrictness: "strict" },
  brooklyn: { raw: "Brooklyn", city: "New York", borough: "Brooklyn", county: "Kings County", state: "NY", latitude: 40.6782, longitude: -73.9442, radiusMiles: 6, geoStrictness: "borough" },
  williamsburg: { raw: "Williamsburg", neighborhood: "Williamsburg", city: "New York", borough: "Brooklyn", state: "NY", latitude: 40.7081, longitude: -73.9571, radiusMiles: 3, geoStrictness: "strict" },
  bushwick: { raw: "Bushwick", neighborhood: "Bushwick", city: "New York", borough: "Brooklyn", state: "NY", latitude: 40.6958, longitude: -73.9171, radiusMiles: 3, geoStrictness: "strict" },
  "downtown brooklyn": { raw: "Downtown Brooklyn", neighborhood: "Downtown Brooklyn", city: "New York", borough: "Brooklyn", state: "NY", latitude: 40.6910, longitude: -73.9867, radiusMiles: 3, geoStrictness: "strict" },
  harlem: { raw: "Harlem", neighborhood: "Harlem", city: "New York", borough: "Manhattan", state: "NY", latitude: 40.8116, longitude: -73.9465, radiusMiles: 3, geoStrictness: "strict" },
  bronx: { raw: "Bronx", city: "New York", borough: "Bronx", state: "NY", latitude: 40.8448, longitude: -73.8648, radiusMiles: 6, geoStrictness: "borough" },
  manhattan: { raw: "Manhattan", city: "New York", borough: "Manhattan", state: "NY", latitude: 40.7831, longitude: -73.9712, radiusMiles: 6, geoStrictness: "borough" },
  queens: { raw: "Queens", city: "New York", borough: "Queens", county: "Queens County", state: "NY", latitude: 40.7282, longitude: -73.7949, radiusMiles: 7, geoStrictness: "borough" },
  "staten island": { raw: "Staten Island", city: "New York", borough: "Staten Island", state: "NY", latitude: 40.5795, longitude: -74.1502, radiusMiles: 7, geoStrictness: "borough" },
  "long island": { raw: "Long Island", region: "Long Island", state: "NY", latitude: 40.7891, longitude: -73.1350, radiusMiles: 20, geoStrictness: "region" },
  "nassau county": { raw: "Nassau County", county: "Nassau County", state: "NY", latitude: 40.6546, longitude: -73.5594, radiusMiles: 12, geoStrictness: "county" },
  "suffolk county": { raw: "Suffolk County", county: "Suffolk County", state: "NY", latitude: 40.9849, longitude: -72.6151, radiusMiles: 18, geoStrictness: "county" },
  yonkers: { raw: "Yonkers", city: "Yonkers", county: "Westchester County", state: "NY", latitude: 40.9312, longitude: -73.8988, radiusMiles: 5, geoStrictness: "city" },
  "jersey city": { raw: "Jersey City", city: "Jersey City", state: "NJ", latitude: 40.7178, longitude: -74.0431, radiusMiles: 5, geoStrictness: "city" },
  hoboken: { raw: "Hoboken", city: "Hoboken", state: "NJ", latitude: 40.7433, longitude: -74.0324, radiusMiles: 4, geoStrictness: "city" },
  newark: { raw: "Newark", city: "Newark", state: "NJ", latitude: 40.7357, longitude: -74.1724, radiusMiles: 6, geoStrictness: "city" },
  stamford: { raw: "Stamford", city: "Stamford", state: "CT", latitude: 41.0534, longitude: -73.5387, radiusMiles: 6, geoStrictness: "city" },
  "new rochelle": { raw: "New Rochelle", city: "New Rochelle", state: "NY", latitude: 40.9115, longitude: -73.7824, radiusMiles: 5, geoStrictness: "city" },
};

function includesTerm(query: string, term: string) { return new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}(\\s|$)`, "i").test(query); }
function matches(query: string, terms: string[]) { return terms.filter((term) => includesTerm(query, term)); }

export function normalizeIntent(intent: Record<string, unknown>): Record<string, unknown> {
  return { ...intent, parser_source: intent.parser_source ?? "fast_parser", confidence: Number(intent.confidence ?? 0) };
}

export function parserConfidence(intent: Record<string, unknown>): number { return Number(intent.confidence ?? 0); }

export function fastParseSearchIntent(rawQuery: string, options: Record<string, unknown> = {}): Record<string, unknown> {
  const query = normalizeSearchQuery(rawQuery);
  const mealTerms = matches(query, MEAL_TERMS);
  let foodTerms = matches(query, FOOD_TERMS);
  if (foodTerms.includes("steak")) foodTerms = Array.from(new Set([...foodTerms, ...STEAK_TERMS]));
  const matchedActivityEntries = Object.entries(ACTIVITY_ALIASES).map(([category, aliases]) => ({
    category,
    matchedAliases: matches(query, aliases),
  })).filter((entry) => entry.matchedAliases.length > 0);
  const activityTerms = Array.from(new Set(matchedActivityEntries.flatMap((entry) => [
    ...entry.matchedAliases,
    entry.category,
    ...(ACTIVITY_CATEGORY_TERMS[entry.category] ?? []),
  ])));
  const activityCategory = matchedActivityEntries.map(({ category }) => category);
  const geoKey = Object.keys(GEO).sort((a,b)=>b.length-a.length).find((key) => includesTerm(query, key));
  const connectors = ["with", "and", "after", "before", "then", "near", "nearby", "walking distance", "close by", "around"].filter((term) => includesTerm(query, term));
  const needsRestaurant = mealTerms.length > 0 || foodTerms.length > 0;
  const needsActivity = activityTerms.length > 0 || /activity|things to do|relaxed activity/.test(query);
  const requiresWalk = connectors.includes("walking distance");
  const wantsPairing = needsRestaurant && needsActivity;
  const confidence = wantsPairing && (foodTerms.length || mealTerms.length) && (activityTerms.length || /relaxed activity/.test(query)) ? 0.92 : needsRestaurant || needsActivity ? 0.8 : 0.45;
  return normalizeIntent({
    searchType: wantsPairing ? "mixed_outing" : needsRestaurant ? "restaurant" : needsActivity ? "activity" : "unknown",
    primaryDomain: wantsPairing ? "mixed" : needsRestaurant ? "restaurant" : needsActivity ? "activity" : "unknown",
    needsRestaurant, needsActivity, wantsPairing,
    sequence: /after|then/.test(query) ? "restaurant_then_activity" : null,
    restaurantIntent: { mealTerms, foodTerms, cuisineTerms: foodTerms.filter((term) => !STEAK_TERMS.includes(term)), categoryTerms: [], vibeTerms: /group night/.test(query) ? ["group night"] : [], featureTerms: [], negativeTerms: [] },
    activityIntent: { activityTerms, categoryTerms: activityCategory, vibeTerms: [ ...(/group night/.test(query) ? ["group night"] : []), ...(/relaxed/.test(query) ? ["relaxed"] : []) ], featureTerms: [], negativeTerms: [] },
    geo: geoKey ? GEO[geoKey] : { raw: options.area ?? null, radiusMiles: 5, geoStrictness: "default" },
    pairingPreference: { requiresPairing: wantsPairing, distanceMode: requiresWalk ? "walking" : "any", maxPairDistanceMiles: requiresWalk ? 1 : null, maxPairWalkingMinutes: requiresWalk ? 20 : null, requireWalkablePair: requiresWalk },
    partySize: null, vibe: /group night/.test(query) ? ["group night"] : [], strictness: confidence >= 0.9 ? "high" : "medium", parser_source: "fast_parser", confidence,
  });
}
