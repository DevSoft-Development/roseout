import type { ActivityIntent, EnterpriseLocation, RestaurantIntent } from "./types";

const uniq = (items: string[]) => Array.from(new Set(items.map((x) => x.toLowerCase().trim()).filter(Boolean)));
export const includesPhrase = (query: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(query);

export const MEAL_SYNONYMS: Record<string, string[]> = {
  breakfast: ["breakfast"], brunch: ["brunch", "eggs benedict", "pancakes", "waffles", "mimosa", "bottomless brunch", "breakfast"], lunch: ["lunch"], dinner: ["dinner", "restaurant", "dining"], "late night": ["late night"], dessert: ["dessert", "cake", "bakery", "pastries", "ice cream", "gelato", "sweets", "chocolate"], coffee: ["coffee", "cafe", "espresso", "latte", "cappuccino", "coffee shop"], drinks: ["drinks", "cocktails"], "happy hour": ["happy hour"], "date night": ["date night", "romantic"], "romantic dinner": ["romantic dinner", "romantic"], "quick bite": ["quick bite"], "casual dinner": ["casual dinner"], "fine dining": ["fine dining"], "group dinner": ["group dinner"], "birthday dinner": ["birthday dinner"], "girls night": ["girls night"], "business dinner": ["business dinner"]
};

export const FOOD_SYNONYMS: Record<string, string[]> = {
  steak: ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"],
  seafood: ["seafood", "fish", "lobster", "crab", "shrimp", "oyster", "oysters", "raw bar", "clam", "mussels", "scallops"],
  sushi: ["sushi", "sashimi", "omakase", "nigiri", "maki", "rolls", "japanese sushi"],
  italian: ["italian", "pasta", "pizza", "trattoria", "osteria", "ristorante"],
  mexican: ["mexican", "tacos", "taco", "burritos", "birria", "tequila", "taqueria", "tex-mex"],
  caribbean: ["caribbean", "jamaican", "jerk", "oxtail", "curry goat", "roti", "doubles", "patties", "trinidadian", "haitian", "dominican", "puerto rican", "cuban"],
  rooftop: ["rooftop", "roof top", "terrace", "patio", "outdoor dining", "skyline", "city views", "scenic views", "view", "roof deck"],
  american: ["american", "new american", "southern", "soul food"], latin: ["latin", "colombian", "peruvian", "brazilian", "argentinian"], mediterranean: ["mediterranean", "greek", "turkish", "lebanese", "middle eastern", "israeli", "moroccan"], french: ["french"], spanish: ["spanish", "tapas"], portuguese: ["portuguese"], german: ["german"], irish: ["irish"], british: ["british"], indian: ["indian"], pakistani: ["pakistani"], bangladeshi: ["bangladeshi"], nepalese: ["nepalese"], thai: ["thai"], vietnamese: ["vietnamese"], chinese: ["chinese", "cantonese", "szechuan", "sichuan", "shanghainese", "taiwanese", "dim sum", "hot pot"], korean: ["korean"], japanese: ["japanese", "ramen", "izakaya", "teppanyaki", "hibachi"], filipino: ["filipino"], indonesian: ["indonesian"], malaysian: ["malaysian"], singaporean: ["singaporean"], african: ["african", "nigerian", "ethiopian", "senegalese", "ghanaian", "south african"], vegan: ["vegan", "plant-based"], vegetarian: ["vegetarian"], "gluten-free": ["gluten-free"], kosher: ["kosher"], halal: ["halal"], bbq: ["bbq", "barbecue"], burger: ["burger"], chicken: ["chicken", "wings", "fried chicken"], bakery: ["bakery"], cafe: ["cafe"], "wine bar": ["wine bar"], "cocktail bar": ["cocktail bar"], lounge: ["lounge restaurant"]
};

export const ACTIVITY_SYNONYMS: Record<string, string[]> = {
  bowling: ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"],
  karaoke: ["karaoke"],
  hookah: ["hookah", "hookah lounge"],
  "live music": ["live music", "concert", "jazz club", "open mic"],
  museum: ["museum", "exhibit", "exhibition", "cultural center"],
  lounge: ["lounge", "bar", "cocktail bar", "rooftop lounge", "speakeasy"],
  nightlife: ["nightlife", "night club", "club", "dance club", "dancing", "live dj", "dj"],
  drinks: [
    "drinks",
    "cocktails",
    "cocktail bar",
    "bar",
    "wine bar",
    "lounge",
    "speakeasy",
  ],
  "girls night": [
    "girls night",
    "girls' night",
  ],
  "relaxed activity": [
    "relaxed activity",
    "chill activity",
    "easy activity",
    "low key",
    "low-key",
    "lounge",
    "dessert",
    "coffee",
    "board games",
    "arcade",
    "mini golf",
    "bowling",
    "gallery",
  ],
  comedy: ["comedy club"],
  "wine tasting": ["wine tasting"],
  brewery: ["brewery", "beer garden"],
  arcade: ["arcade", "games"],
  "mini golf": ["mini golf"],
  billiards: ["pool hall", "billiards"],
  darts: ["darts"],
  "axe throwing": ["axe throwing"],
  "escape room": ["escape room"],
  vr: ["vr", "virtual reality", "immersive experience"],
  trivia: ["trivia"],
  "board games": ["board games"],
  "paint and sip": ["paint and sip", "sip and paint"],
  pottery: ["pottery"],
  "cooking class": ["cooking class"],
  "dance class": ["dance class"],
  movies: ["movie theater", "cinema", "movie", "movies"],
  theater: ["theater", "theatre", "broadway", "off-broadway", "show", "play", "musical"],
  gallery: ["art gallery", "gallery"],
  poetry: ["poetry"],
  bookstore: ["bookstore", "library event"],
  park: ["park", "waterfront", "pier", "beach", "boardwalk", "garden", "botanical garden", "zoo", "aquarium", "boat ride", "cruise", "rooftop view", "observation deck", "walking tour", "sightseeing"],
  spa: ["spa", "massage", "sauna", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"],
  sports: ["skating", "roller skating", "ice skating", "basketball", "golf", "driving range", "batting cages", "climbing", "rock climbing", "gym", "sports bar"],
  shopping: ["mall", "shopping", "market", "flea market", "pop-up", "festival", "fair"],
};

export const FOOD_TERMS = uniq(Object.values(FOOD_SYNONYMS).flat());
export const MEAL_TERMS = uniq(Object.values(MEAL_SYNONYMS).flat());
export const ACTIVITY_TERMS = uniq(Object.values(ACTIVITY_SYNONYMS).flat());

function detectFromMap(query: string, map: Record<string, string[]>) {
  const q = query.toLowerCase();
  return uniq(Object.entries(map).flatMap(([canonical, terms]) => terms.some((term) => includesPhrase(q, term)) ? [canonical, ...terms.filter((term) => includesPhrase(q, term))] : []));
}
export function detectFoodTerms(query: string) { return detectFromMap(query, FOOD_SYNONYMS); }
export function detectCuisineTerms(query: string) { return detectFoodTerms(query).filter((t) => !["rooftop"].includes(t)); }
export function detectMealTerms(query: string) { return detectFromMap(query, MEAL_SYNONYMS); }
export function detectActivityTerms(query: string) {
  const q = query.toLowerCase();
  const hasExplicitRelaxedActivity =
    includesPhrase(q, "relaxed activity") ||
    includesPhrase(q, "chill activity") ||
    includesPhrase(q, "easy activity") ||
    includesPhrase(q, "low key") ||
    includesPhrase(q, "low-key");
  const relaxedActivityTerms = new Set([
    "relaxed activity",
    "chill activity",
    "easy activity",
    "low key",
    "low-key",
  ]);
  const terms = detectFromMap(query, ACTIVITY_SYNONYMS).filter(
    (term) => hasExplicitRelaxedActivity || !relaxedActivityTerms.has(term),
  );

  if (includesPhrase(q, "things to do") || includesPhrase(q, "fun things")) {
    terms.push("things to do", "activity");
  }

  if (hasExplicitRelaxedActivity) {
    terms.push(
      "relaxed activity",
      "lounge",
      "board games",
      "arcade",
      "mini golf",
      "bowling",
      "gallery",
    );
  }

  if (includesPhrase(q, "girls night") || includesPhrase(q, "girls' night")) {
    terms.push("girls night");
  }

  if (includesPhrase(q, "drinks") || includesPhrase(q, "cocktails")) {
    terms.push("drinks", "cocktails");
  }

  if (includesPhrase(q, "bowl") && /(lane|game|entertainment|alley|bowling|activity)/i.test(q)) {
    terms.push("bowling");
  }

  return uniq(terms);
}
export function expandFoodSynonyms(terms: string[]) { return uniq(terms.flatMap((term) => FOOD_SYNONYMS[term.toLowerCase()] ?? [term])); }
export function expandActivitySynonyms(terms: string[]) { return uniq(terms.flatMap((term) => ACTIVITY_SYNONYMS[term.toLowerCase()] ?? [term])); }
export function isSpecificFoodIntent(intent: RestaurantIntent) { return intent.foodTerms.length > 0 || intent.cuisineTerms.length > 0 || intent.categoryTerms.some((t) => !["restaurant", "dining"].includes(t)); }
export function isGenericMealIntent(intent: RestaurantIntent) { return !isSpecificFoodIntent(intent) && intent.mealTerms.length > 0; }
export function isSpecificActivityIntent(intent: ActivityIntent) { return intent.activityTerms.some((t) => !["things to do", "activity"].includes(t)) || intent.categoryTerms.length > 0; }
export function textForRecord(record: EnterpriseLocation) { return [record.name, record.restaurant_name, record.activity_name, record.location_type, record.primary_category, record.cuisine, record.cuisine_type, record.activity_type, record.description, record.neighborhood, record.borough, record.city, record.state, record.search_document, record.semantic_search_text, record.tags, record.vibe_tags, record.best_for_tags, record.date_style_tags, record.search_keywords, record.google_types, record.semantic_tags, record.intent_tags].flat().join(" ").toLowerCase(); }
export function termMatchesRecord(record: EnterpriseLocation, terms: string[]) { const text = textForRecord(record); return terms.some((term) => includesPhrase(text, term) || text.includes(term.toLowerCase())); }
export function activityTermMatches(record: EnterpriseLocation, terms: string[]) { return termMatchesRecord(record, terms); }
export const PLACE_OF_WORSHIP_TERMS = [
  "temple",
  "hindu temple",
  "church",
  "chapel",
  "cathedral",
  "mosque",
  "masjid",
  "synagogue",
  "shul",
  "place of worship",
  "religious organization",
  "religious center",
  "worship center",
  "spiritual center",
  "shrine",
  "mission",
  "ministry",
  "parish",
  "congregation",
];

export const NON_RESTAURANT_CATEGORY_TERMS = [
  ...PLACE_OF_WORSHIP_TERMS,
  "theater",
  "theatre",
  "performing arts",
  "movie theater",
  "cinema",
  "museum",
  "gallery",
  "art gallery",
  "park",
  "garden",
  "botanical garden",
  "zoo",
  "aquarium",
  "bowling",
  "bowling alley",
  "arcade",
  "escape room",
  "karaoke",
  "night club",
  "dance club",
  "club",
  "event venue",
  "auditorium",
  "stadium",
  "arena",
  "library",
  "bookstore",
  "spa",
  "gym",
  "fitness",
];

export const RESTAURANT_CATEGORY_TERMS = [
  "restaurant",
  "restaurants",
  "dining",
  "food",
  "eatery",
  "cafe",
  "coffee",
  "bakery",
  "brunch",
  "breakfast",
  "lunch",
  "dinner",
  "steakhouse",
  "seafood",
  "sushi",
  "italian",
  "mexican",
  "caribbean",
  "american",
  "latin",
  "mediterranean",
  "french",
  "spanish",
  "indian restaurant",
  "thai restaurant",
  "chinese restaurant",
  "japanese restaurant",
  "korean restaurant",
  "bar and grill",
  "grill",
  "bistro",
  "tavern",
  "gastropub",
  "wine bar",
  "cocktail bar",
  "lounge restaurant",
];

export function hasAnyTerm(text: string, terms: string[]) {
  const normalized = String(text || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  return terms.some((term) => {
    const t = term.toLowerCase();
    return includesPhrase(normalized, t) || normalized.includes(t);
  });
}

export function userAskedForPlaceOfWorship(query: string) {
  const normalized = String(query || "").toLowerCase();

  if (
    /\b(dinner|restaurant|restaurants|dining|brunch|lunch|breakfast|food)\b/.test(normalized) &&
    /\b(near|nearby|by|around|close to)\b/.test(normalized) &&
    hasAnyTerm(normalized, PLACE_OF_WORSHIP_TERMS)
  ) {
    return false;
  }

  return hasAnyTerm(query, PLACE_OF_WORSHIP_TERMS);
}

export const createEmptyRestaurantIntent = (): RestaurantIntent => ({ mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] });
export const createEmptyActivityIntent = (): ActivityIntent => ({ activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] });
