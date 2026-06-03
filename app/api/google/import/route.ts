import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { clampScore } from "@/lib/clampScore";
import { getLocationScore, getSearchRankingScore } from "@/lib/locationScore";
import { getLocationName } from "@/lib/locationName";
import { getCuisine, getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import {
  balanceSmartMatches,
  getSmartMatchVersion,
} from "@/lib/theouthavenSmartMatchEngine";
import { parseSearchIntent as parseCanonicalSearchIntent } from "@/lib/searchIntent";
import { isPublicSearchVisible as sharedIsPublicSearchVisible } from "@/lib/locationVisibility";
import {
  applyLowLevelPenalty,
  hasPublicPhoto,
  isLowLevelLocation,
  isQualifiedWellnessActivity,
  isUnverifiedNycRestaurant,
  isWellnessActivity,
  userExplicitlyAskedForLowLevel,
} from "@/lib/search/lowLevel";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const AI_MODEL = "gpt-4o-mini";

const RESTAURANT_SEARCH_COLUMNS =
  "id, name, restaurant_name, location_type, primary_category, cuisine, cuisine_type, food_type, address, city, state, zip_code, neighborhood, latitude, longitude, description, price_range, rating, review_count, main_image, image_url, images, phone, website, instagram_url, external_reservation_url, reservation_url, reservation_link, google_maps_url, google_types, tags, vibe_tags, best_for_tags, primary_tag, best_for, search_keywords, review_keywords, quality_score, popularity_score, trend_score, conversion_score, review_score, theouthaven_score, roseout_score, ranking_badge, is_searchable, data_status, missing_fields, is_hidden, status, reservation_enabled, operating_hours, special_hours, holiday_closures, is_claimed, is_verified, is_featured, last_quality_check_at, quality_status, duplicate_status, has_photos, photo_status, is_low_level, low_level_reason, low_level_detected_at, low_level_source, public_visibility_tier, import_confidence, source_quality_status, curation_tier, main_image, image_url, source, source_table, import_source";

const ACTIVITY_SEARCH_COLUMNS =
  "id, name, activity_name, location_type, primary_category, activity_type, address, city, state, zip_code, neighborhood, latitude, longitude, description, price_range, rating, review_count, main_image, image_url, images, phone, website, instagram_url, external_reservation_url, reservation_url, reservation_link, google_maps_url, google_types, tags, vibe_tags, best_for_tags, primary_tag, best_for, search_keywords, review_keywords, quality_score, popularity_score, trend_score, conversion_score, review_score, theouthaven_score, roseout_score, ranking_badge, is_searchable, data_status, missing_fields, is_hidden, status, reservation_enabled, operating_hours, special_hours, holiday_closures, is_claimed, is_verified, is_featured, last_quality_check_at, quality_status, duplicate_status, has_photos, photo_status, is_low_level, low_level_reason, low_level_detected_at, low_level_source, public_visibility_tier, import_confidence, source_quality_status, curation_tier, main_image, image_url, source, source_table, import_source";

const CACHE_HOURS = 6;

const OFF_TOPIC_REPLY =
  "I can only help with TheOutHaven outing plans, restaurants, activities, nightlife, brunch, and date ideas.";

const LOCATION_NAME_MATCH_WEIGHT = 500;

const FOOD_KEYWORDS = [
  "food",
  "eat",
  "restaurant",
  "restaurants",
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "birthday dinner",
  "birthday brunch",
  "birthday restaurant",
  "steak",
  "steakhouse",
  "pizza",
  "burger",
  "seafood",
  "sushi",
  "ramen",
  "pasta",
  "italian",
  "mexican",
  "chinese",
  "thai",
  "indian",
  "mediterranean",
  "greek",
  "spanish",
  "bbq",
  "barbecue",
  "caribbean",
  "jamaican",
  "soul food",
  "african",
  "wine",
  "cocktail",
  "cocktails",
  "drinks",
  "bar",
  "rooftop",
  "lounge",
  "dessert",
  "coffee",
  "cafe",
  "hookah",
  "shisha",
  "cigar",
];

const ACTIVITY_KEYWORDS = [
  "activity",
  "activities",
  "date ideas",
  "birthday activities",
  "bowling",
  "arcade",
  "museum",
  "karaoke",
  "karoke",
  "karoake",
  "escape",
  "escape room",
  "mini golf",
  "miniature golf",
  "minigolf",
  "golf",
  "topgolf",
  "driving range",
  "axe",
  "axe throwing",
  "paintball",
  "paint and sip",
  "sip and paint",
  "sip & paint",
  "paint n sip",
  "comedy",
  "movie",
  "movies",
  "spa",
  "games",
  "game night",
  "pool",
  "billiards",
  "jazz",
  "live music",
  "nightclub",
  "night club",
  "dance club",
];

const TAG_KEYWORDS: Record<string, string[]> = {
  birthday_dinner: ["birthday dinner", "birthday restaurant"],
  birthday_brunch: ["birthday brunch"],
  birthday: ["birthday", "celebrate", "celebration"],
  romantic: ["romantic", "date night", "intimate", "cozy", "anniversary"],
  fun: ["fun", "exciting", "games", "interactive", "competitive"],
  luxury: ["luxury", "upscale", "classy", "fine dining", "elegant"],
  chill: ["chill", "relaxed", "quiet", "laid back", "low key", "low-key"],
  nightlife: ["nightlife", "lounge", "drinks", "cocktails", "music", "bar"],
  rooftop: ["rooftop", "roof top"],
  scenic: ["view", "skyline", "waterfront", "scenic"],
};

const FOOD_INTENTS: Record<string, string[]> = {
  steak: ["steak", "steakhouse"],
  seafood: ["seafood", "fish", "lobster", "crab", "shrimp"],
  italian: ["italian", "pasta"],
  mexican: ["mexican", "taco", "tacos"],
  chinese: ["chinese", "szechuan", "sichuan", "cantonese", "dim sum", "hot pot"],
  japanese: ["japanese", "sushi", "ramen", "izakaya"],
  korean: ["korean", "kbbq", "korean bbq"],
  thai: ["thai"],
  asian: ["asian", "pan asian", "asian fusion"],
  caribbean: ["caribbean", "jamaican"],
  soul_food: ["soul food"],
  african: ["african"],
  mediterranean: ["mediterranean", "greek"],
  brunch: ["brunch"],
  breakfast: ["breakfast"],
  cafe: ["cafe", "coffee"],
  dessert: ["dessert", "ice cream", "bakery", "cake"],
  drinks: ["drinks", "cocktail", "cocktails", "wine", "bar"],
  rooftop: ["rooftop", "roof top", "view", "skyline"],
  lounge: ["lounge"],
  hookah: ["hookah", "shisha", "hookah lounge", "hookah restaurant"],
  cigar: ["cigar", "cigar lounge", "cigar bar", "cigar friendly"],
  burger: ["burger"],
  pizza: ["pizza"],
};

const ACTIVITY_INTENTS: Record<string, string[]> = {
  bowling: ["bowling", "bowl", "bowling alley"],
  arcade: ["arcade", "games", "game room", "amusement"],
  museum: ["museum", "gallery", "art", "exhibit", "exhibits"],
  karaoke: [
    "karaoke",
    "karoke",
    "karoake",
    "singing",
    "karaoke bar",
    "private karaoke",
    "karaoke room",
  ],
  escape_room: ["escape room", "escape"],
  mini_golf: ["mini golf", "miniature golf", "minigolf"],
  golf: ["golf", "topgolf", "driving range", "indoor golf"],
  axe_throwing: ["axe throwing", "axe"],
  paintball: ["paintball"],
  paint_and_sip: [
    "paint and sip",
    "sip and paint",
    "sip & paint",
    "paint n sip",
    "paint sip",
    "painting",
  ],
  comedy: ["comedy", "stand up", "stand-up", "comedy club"],
  movie: ["movie", "movies", "cinema", "theater"],
  nightclub: ["nightclub", "night club", "dance club", "club"],
  hookah: ["hookah", "shisha", "hookah lounge", "hookah restaurant"],
  cigar: ["cigar", "cigar lounge", "cigar bar", "cigar friendly"],
  lounge: ["lounge"],
  rooftop: ["rooftop", "roof top", "skyline", "view"],
  live_music: ["live music", "jazz", "music venue"],
  spa: ["spa", "massage", "wellness", "head spa", "float spa", "yoga spa", "recovery spa"],
  pool: ["pool", "billiards", "billiard"],
};

const PRIORITY_WEIGHTS = {
  foodExact: 320,
  activityExact: 320,
  tagExact: 140,
  vibeExact: 120,
  keyword: 18,
  phrase: 40,
  mismatchPenalty: -70,
  birthday: 170,
  rooftop: 160,
  nightlife: 150,
  budget: 130,
  distance: 140,
};

const FOOD_ADD_ON_INTENTS = new Set(["dessert", "cafe", "drinks"]);
const LOUNGE_ACTIVITY_INTENTS = new Set(["hookah", "cigar"]);

function isFoodAddOnIntent(foodIntent: string) {
  return FOOD_ADD_ON_INTENTS.has(foodIntent);
}

function isLoungeActivityIntent(foodIntent: string) {
  return LOUNGE_ACTIVITY_INTENTS.has(foodIntent);
}

function hasRealMealFoodIntent(foodIntents: string[]) {
  return foodIntents.some(
    (foodIntent) =>
      !isFoodAddOnIntent(foodIntent) && !isLoungeActivityIntent(foodIntent)
  );
}

function getMealFoodIntents(foodIntents: string[]) {
  const hasMealIntent = hasRealMealFoodIntent(foodIntents);

  return foodIntents.filter((foodIntent) => {
    if (isFoodAddOnIntent(foodIntent)) return false;
    if (hasMealIntent && isLoungeActivityIntent(foodIntent)) return false;
    return true;
  });
}

function getAddOnFoodIntents(foodIntents: string[]) {
  const hasMealIntent = hasRealMealFoodIntent(foodIntents);

  return foodIntents.filter((foodIntent) => {
    if (isFoodAddOnIntent(foodIntent)) return true;
    if (hasMealIntent && isLoungeActivityIntent(foodIntent)) return true;
    return false;
  });
}

function normalizeQuery(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s$.-]/g, " ")
    .replace(/\s+/g, " ");
}

type SearchDiagnostics = {
  stage: string;
  notes: string[];
  errors: string[];
  removedLowLevelCount?: number;
  removedUnverifiedNycCount?: number;
  allowLowLevel?: boolean;
  lowLevelAllowedBecauseUserAsked?: boolean;
  lowLevelReasons?: Record<string, number>;
};

function createSearchDiagnostics(): SearchDiagnostics {
  return { stage: "started", notes: [], errors: [] };
}

function logSearchDiagnostics(diagnostics: SearchDiagnostics) {
  const safeDiagnostics =
    process.env.NODE_ENV === "production"
      ? {
          stage: diagnostics.stage,
          notes: diagnostics.notes,
          errors: diagnostics.errors,
        }
      : diagnostics;

  console.log(
    "THEOUTHAVEN_IMPORT_DIAGNOSTICS",
    JSON.stringify(safeDiagnostics, null, 2)
  );
}

async function logSearchQuery(input: string) {
  const query = normalizeQuery(input);

  if (!query || query.length < 3) return;

  try {
    await supabase.from("search_logs").insert({
      query,
    });
  } catch (error) {
    console.error("SEARCH LOG ERROR:", error);
  }
}

function toArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function itemText(item: any) {
  return [
    item.location_type,
    item.restaurant_name,
    item.activity_name,
    item.name,
    item.description,
    item.address,
    item.city,
    item.state,
    item.zip_code,
    item.neighborhood,
    item.borough,
    ...getLocationTags(item),
    getCuisine(item),
    getPrimaryCategory(item),
    ...toArray(item.cuisine_tags),
    item.category,
    item.categories,
    item.subcategory,
    item.types,
    item.business_status,
    item.google_types,
    item.tags,
    item.search_document,
    item.semantic_search_text,
    item.search_keywords,
    item.atmosphere,
    item.lighting,
    item.noise_level,
    item.price_range,
    item.primary_tag,
    item.review_snippet,
    ...toArray(item.review_keywords),
    ...toArray(item.date_style_tags),
    ...toArray(item.search_keywords),
    ...toArray(item.best_for),
    ...toArray(item.special_features),
    ...toArray(item.signature_items),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function locationDisplayName(item: any) {
  return String(getLocationName(item, ""))
    .trim()
    .toLowerCase();
}

function locationNameMatchScore(item: any, input: string) {
  const name = locationDisplayName(item);
  const query = normalizeQuery(input);

  if (!name || !query) return 0;

  if (query === name) return LOCATION_NAME_MATCH_WEIGHT + 300;
  if (query.includes(name)) return LOCATION_NAME_MATCH_WEIGHT + 220;
  if (name.includes(query)) return LOCATION_NAME_MATCH_WEIGHT + 180;

  const nameWords = name.split(" ").filter((word) => word.length > 2);
  const queryWords = query.split(" ").filter((word) => word.length > 2);
  const matches = nameWords.filter((word) => queryWords.includes(word));

  if (matches.length >= 2) return LOCATION_NAME_MATCH_WEIGHT + 100;
  if (matches.length === 1 && nameWords.length <= 2) {
    return LOCATION_NAME_MATCH_WEIGHT + 40;
  }

  return 0;
}

function buildMatchedLocationResults(locations: any[], input: string) {
  return locations
    .map((item: any) => ({
      ...item,
      location_name_match_score: locationNameMatchScore(item, input),
    }))
    .filter((item: any) => item.location_name_match_score > 0)
    .sort(
      (a: any, b: any) =>
        b.location_name_match_score - a.location_name_match_score
    )
    .slice(0, 10);
}


const THEATER_CLASSIFICATION_TERMS = [
  "theater",
  "theatre",
  "movie theater",
  "movie theatre",
  "movie_theater",
  "cinema",
  "performing arts",
  "performing_arts",
  "performing arts theater",
  "performing arts theatre",
  "concert hall",
  "opera house",
  "playhouse",
  "amc theatres",
  "regal cinemas",
  "showtimes",
  "box office",
];

function isTheaterLikeLocation(item: any) {
  const searchable = itemText(item).replace(/[_-]+/g, " ");
  return THEATER_CLASSIFICATION_TERMS.some((term) =>
    searchable.includes(term.replace(/[_-]+/g, " "))
  );
}

function normalizeLocation(item: any) {
  const name = getLocationName(item, "");
  const theaterLike = isTheaterLikeLocation(item);
  const type = theaterLike
    ? "activity"
    : item.location_type ||
      (item.activity_name || item.activity_type ? "activity" : "restaurant");
  const normalizedType = String(type).toLowerCase();

  return {
    ...item,
    name,
    location_type: normalizedType,
    restaurant_name: theaterLike
      ? null
      : normalizedType === "restaurant"
        ? item.restaurant_name || name
        : item.restaurant_name,
    cuisine: theaterLike ? null : item.cuisine,
    cuisine_type: theaterLike ? null : item.cuisine_type,
    food_type: theaterLike ? null : item.food_type,
    activity_name: theaterLike
      ? item.activity_name || name
      : normalizedType !== "restaurant"
        ? item.activity_name || name
        : item.activity_name,
    activity_type: theaterLike ? item.activity_type || "theater" : item.activity_type,
  };
}

function hasPublicField(value: unknown) {
  return typeof value === "string"
    ? value.trim().length > 0
    : value !== null && value !== undefined;
}

function hasRequiredPublicFields(item: any) {
  return [
    item.name || item.restaurant_name || item.activity_name,
    item.address,
    item.city,
    item.state,
    item.latitude,
    item.longitude,
    item.main_image || item.image_url,
  ].every(hasPublicField);
}

function isPublicSearchVisible(item: any, allowLowLevel = false) {
  return sharedIsPublicSearchVisible(item, {
    allowLowLevel,
    allowUnverifiedImports: allowLowLevel,
  });
}

function hasBasicPublicAddress(item: any) {
  return [item.address, item.city, item.state, item.latitude, item.longitude].every(hasPublicField);
}

function isOperational(item: any) {
  const status = String(item?.status || "").toLowerCase();
  return status !== "closed" && status !== "archived" && item?.duplicate_status !== "duplicate";
}

function curatedQualityBoost(item: any) {
  let score = 0;
  const publicTier = String(item?.public_visibility_tier || "").toLowerCase();
  const curationTier = String(item?.curation_tier || "").toLowerCase();
  const rating = Number(item?.rating || 0);
  const reviewCount = Number(item?.review_count || 0);

  if (publicTier === "premium") score += 250;
  if (publicTier === "curated") score += 200;
  if (curationTier === "premium") score += 250;
  if (curationTier === "date_worthy") score += 200;
  if (curationTier === "curated") score += 200;
  if (hasPublicPhoto(item)) score += 75;
  if (rating >= 4.3) score += 50;
  if (reviewCount >= 100) score += 50;

  return score;
}

function isChineseRestaurant(item: any) {
  const searchable = itemText(item);
  return ["chinese", "szechuan", "sichuan", "cantonese", "dim sum", "hot pot"].some((term) => searchable.includes(term));
}

function applyPostRankingDiversity(items: any[], input: string) {
  const allowLowLevel = userExplicitlyAskedForLowLevel(input);
  const asksChinese = normalizeQuery(input).split(" ").some((word) => ["chinese", "szechuan", "sichuan", "cantonese"].includes(word)) || normalizeQuery(input).includes("dim sum") || normalizeQuery(input).includes("hot pot");
  let chineseCount = 0;

  return items.filter((item) => {
    if (!allowLowLevel && isLowLevelLocation(item)) return false;
    if (!allowLowLevel && isUnverifiedNycRestaurant(item)) return false;
    if (!allowLowLevel && !hasPublicPhoto(item)) return false;
    if (!asksChinese && isChineseRestaurant(item)) {
      chineseCount += 1;
      if (chineseCount > 2) return false;
    }
    return true;
  });
}

function isRestaurantLocation(item: any) {
  if (isTheaterLikeLocation(item)) return false;
  return String(item?.location_type || "").toLowerCase() === "restaurant";
}

function isActivityLocation(item: any) {
  if (isTheaterLikeLocation(item)) return true;
  return String(item?.location_type || "").toLowerCase() !== "restaurant";
}

function detectLocation(input: string, locations: any[]) {
  const text = normalizeQuery(input);
  const found = new Set<string>();

  locations.forEach((item) => {
    const fields = [
      item.city,
      item.neighborhood,
      item.borough,
      item.state,
      item.zip_code,
    ]
      .filter(Boolean)
      .map((value) => normalizeQuery(String(value)));

    fields.forEach((field) => {
      if (field.length >= 3 && text.includes(field)) {
        found.add(field);
      }
    });
  });

  const hardcodedLocations = [
    "nyc",
    "new york",
    "new york city",
    "manhattan",
    "brooklyn",
    "queens",
    "bronx",
    "staten island",
    "soho",
    "tribeca",
    "chelsea",
    "midtown",
    "midtown east",
    "midtown west",
    "downtown",
    "uptown",
    "upper east side",
    "upper west side",
    "harlem",
    "east harlem",
    "west harlem",
    "washington heights",
    "inwood",
    "hells kitchen",
    "hudson yards",
    "times square",
    "theater district",
    "flatiron",
    "gramercy",
    "murray hill",
    "kips bay",
    "noho",
    "nolita",
    "lower east side",
    "les",
    "east village",
    "west village",
    "greenwich village",
    "financial district",
    "fidi",
    "battery park",
    "battery park city",
    "chinatown",
    "little italy",
    "union square",
    "williamsburg",
    "bushwick",
    "greenpoint",
    "dumbo",
    "downtown brooklyn",
    "brooklyn heights",
    "fort greene",
    "clinton hill",
    "bed stuy",
    "bedford stuyvesant",
    "crown heights",
    "prospect heights",
    "park slope",
    "prospect lefferts gardens",
    "flatbush",
    "east flatbush",
    "sunset park",
    "bay ridge",
    "red hook",
    "gowanus",
    "carroll gardens",
    "cobble hill",
    "boerum hill",
    "bensonhurst",
    "dyker heights",
    "sheepshead bay",
    "brighton beach",
    "coney island",
    "canarsie",
    "brownsville",
    "east new york",
    "astoria",
    "long island city",
    "lic",
    "sunnyside",
    "woodside",
    "jackson heights",
    "elmhurst",
    "corona",
    "flushing",
    "bayside",
    "whitestone",
    "forest hills",
    "rego park",
    "kew gardens",
    "fresh meadows",
    "jamaica",
    "jamaica estates",
    "hollis",
    "queens village",
    "laurelton",
    "cambria heights",
    "st albans",
    "springfield gardens",
    "ozone park",
    "south ozone park",
    "richmond hill",
    "woodhaven",
    "ridgewood",
    "middle village",
    "maspeth",
    "rockaway",
    "far rockaway",
    "belle harbor",
    "rockaway beach",
    "south bronx",
    "mott haven",
    "melrose",
    "fordham",
    "belmont",
    "little italy bronx",
    "kingsbridge",
    "riverdale",
    "pelham bay",
    "throgs neck",
    "morris park",
    "wakefield",
    "woodlawn",
    "bronx zoo",
    "yankee stadium",
    "st george",
    "st. george",
    "stapleton",
    "tompkinsville",
    "new dorp",
    "great kills",
    "tottenville",
    "port richmond",
    "long island",
    "nassau",
    "nassau county",
    "suffolk",
    "suffolk county",
    "hempstead",
    "garden city",
    "mineola",
    "freeport",
    "long beach",
    "rockville centre",
    "valley stream",
    "elmont",
    "uniondale",
    "westbury",
    "hicksville",
    "massapequa",
    "levittown",
    "babylon",
    "deer park",
    "ronkonkoma",
    "patchogue",
    "huntington",
    "island park",
    "westchester",
    "westchester county",
    "yonkers",
    "mount vernon",
    "new rochelle",
    "white plains",
    "scarsdale",
    "tarrytown",
    "elmsford",
    "ossining",
    "peekskill",
    "dobbs ferry",
    "hartsdale",
    "port chester",
    "rye",
    "new jersey",
    "north jersey",
    "jersey city",
    "hoboken",
    "newark",
    "edgewater",
    "fort lee",
    "union city",
    "weehawken",
    "secaucus",
    "hackensack",
    "paramus",
    "englewood",
    "jfk",
    "laguardia",
    "lga",
    "newark airport",
  ];

  hardcodedLocations.forEach((location) => {
    if (text.includes(location)) {
      found.add(location);
    }
  });

  return Array.from(found);
}

function matchesLocation(item: any, detectedLocations: string[]) {
  if (!detectedLocations || detectedLocations.length === 0) return true;

  const searchable = [
    item.city,
    item.neighborhood,
    item.borough,
    item.state,
    item.zip_code,
    item.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return detectedLocations.some((location) => searchable.includes(location));
}

function isTheOutHavenRelated(input: string) {
  const text = normalizeQuery(input);

  const allowedWords = [
    ...FOOD_KEYWORDS,
    ...ACTIVITY_KEYWORDS,
    ...Object.values(TAG_KEYWORDS).flat(),
    ...Object.values(FOOD_INTENTS).flat(),
    ...Object.values(ACTIVITY_INTENTS).flat(),
    "date",
    "outing",
    "plan",
    "plans",
    "place",
    "places",
    "near",
    "nearby",
    "budget",
    "cheap",
    "affordable",
    "expensive",
    "nyc",
    "new york",
    "queens",
    "brooklyn",
    "manhattan",
    "bronx",
    "staten island",
    "nassau",
    "suffolk",
    "long island",
  ];

  return allowedWords.some((word) => text.includes(word));
}

function isUnsafeOrOffTopic(input: string) {
  const text = normalizeQuery(input);

  const blockedWords = [
    "fever",
    "sick",
    "ill",
    "medicine",
    "medical",
    "doctor",
    "hospital",
    "pain",
    "injury",
    "blood",
    "emergency",
    "suicide",
    "kill myself",
    "hurt myself",
    "weapon",
    "gun",
    "drug",
    "legal advice",
  ];

  return blockedWords.some((word) => text.includes(word));
}

function detectFromMap(input: string, map: Record<string, string[]>) {
  const text = normalizeQuery(input);

  return Array.from(
    new Set(
      Object.entries(map)
        .filter(([, keywords]) =>
          keywords.some((keyword) => text.includes(keyword))
        )
        .map(([key]) => key)
    )
  );
}

function buildWantsMap(keys: string[], selected: string[]) {
  const map: Record<string, boolean> = {};

  keys.forEach((key) => {
    map[`wants_${key}`] = selected.includes(key);
  });

  return map;
}

function itemHasTag(item: any, tag: string) {
  const searchable = itemText(item);

  const directTags = [
    ...getLocationTags(item),
    item.activity_name,
    item.category,
    item.categories,
    item.subcategory,
    ...toArray(item.types),
    ...toArray(item.date_style_tags),
    ...toArray(item.search_keywords),
    ...toArray(item.best_for),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (directTags.includes(tag)) return true;

  const keywords = TAG_KEYWORDS[tag] || [tag.replace(/_/g, " ")];
  return keywords.some((keyword) => searchable.includes(keyword));
}

function isHookahPlace(item: any) {
  const searchable = itemText(item);

  return (
    searchable.includes("hookah") ||
    searchable.includes("shisha") ||
    searchable.includes("hookah lounge") ||
    searchable.includes("hookah restaurant")
  );
}

function isCigarPlace(item: any) {
  const searchable = itemText(item);

  return (
    searchable.includes("cigar") ||
    searchable.includes("cigar lounge") ||
    searchable.includes("cigar bar") ||
    searchable.includes("cigar friendly")
  );
}

function matchesFoodIntent(item: any, foodIntent: string) {
  if (isTheaterLikeLocation(item)) return false;
  if (foodIntent === "hookah") return isHookahPlace(item);
  if (foodIntent === "cigar") return isCigarPlace(item);

  const searchable = itemText(item);
  const keywords = FOOD_INTENTS[foodIntent] || [foodIntent.replace(/_/g, " ")];

  return keywords.some((keyword) => searchable.includes(keyword));
}

function cuisineMatchesPrompt(item: any, input: string) {
  const text = normalizeQuery(input);

  if (!text) return false;

  const cuisineTerms = [
    getCuisine(item),
    ...getLocationTags(item),
    ...toArray(item.cuisine_tags),
    ...toArray(item.search_keywords),
  ]
    .filter(Boolean)
    .map((value) => normalizeQuery(String(value).replace(/_/g, " ")))
    .filter((value) => value.length > 1);

  return cuisineTerms.some((term) => text.includes(term));
}

function cuisinePromptBoost(item: any, input: string) {
  const text = normalizeQuery(input);

  if (!text) return 0;

  const cuisineTerms = [
    getCuisine(item),
    ...getLocationTags(item),
    ...toArray(item.cuisine_tags),
  ]
    .filter(Boolean)
    .map((value) => normalizeQuery(String(value).replace(/_/g, " ")))
    .filter((value) => value.length > 1);

  let boost = 0;

  cuisineTerms.forEach((term) => {
    if (text.includes(term)) boost += PRIORITY_WEIGHTS.foodExact;
  });

  return boost;
}

function matchesActivityIntent(item: any, activityIntent: string) {
  const activityName = String(getLocationName(item, "")).toLowerCase();

  const normalizedIntent = activityIntent.replace(/_/g, " ");
  const keywords = ACTIVITY_INTENTS[activityIntent] || [normalizedIntent];

  if (activityName.includes(normalizedIntent)) return true;
  if (keywords.some((keyword) => activityName.includes(keyword))) return true;

  if (activityIntent === "hookah") return isHookahPlace(item);
  if (activityIntent === "cigar") return isCigarPlace(item);

  const searchable = itemText(item);

  if (itemHasTag(item, activityIntent)) return true;

  return keywords.some((keyword) => searchable.includes(keyword));
}

function detectBudget(input: string) {
  const text = normalizeQuery(input);
  const dollarMatch = text.match(/\$?\b(\d{2,4})\b/);
  const amount = dollarMatch ? Number(dollarMatch[1]) : null;

  if (
    text.includes("cheap") ||
    text.includes("affordable") ||
    text.includes("budget") ||
    text.includes("low cost") ||
    text.includes("inexpensive")
  ) {
    return { level: "low", maxAmount: amount || 60 };
  }

  if (
    text.includes("moderate") ||
    text.includes("not too expensive") ||
    text.includes("mid range") ||
    text.includes("mid-range")
  ) {
    return { level: "medium", maxAmount: amount || 120 };
  }

  if (
    text.includes("luxury") ||
    text.includes("expensive") ||
    text.includes("upscale") ||
    text.includes("fine dining") ||
    text.includes("high end") ||
    text.includes("high-end")
  ) {
    return { level: "high", maxAmount: amount || null };
  }

  if (amount) {
    if (amount <= 60) return { level: "low", maxAmount: amount };
    if (amount <= 150) return { level: "medium", maxAmount: amount };
    return { level: "high", maxAmount: amount };
  }

  return { level: null, maxAmount: null };
}

function priceLevel(item: any) {
  const price = String(item.price_range || item.price || "").toLowerCase();

  if (
    price.includes("$$$$") ||
    price.includes("expensive") ||
    price.includes("luxury")
  ) {
    return "high";
  }

  if (price.includes("$$$") || price.includes("moderate")) {
    return "medium";
  }

  if (
    price.includes("$") ||
    price.includes("cheap") ||
    price.includes("affordable")
  ) {
    return "low";
  }

  return null;
}

function budgetBoost(
  item: any,
  budget:
    | ReturnType<typeof detectBudget>
    | { level: string | null; maxPrice: number | null; raw?: string | null }
) {
  if (!budget.level) return 0;

  const level = priceLevel(item);
  const searchable = itemText(item);

  if (!level) {
    if (budget.level === "low" && searchable.includes("affordable")) return 70;
    if (
      budget.level === "high" &&
      (searchable.includes("upscale") || searchable.includes("luxury"))
    ) {
      return 90;
    }
    return 0;
  }

  if (budget.level === level) return PRIORITY_WEIGHTS.budget;

  if (budget.level === "low" && level === "high") return -120;
  if (budget.level === "medium" && level === "high") return -50;
  if (budget.level === "high" && level === "low") return -25;

  return 0;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 3958.8;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinTheOutHavenServiceArea(item: any) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);

  // Keep older/manual listings that do not have coordinates.
  if (!lat || !lng) return true;

  // NYC + Long Island + Westchester + North Jersey.
  return lat >= 40.4 && lat <= 41.2 && lng >= -74.3 && lng <= -73.5;
}

function distanceBoost(
  item: any,
  userLat?: number | null,
  userLng?: number | null,
  maxMiles?: number | null
) {
  if (!userLat || !userLng || !item.latitude || !item.longitude) return 0;

  const miles = haversineMiles(
    Number(userLat),
    Number(userLng),
    Number(item.latitude),
    Number(item.longitude)
  );

  item.distance_miles = Number(miles.toFixed(1));

  if (maxMiles && miles > maxMiles) return -200;

  if (miles <= 2) return PRIORITY_WEIGHTS.distance;
  if (miles <= 5) return 100;
  if (miles <= 10) return 55;
  if (miles <= 20) return 15;

  return -40;
}

function detectDistance(input: string) {
  const text = normalizeQuery(input);
  const match = text.match(/(\d{1,2})\s*(mile|miles|mi)/);

  if (match) return Number(match[1]);

  if (
    text.includes("near me") ||
    text.includes("nearby") ||
    text.includes("close by")
  ) {
    return 10;
  }

  return null;
}

function keywordBoost(item: any, input: string) {
  const searchable = itemText(item);

  const words = normalizeQuery(input)
    .split(" ")
    .filter((word) => word.length > 2);

  let boost = 0;

  words.forEach((word) => {
    if (searchable.includes(word)) boost += PRIORITY_WEIGHTS.keyword;
  });

  const phrase = normalizeQuery(input);

  if (phrase.length > 2 && searchable.includes(phrase)) {
    boost += PRIORITY_WEIGHTS.phrase;
  }

  return boost;
}

function weightedFoodBoost(item: any, foodIntents: string[]) {
  if (foodIntents.length === 0) return 0;

  let score = 0;

  foodIntents.forEach((food) => {
    score += matchesFoodIntent(item, food)
      ? PRIORITY_WEIGHTS.foodExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  });

  return score;
}

function weightedActivityBoost(item: any, activityIntents: string[]) {
  if (activityIntents.length === 0) return 0;

  let score = 0;

  activityIntents.forEach((activity) => {
    score += matchesActivityIntent(item, activity)
      ? PRIORITY_WEIGHTS.activityExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  });

  return score;
}

function weightedTagBoost(item: any, requestedTags: string[]) {
  return requestedTags.reduce(
    (total, tag) =>
      total + (itemHasTag(item, tag) ? PRIORITY_WEIGHTS.tagExact : 0),
    0
  );
}

function weightedVibeBoost(item: any, vibes: string[]) {
  return vibes.reduce(
    (total, vibe) =>
      total + (itemHasTag(item, vibe) ? PRIORITY_WEIGHTS.vibeExact : 0),
    0
  );
}

function popularityBoost(item: any) {
  const rating = Number(item.rating || 0);
  const reviews = Number(item.review_count || 0);

  let score = 0;

  score += rating * 25;
  score += Math.log10(reviews + 1) * 60;

  if (rating >= 4.5 && reviews >= 200) score += 120;
  if (rating >= 4.2 && reviews >= 100) score += 60;

  return score;
}

function detectIntent(input: string, body: any = {}, locations: any[] = []) {
  const canonical = parseCanonicalSearchIntent(input, body, locations);
  return {
    ...canonical,
    text: canonical.normalizedInput,
    wantsFoodMap: buildWantsMap(Object.keys(FOOD_INTENTS), canonical.foodIntents),
    wantsActivityMap: buildWantsMap(Object.keys(ACTIVITY_INTENTS), canonical.activityIntents),
    wantsBudget: Boolean(canonical.budget.level),
    budget: canonical.budget,
    userLat: canonical.distance.userLat,
    userLng: canonical.distance.userLng,
    maxMiles: canonical.distance.maxMiles,
    vibes: canonical.vibes,
    wantsBirthday: canonical.normalizedInput.includes("birthday"),
    wantsBirthdayDinner: canonical.normalizedInput.includes("birthday dinner"),
    wantsBirthdayBrunch: canonical.normalizedInput.includes("birthday brunch"),
    wantsRooftop: canonical.normalizedInput.includes("rooftop"),
    wantsHookah: canonical.activityIntents.includes("hookah"),
    wantsCigar: canonical.activityIntents.includes("cigar"),
    wantsLounge: canonical.activityIntents.includes("lounge"),
    wantsNightclub: canonical.activityIntents.includes("nightclub"),
    wantsSelfCare: hasSelfCareIntent(canonical.normalizedInput),
    hasFoodFirstIntent: hasFoodFirstIntent(canonical.normalizedInput, canonical.foodIntents),
  };
}

function scoreRestaurant(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>
) {
  if (isTheaterLikeLocation(item)) return 0;
  let score = 0;

  score += locationNameMatchScore(item, input);
  score += keywordBoost(item, input);
  score += weightedVibeBoost(item, intent.vibes);
  score += weightedTagBoost(item, intent.requestedTags);
  score += weightedFoodBoost(item, intent.foodIntents);
  score += cuisinePromptBoost(item, input);

  if (cuisineMatchesPrompt(item, input)) {
    score += 80;
  }

  score += budgetBoost(item, intent.budget);
  score += distanceBoost(item, intent.userLat, intent.userLng, intent.maxMiles);
  score += popularityBoost(item);
  score += curatedQualityBoost(item);

  if (intent.locations.length > 0) {
    const text = itemText(item);

    if (intent.locations.some((loc) => text.includes(loc))) {
      score += 40;
    } else {
      score -= 25;
    }
  }

  if (intent.wantsBirthdayDinner) score += PRIORITY_WEIGHTS.birthday;
  if (intent.wantsBirthdayBrunch && matchesFoodIntent(item, "brunch")) {
    score += PRIORITY_WEIGHTS.birthday;
  }

  if (intent.wantsRooftop && matchesFoodIntent(item, "rooftop")) {
    score += PRIORITY_WEIGHTS.rooftop;
  }

  if (intent.wantsHookah) {
    if (intent.isMealPrimary) {
      if (isHookahPlace(item)) {
        score += PRIORITY_WEIGHTS.nightlife;
      }
    } else {
      score += isHookahPlace(item)
        ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.foodExact
        : PRIORITY_WEIGHTS.mismatchPenalty;
    }
  }

  if (intent.wantsCigar) {
    if (intent.isMealPrimary) {
      if (isCigarPlace(item)) {
        score += PRIORITY_WEIGHTS.nightlife;
      }
    } else {
      score += isCigarPlace(item)
        ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.foodExact
        : PRIORITY_WEIGHTS.mismatchPenalty;
    }
  }

  score += clampScore(getSearchRankingScore(item)) * 0.4;
  score += clampScore(item.popularity_score || 0) * 0.1;

  score = applyLowLevelPenalty(score, item, input);

  return clampScore(score);
}

const SELF_CARE_INTENT_TERMS = [
  "self care",
  "self-care",
  "spa day",
  "couples massage",
  "couple massage",
  "girls day",
  "relaxing date",
  "wellness",
  "birthday prep",
  "pampering",
  "pamper",
];
const NON_WELLNESS_PRIORITY_TERMS = ["dinner", "rooftop", "hookah", "bowling", "arcade", "restaurant", "food", "dining"];

function hasSelfCareIntent(input: string) {
  const text = normalizeQuery(input);
  return SELF_CARE_INTENT_TERMS.some((term) => text.includes(term));
}

function hasFoodFirstIntent(input: string, foodIntents: string[]) {
  const text = normalizeQuery(input);
  return foodIntents.length > 0 || /\b(dinner|restaurant|food|eat|dining|brunch|lunch|breakfast)\b/.test(text);
}

function wellnessActivityPriorityAdjustment(item: any, intent: ReturnType<typeof detectIntent>) {
  if (!isWellnessActivity(item)) return 0;
  if (intent.wantsSelfCare) return 180;

  const nonWellnessActivityRequested = intent.activityIntents.some(
    (activity) => activity !== "spa",
  );
  const nonWellnessPriority = NON_WELLNESS_PRIORITY_TERMS.some((term) =>
    intent.text.includes(term),
  );

  if (intent.hasFoodFirstIntent || nonWellnessActivityRequested || nonWellnessPriority) {
    return -220;
  }

  return 0;
}

function scoreActivity(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>
) {
  let score = 0;

  score += locationNameMatchScore(item, input);

  if (intent.locations.length > 0) {
    const text = itemText(item);

    if (intent.locations.some((loc) => text.includes(loc))) {
      score += 40;
    } else {
      score -= 25;
    }
  }

  intent.activityIntents.forEach((activity) => {
    const name = String(getLocationName(item, "")).toLowerCase();
    const normalizedActivity = activity.replace(/_/g, " ");
    const keywords = ACTIVITY_INTENTS[activity] || [normalizedActivity];

    if (
      name.includes(normalizedActivity) ||
      keywords.some((keyword) => name.includes(keyword))
    ) {
      score += 500;
    }
  });

  score += keywordBoost(item, input);
  score += weightedVibeBoost(item, intent.vibes);
  score += weightedTagBoost(item, intent.requestedTags);
  score += weightedActivityBoost(item, intent.activityIntents);
  score += budgetBoost(item, intent.budget);
  score += distanceBoost(item, intent.userLat, intent.userLng, intent.maxMiles);
  score += popularityBoost(item);
  score += curatedQualityBoost(item);
  score += wellnessActivityPriorityAdjustment(item, intent);

  if (intent.wantsBirthday) {
    if (
      itemHasTag(item, "birthday") ||
      itemHasTag(item, "fun") ||
      itemHasTag(item, "nightlife") ||
      matchesActivityIntent(item, "nightclub") ||
      matchesActivityIntent(item, "comedy") ||
      matchesActivityIntent(item, "karaoke")
    ) {
      score += PRIORITY_WEIGHTS.birthday;
    }
  }

  if (intent.wantsRooftop && matchesActivityIntent(item, "rooftop")) {
    score += PRIORITY_WEIGHTS.rooftop;
  }

  if (intent.wantsHookah) {
    score += isHookahPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.activityExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  if (intent.wantsCigar) {
    score += isCigarPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.activityExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  if (intent.wantsNightclub && matchesActivityIntent(item, "nightclub")) {
    score += PRIORITY_WEIGHTS.nightlife;
  }

  score += clampScore(getSearchRankingScore(item)) * 0.4;
  score += clampScore(item.popularity_score || 0) * 0.1;

  score = applyLowLevelPenalty(score, item, input);

  return clampScore(score);
}

function filterRestaurantsByFoodIntent(
  restaurants: any[],
  intent: ReturnType<typeof detectIntent>
) {
  const mealFoodIntents = getMealFoodIntents(intent.foodIntents);

  if (mealFoodIntents.length === 0) return restaurants;

  const exactMatches = restaurants.filter((restaurant: any) =>
    mealFoodIntents.every((food) => matchesFoodIntent(restaurant, food))
  );

  if (exactMatches.length > 0) return exactMatches;

  const partialMatches = restaurants.filter((restaurant: any) =>
    mealFoodIntents.some((food) => matchesFoodIntent(restaurant, food))
  );

  return partialMatches.length > 0 ? partialMatches : restaurants;
}

function filterActivitiesByActivityIntent(
  activities: any[],
  intent: ReturnType<typeof detectIntent>
) {
  if (intent.activityIntents.length === 0) return activities;

  const exactMatches = activities.filter((activity: any) =>
    intent.activityIntents.every((activityIntent) =>
      matchesActivityIntent(activity, activityIntent)
    )
  );

  if (exactMatches.length > 0) return exactMatches;

  const partialMatches = activities.filter((activity: any) =>
    intent.activityIntents.some((activityIntent) =>
      matchesActivityIntent(activity, activityIntent)
    )
  );

  if (partialMatches.length > 0) return partialMatches;

  return [];
}

function pairSmartMatches(restaurants: any[], activities: any[]) {
  if (!restaurants.length || !activities.length) {
    return {
      restaurants,
      activities,
      pairs: [],
    };
  }

  const pairs = restaurants
    .flatMap((restaurant) =>
      activities.map((activity) => {
        let distance = null;

        if (
          restaurant.latitude &&
          restaurant.longitude &&
          activity.latitude &&
          activity.longitude
        ) {
          distance = haversineMiles(
            Number(restaurant.latitude),
            Number(restaurant.longitude),
            Number(activity.latitude),
            Number(activity.longitude)
          );
        }

        const sameCity =
          restaurant.city &&
          activity.city &&
          String(restaurant.city).toLowerCase() ===
            String(activity.city).toLowerCase();

        const sameNeighborhood =
          restaurant.neighborhood &&
          activity.neighborhood &&
          String(restaurant.neighborhood).toLowerCase() ===
            String(activity.neighborhood).toLowerCase();

        let pairScore =
          Number(getLocationScore(restaurant)) +
          Number(getLocationScore(activity));

        if (sameNeighborhood) pairScore += 80;
        if (sameCity) pairScore += 50;

        if (distance !== null) {
          if (distance <= 1) pairScore += 120;
          else if (distance <= 3) pairScore += 90;
          else if (distance <= 5) pairScore += 50;
          else if (distance <= 10) pairScore += 15;
          else pairScore -= 80;
        }

        return {
          restaurant,
          activity,
          distance_miles:
            distance !== null ? Number(distance.toFixed(1)) : null,
          same_city: Boolean(sameCity),
          same_neighborhood: Boolean(sameNeighborhood),
          pair_score: pairScore,
        };
      })
    )
    .sort((a, b) => b.pair_score - a.pair_score);

  const usedRestaurantIds = new Set<string>();
  const usedActivityIds = new Set<string>();

  const bestPairs = pairs
    .filter((pair) => {
      const restaurantId = String(
        pair.restaurant.id || pair.restaurant.restaurant_name || ""
      );

      const activityId = String(
        pair.activity.id || pair.activity.activity_name || ""
      );

      if (
        usedRestaurantIds.has(restaurantId) ||
        usedActivityIds.has(activityId)
      ) {
        return false;
      }

      usedRestaurantIds.add(restaurantId);
      usedActivityIds.add(activityId);

      return true;
    })
    .slice(0, 3);

  return {
    restaurants: bestPairs.map((pair) => ({
      ...pair.restaurant,
      paired_activity_name:
        pair.activity.activity_name || pair.activity.name || null,
      pair_distance_miles: pair.distance_miles,
      pair_score: pair.pair_score,
    })),
    activities: bestPairs.map((pair) => ({
      ...pair.activity,
      paired_restaurant_name:
        pair.restaurant.restaurant_name || pair.restaurant.name || null,
      pair_distance_miles: pair.distance_miles,
      pair_score: pair.pair_score,
    })),
    pairs: bestPairs,
  };
}

export async function POST(req: Request) {
  try {
    const diagnostics: SearchDiagnostics = createSearchDiagnostics();
    const body = await req.json();
    const messages = body.messages || [];
    const input = body.input || messages[messages.length - 1]?.content || "";

    if (!input) {
      return Response.json({ error: "Missing input" }, { status: 400 });
    }

    const canonicalIntent = parseCanonicalSearchIntent(input, body, []);
    const smartIntent = {
      ...canonicalIntent,
      query: canonicalIntent.normalizedInput,
      strictFoodMode: canonicalIntent.foodIntents.length > 0,
      strictActivityMode: canonicalIntent.activityIntents.length > 0,
    };
    console.log("SMART MATCH INTENT:", smartIntent);

    if (isUnsafeOrOffTopic(input) || !isTheOutHavenRelated(input)) {
      return Response.json({
        success: false,
        version: getSmartMatchVersion(),
        reply: OFF_TOPIC_REPLY,
        smart_match: smartIntent,
        intent: {
          requestedTags: [],
          foodIntents: [],
          activityIntents: [],
          vibes: [],
          multiIntentMode: false,
          locations: [],
        },
        restaurants: [],
        activities: [],
        matched_locations: [],
      });
    }

    await logSearchQuery(input);

    const allowLowLevel = userExplicitlyAskedForLowLevel(input);
    diagnostics.allowLowLevel = allowLowLevel;
    diagnostics.lowLevelAllowedBecauseUserAsked = allowLowLevel;

    const { data: locationsData, error: locationsError } = await supabase
      .from("locations")
      .select("*")
      .eq("is_searchable", true)
      .eq("data_status", "clean")
      .eq("quality_status", "publish_ready")
      .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
      .eq("has_photos", true)
      .not("photo_status", "eq", "missing_photo")
      .not("is_hidden", "is", true)
      .not("status", "in", '("closed","archived")');

    if (locationsError) {
      return Response.json({ error: locationsError.message }, { status: 500 });
    }

    const normalizedLocations = (locationsData || []).map(normalizeLocation);
    const lowLevelReasons: Record<string, number> = {};
    let removedLowLevelCount = 0;
    let removedUnverifiedNycCount = 0;

    const locations = normalizedLocations.filter((item: any) => {
      const lowLevel = isLowLevelLocation(item);
      const unverifiedNyc = isUnverifiedNycRestaurant(item);
      if (!allowLowLevel && lowLevel && !isQualifiedWellnessActivity(item)) {
        removedLowLevelCount += 1;
        const reason = item.low_level_reason || item.source_quality_status || item.public_visibility_tier || "detected_low_level";
        lowLevelReasons[reason] = (lowLevelReasons[reason] || 0) + 1;
        return false;
      }
      if (!allowLowLevel && unverifiedNyc) {
        removedUnverifiedNycCount += 1;
        return false;
      }
      if (allowLowLevel) return isOperational(item) && hasBasicPublicAddress(item);
      return isPublicSearchVisible(item, false);
    });

    diagnostics.removedLowLevelCount = removedLowLevelCount;
    diagnostics.removedUnverifiedNycCount = removedUnverifiedNycCount;
    diagnostics.lowLevelReasons = lowLevelReasons;
    const intent = detectIntent(input, body, locations);

    const cacheKey = normalizeQuery(
      `theouthaven-${getSmartMatchVersion()}-${input}-${intent.userLat || ""}-${
        intent.userLng || ""
      }-${intent.maxMiles || ""}-${intent.locations.join("-")}`
    );

    const { data: cached } = await supabase
      .from("ai_response_cache")
      .select("response, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.response) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();

      if (cacheAge < 1000 * 60 * 60 * CACHE_HOURS) {
        diagnostics.notes.push("Serving response from ai_response_cache.");
        logSearchDiagnostics(diagnostics);
        return Response.json(cached.response);
      }
    }

    const usableLocations = locations.filter((item: any) => {
      const status = String(item.status || "approved").toLowerCase();

      const isApproved =
        status === "approved" || status === "active" || status === "";

      return isApproved && isWithinTheOutHavenServiceArea(item);
    });

    const sourceLocations =
      usableLocations.length > 0 ? usableLocations : locations;

    const matchedLocationResults = buildMatchedLocationResults(
      sourceLocations,
      input
    );

    let restaurants = sourceLocations
      .filter((item: any) => isRestaurantLocation(item))
      .filter((row: any) => !isTheaterLikeLocation(row));

    let activities = sourceLocations.filter((item: any) =>
      isActivityLocation(item)
    );

    restaurants = filterRestaurantsByFoodIntent(restaurants, intent);
    activities = filterActivitiesByActivityIntent(activities, intent);

    if (intent.locations.length > 0) {
      const locationRestaurants = restaurants.filter((item: any) =>
        matchesLocation(item, intent.locations)
      );

      const locationActivities = activities.filter((item: any) =>
        matchesLocation(item, intent.locations)
      );

      if (locationRestaurants.length > 0) {
        restaurants = locationRestaurants;
      }

      if (locationActivities.length > 0) {
        activities = locationActivities;
      }
    }

    if (intent.activityIntents.length > 0) {
      let forcedActivityMatches = locations.filter((item: any) =>
        intent.activityIntents.some((activityIntent) =>
          matchesActivityIntent(item, activityIntent)
        )
      );

      if (intent.locations.length > 0) {
        const locationFiltered = forcedActivityMatches.filter((item: any) =>
          matchesLocation(item, intent.locations)
        );

        if (locationFiltered.length > 0) {
          forcedActivityMatches = locationFiltered;
        }
      }

      if (forcedActivityMatches.length > 0) {
        activities = forcedActivityMatches;
      }
    }

    restaurants = allowLowLevel ? restaurants.filter((item: any) => isOperational(item) && hasBasicPublicAddress(item)) : restaurants.filter((item: any) => !isLowLevelLocation(item) && !isUnverifiedNycRestaurant(item));
    activities = allowLowLevel ? activities.filter((item: any) => isOperational(item) && hasBasicPublicAddress(item)) : activities.filter((item: any) => isQualifiedWellnessActivity(item) || (!isLowLevelLocation(item) && !isUnverifiedNycRestaurant(item)));

    const rankedRestaurants = restaurants
      .map((restaurant: any) => {
        const score = scoreRestaurant(restaurant, input, intent);

        return {
          ...restaurant,
          theouthaven_score: score,
          smart_match_score: score,
          location_name_match_score: locationNameMatchScore(restaurant, input),
        };
      })
      .sort((a: any, b: any) => b.theouthaven_score - a.theouthaven_score);

    const diverseRankedRestaurants = applyPostRankingDiversity(rankedRestaurants, input);

    const rankedActivities = activities
      .map((activity: any) => {
        const score = scoreActivity(activity, input, intent);

        return {
          ...activity,
          theouthaven_score: score,
          smart_match_score: score,
          location_name_match_score: locationNameMatchScore(activity, input),
        };
      })
      .sort((a: any, b: any) => b.theouthaven_score - a.theouthaven_score);

    const diverseRankedActivities = applyPostRankingDiversity(rankedActivities, input);

    const smartBalanced = balanceSmartMatches(
      diverseRankedRestaurants,
      diverseRankedActivities,
      smartIntent
    );

    if (
      intent.activityIntents.length > 0 &&
      diverseRankedActivities.length > 0 &&
      smartBalanced.activities.length === 0
    ) {
      smartBalanced.activities = diverseRankedActivities.slice(0, 2);
    }

    if (
      intent.foodIntents.length > 0 &&
      diverseRankedRestaurants.length > 0 &&
      smartBalanced.restaurants.length === 0
    ) {
      smartBalanced.restaurants = diverseRankedRestaurants.slice(0, 2);
    }

    const pairedResults =
      smartBalanced.restaurants.length > 0 &&
      smartBalanced.activities.length > 0
        ? pairSmartMatches(smartBalanced.restaurants, smartBalanced.activities)
        : {
            restaurants: smartBalanced.restaurants,
            activities: smartBalanced.activities,
            pairs: [],
          };

    let topRestaurants = pairedResults.restaurants;
    let topActivities = pairedResults.activities;

    if (
      topRestaurants.length === 0 &&
      topActivities.length === 0 &&
      matchedLocationResults.length > 0
    ) {
      const matchedRestaurants = matchedLocationResults.filter((item: any) =>
        isRestaurantLocation(item)
      );
      const matchedActivities = matchedLocationResults.filter((item: any) =>
        isActivityLocation(item)
      );

      if (matchedRestaurants.length > 0) {
        topRestaurants = matchedRestaurants.slice(0, 4);
      }

      if (matchedActivities.length > 0) {
        topActivities = matchedActivities.slice(0, 4);
      }
    }

    const slimMatchedLocations = matchedLocationResults.map((item: any) => ({
      id: String(item.id),
      name: getLocationName(item, ""),
      location_type: item.location_type,
      city: item.city,
      address: item.address,
      primary_category: getPrimaryCategory(item),
        cuisine: getCuisine(item),
      cuisine_tags: toArray(item.cuisine_tags).slice(0, 5),
      activity_type: getPrimaryCategory(item),
      score: item.location_name_match_score,
    }));

    const slimRestaurants = topRestaurants.map((r: any) => ({
      name: getLocationName(r, ""),
      city: r.city,
      cuisine: getCuisine(r),
      cuisine_tags: toArray(r.cuisine_tags).slice(0, 5),
      score: clampScore(getLocationScore(r)),
      location_name_match_score: r.location_name_match_score || 0,
      tag: getPrimaryCategory(r),
      rating: r.rating,
      review_count: r.review_count,
      distance_miles: r.distance_miles || null,
      review_keywords: toArray(r.review_keywords).slice(0, 5),
    }));

    const slimActivities = topActivities.map((a: any) => ({
      name: getLocationName(a, ""),
      city: a.city,
      type: getPrimaryCategory(a),
      score: clampScore(getLocationScore(a)),
      location_name_match_score: a.location_name_match_score || 0,
      tag: getPrimaryCategory(a),
      rating: a.rating,
      review_count: a.review_count,
      distance_miles: a.distance_miles || null,
      review_keywords: toArray(a.review_keywords).slice(0, 5),
    }));

    const shortConversation = messages
      .slice(-4)
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `
You are TheOutHaven, a concise AI outing planner.

Conversation:
${shortConversation}

Latest user request:
"${input}"

TheOutHaven Smart Match Engine:
${JSON.stringify({
  version: getSmartMatchVersion(),
  mode: smartBalanced.mode,
  wantsFood: smartIntent.wantsFood,
  wantsActivity: smartIntent.wantsActivity,
  wantsFullOuting: smartIntent.wantsFullOuting,
  foodIntents: smartIntent.foodIntents,
  activityIntents: smartIntent.activityIntents,
  vibes: smartIntent.vibes,
  locations: smartIntent.locations,
  strictFoodMode: smartIntent.strictFoodMode,
  strictActivityMode: smartIntent.strictActivityMode,
})}

Detected intent:
${JSON.stringify({
  wantsRestaurant: intent.wantsRestaurant,
  wantsActivity: intent.wantsActivity,
  wantsFullOuting: intent.wantsFullOuting,
  multiIntentMode: intent.multiIntentMode,
  foodIntents: intent.foodIntents,
  activityIntents: intent.activityIntents,
  requestedTags: intent.requestedTags,
  vibes: intent.vibes,
  budget: intent.budget,
  maxMiles: intent.maxMiles,
  locations: intent.locations,
})}

Matched location/business names from TheOutHaven database:
${JSON.stringify(slimMatchedLocations)}

Restaurants:
${JSON.stringify(slimRestaurants)}

Activities:
${JSON.stringify(slimActivities)}

STRICT RULES:
- Only answer TheOutHaven-related outing, date, restaurant, activity, nightlife, brunch, birthday, budget, distance, or location-planning requests.
- If the user asks anything outside TheOutHaven, respond exactly: "${OFF_TOPIC_REPLY}"
- Keep the answer short and direct.
- Use ONLY the listed restaurants and activities.
- If the user typed a specific business/location name and it appears in "Matched location/business names", prioritize it.
- If there is a matched business/location name, mention that match first.
- If the user asks for food plus any activity, include both a restaurant and a matching activity when available.
- Never ignore the requested activity intent.
- If a location is detected, prioritize restaurants and activities from that location.
- If matching activities only exist in another borough, still include the matching activity.
- Never say “I don’t have any.”
- Never ask the user to provide a list.
- Never say “let me know.”
- Balance restaurant and activity perfectly when both are requested.
- If budget is detected, recommend options that fit the budget first.
- If distance is detected, prioritize closer options first.
- Match the vibe, food intent, activity intent, and location together.
- Do NOT recommend museums unless the user asked for museums, art, galleries, exhibits, or culture.
- Do NOT suggest unrelated cuisines or unrelated activities.
- Do NOT invent business details.
- Do NOT add times unless asked.
- Do NOT add dessert, walks, or extra stops unless asked.
`;

    const hasResults =
      topRestaurants.length > 0 ||
      topActivities.length > 0 ||
      matchedLocationResults.length > 0;

    const response = hasResults
      ? await openai.responses.create({
          model: AI_MODEL,
          input: prompt,
          max_output_tokens: 350,
        })
      : null;

    const responsePayload: any = {
      success: true,
      version: getSmartMatchVersion(),
      smart_match: {
        mode: smartBalanced.mode,
        pairing_enabled: pairedResults.pairs.length > 0,
        pair_count: pairedResults.pairs.length,
        query: smartIntent.query,
        wantsFood: smartIntent.wantsFood,
        wantsActivity: smartIntent.wantsActivity,
        wantsFullOuting: smartIntent.wantsFullOuting,
        foodIntents: smartIntent.foodIntents,
        activityIntents: smartIntent.activityIntents,
        vibes: smartIntent.vibes,
        locations: smartIntent.locations,
        strictFoodMode: smartIntent.strictFoodMode,
        strictActivityMode: smartIntent.strictActivityMode,
      },
      reply:
        response?.output_text ||
        "Here are strong TheOutHaven matches based on your vibe.",
      intent: {
        requestedTags: intent.requestedTags,
        foodIntents: intent.foodIntents,
        activityIntents: intent.activityIntents,
        vibes: intent.vibes,
        budget: intent.budget,
        maxMiles: intent.maxMiles,
        multiIntentMode: intent.multiIntentMode,
        locations: intent.locations,
      },
      matched_locations: matchedLocationResults.map((item: any) => ({
        id: String(item.id),
        name: getLocationName(item, ""),
        location_type: item.location_type,
        address: item.address,
        city: item.city,
        state: item.state,
        zip_code: item.zip_code,
        primary_category: getPrimaryCategory(item),
        cuisine: getCuisine(item),
        cuisine_tags: toArray(item.cuisine_tags).slice(0, 5),
        activity_type: getPrimaryCategory(item),
        website: item.website,
        phone: item.phone || null,
        google_maps_url: item.google_maps_url || null,
        image_url: item.image_url || null,
        external_reservation_url: item.external_reservation_url || null,
        reservation_url: item.reservation_url || null,
        reservation_link: item.reservation_link || null,
        reservation_enabled: item.reservation_enabled ?? null,
        location_name_match_score: item.location_name_match_score,
      })),
      pairs: pairedResults.pairs.map((pair: any) => ({
        restaurant_name: pair.restaurant.restaurant_name || pair.restaurant.name,
        activity_name: pair.activity.activity_name || pair.activity.name,
        distance_miles: pair.distance_miles,
        same_city: pair.same_city,
        same_neighborhood: pair.same_neighborhood,
        pair_score: clampScore(pair.pair_score),
      })),
      restaurants: topRestaurants.map((r: any) => ({
        id: String(r.id),
        restaurant_name: r.restaurant_name || r.name,
        address: r.address,
        city: r.city,
        state: r.state,
        zip_code: r.zip_code,
        google_maps_url: r.google_maps_url || null,
        primary_category: getPrimaryCategory(r),
        cuisine: getCuisine(r),
        cuisine_type: r.cuisine_type || null,
        tags: Array.isArray(r.tags) ? r.tags : null,
        google_types: Array.isArray(r.google_types) ? r.google_types : null,
        cuisine_tags: toArray(r.cuisine_tags).slice(0, 5),
        atmosphere: r.atmosphere || null,
        price_range: r.price_range || null,
        theouthaven_score: clampScore(getLocationScore(r)),
        smart_match_score: clampScore(r.smart_match_score ?? getLocationScore(r)),
        location_name_match_score: r.location_name_match_score || 0,
        paired_activity_name: r.paired_activity_name || null,
        pair_distance_miles: r.pair_distance_miles || null,
        pair_score: r.pair_score ? clampScore(r.pair_score) : null,
        external_reservation_url: r.external_reservation_url || null,
        reservation_url: r.reservation_url || null,
        reservation_link: r.reservation_link || null,
        reservation_enabled: r.reservation_enabled ?? null,
        website: r.website,
        image_url: r.image_url || null,
        rating: r.rating || null,
        review_count: r.review_count || null,
        review_score: r.review_score || null,
        review_keywords: toArray(r.review_keywords),
        review_snippet: r.review_snippet || null,
        primary_tag: r.primary_tag || null,
        date_style_tags: toArray(r.date_style_tags),
        distance_miles: r.distance_miles || null,
      })),
      activities: topActivities.map((a: any) => ({
        id: String(a.id),
        activity_name: a.activity_name || a.name,
        primary_category: getPrimaryCategory(a),
        activity_type: a.activity_type || a.category || a.subcategory,
        tags: Array.isArray(a.tags) ? a.tags : null,
        google_types: Array.isArray(a.google_types) ? a.google_types : null,
        address: a.address,
        city: a.city,
        state: a.state,
        zip_code: a.zip_code,
        google_maps_url: a.google_maps_url || null,
        price_range: a.price_range,
        atmosphere: a.atmosphere,
        group_friendly: a.group_friendly,
        theouthaven_score: clampScore(getLocationScore(a)),
        smart_match_score: clampScore(a.smart_match_score ?? getLocationScore(a)),
        location_name_match_score: a.location_name_match_score || 0,
        paired_restaurant_name: a.paired_restaurant_name || null,
        pair_distance_miles: a.pair_distance_miles || null,
        pair_score: a.pair_score ? clampScore(a.pair_score) : null,
        external_reservation_url: a.external_reservation_url || null,
        reservation_url: a.reservation_url || null,
        reservation_link: a.reservation_link || null,
        reservation_enabled: a.reservation_enabled ?? null,
        website: a.website,
        image_url: a.image_url || null,
        rating: a.rating || null,
        review_count: a.review_count || null,
        review_score: a.review_score || null,
        review_keywords: toArray(a.review_keywords),
        review_snippet: a.review_snippet || null,
        primary_tag: a.primary_tag || null,
        date_style_tags: toArray(a.date_style_tags),
        distance_miles: a.distance_miles || null,
      })),
      debug: process.env.NODE_ENV !== "production" ? diagnostics : undefined,
    };

    const shouldCacheResponse =
      responsePayload.restaurants.length > 0 ||
      responsePayload.activities.length > 0 ||
      responsePayload.matched_locations.length > 0;

    if (shouldCacheResponse) {
      await supabase.from("ai_response_cache").upsert({
        cache_key: cacheKey,
        user_query: input,
        response: responsePayload,
      });
    } else {
      diagnostics.notes.push("Skipped cache because response had no card records.");
    }

    logSearchDiagnostics(diagnostics);
    return Response.json(responsePayload);
  } catch (error: any) {
    console.error("GENERATE ERROR:", error);

    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
