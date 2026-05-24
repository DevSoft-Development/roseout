import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { clampScore } from "@/lib/clampScore";
import { getLocationScore, getSearchRankingScore } from "@/lib/locationScore";
import { getLocationName } from "@/lib/locationName";
import { inferWalkingArea, isCrossAreaWalkingPair } from "@/lib/walkingArea";
import {
  getCuisine,
  getLocationTags,
  getPrimaryCategory,
} from "@/lib/locationFields";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import { trackLocationAnalyticsEvent } from "@/lib/analytics/business-analytics";
import {
  detectSmartMatchIntent,
  balanceSmartMatches,
  getSmartMatchVersion,
} from "@/lib/theouthavenSmartMatchEngine";
import {
  SEMANTIC_SEARCH_VERSION,
  confidenceFromScores,
  semanticScoreBoost,
} from "@/lib/aiSemanticSearch";
import { parseSearchIntent } from "@/lib/search/intent";
import { localFirstFilter } from "@/lib/search/local-search";
import { pairLocations } from "@/lib/search/pairing";
import { rankPairs } from "@/lib/search/ranking";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const AI_MODEL = "gpt-4o-mini";
const CACHE_HOURS = 6;
const RESPONSE_CACHE_VERSION = `food-cuisine-location-distance-v20-split-meal-lounge-card-results-${SEMANTIC_SEARCH_VERSION}`;
const SEARCH_LIMITS = {
  supportingLocations: 500,
  fallbackGeneralRecords: 1000,
  fallbackRegionalRecords: 500,
} as const;

type DetectedIntent = ReturnType<typeof detectIntent>;

function buildResponseCacheKey(input: string, intent: DetectedIntent) {
  const keyParts = [
    "theouthaven",
    getSmartMatchVersion(),
    RESPONSE_CACHE_VERSION,
    input,
    intent.userLat || "",
    intent.userLng || "",
    intent.maxMiles || "",
    intent.locations.join("-"),
  ];

  return normalizeQuery(keyParts.join("-"));
}

const OFF_TOPIC_REPLY =
  "I can only help with TheOutHaven outing plans, restaurants, activities, nightlife, brunch, and date ideas.";

const LOCATION_NAME_MATCH_WEIGHT = 500;

const FOOD_KEYWORDS = [
  "food",
  "eat",
  "eats",
  "restaurant",
  "restaurants",
  "restuarant",
  "restuarants",
  "restaraunt",
  "restaraunts",
  "dining",
  "fine dining",
  "upscale dining",
  "luxury dining",
  "chef tasting",

  "breakfast",
  "brunch",
  "bottomless brunch",
  "lunch",
  "dinner",
  "late night food",
  "birthday dinner",
  "birthday brunch",
  "birthday restaurant",

  "steak",
  "steakhouse",
  "ribeye",
  "porterhouse",
  "filet mignon",

  "seafood",
  "fish",
  "lobster",
  "crab",
  "shrimp",
  "oyster",
  "oysters",
  "raw bar",
  "clam",
  "salmon",
  "branzino",
  "surf and turf",

  "sushi",
  "omakase",
  "sashimi",
  "nigiri",
  "maki",

  "ramen",
  "pho",
  "noodles",

  "pasta",
  "risotto",

  "italian",
  "mexican",
  "chinese",
  "thai",
  "indian",
  "mediterranean",
  "greek",
  "spanish",
  "french",
  "japanese",
  "korean",
  "korean bbq",
  "kbbq",
  "vietnamese",
  "filipino",
  "caribbean",
  "jamaican",
  "haitian",
  "african",
  "ethiopian",
  "nigerian",
  "ghanaian",
  "soul food",
  "southern",

  "bbq",
  "barbecue",
  "smokehouse",
  "brisket",
  "ribs",

  "burger",
  "burgers",
  "smashburger",

  "pizza",
  "pizzeria",
  "slice shop",

  "wings",
  "buffalo wings",

  "sandwich",
  "sandwiches",
  "subs",
  "heroes",
  "hoagies",

  "taco",
  "tacos",
  "taqueria",
  "birria",
  "quesadilla",

  "halal",
  "halal food",
  "halal restaurant",

  "vegan",
  "vegetarian",
  "plant based",
  "plant-based",
  "healthy",
  "organic",
  "salad",

  "buffet",
  "all you can eat",
  "ayce",

  "hibachi",
  "teppanyaki",
  "hot pot",
  "shabu shabu",

  "dessert",
  "desserts",
  "ice cream",
  "gelato",
  "bakery",
  "cake",
  "cookies",
  "cupcakes",
  "cheesecake",
  "pastry",
  "croissant",

  "coffee",
  "cafe",
  "coffee shop",
  "espresso",
  "latte",

  "wine",
  "wine bar",
  "cocktail",
  "cocktails",
  "drinks",
  "bar",
  "sports bar",
  "rooftop",
  "rooftop bar",
  "lounge",
  "cocktail lounge",

  "hookah",
  "shisha",

  "cigar",
  "cigar lounge",
  "cigar bar",

  "date night",
  "romantic dinner",
  "romantic restaurant",
  "romantic brunch",

  "upscale",
  "luxury",
  "romantic",
  "cozy",
  "intimate",
  "scenic",
  "waterfront",
  "skyline",
];

const PRIMARY_MEAL_KEYWORDS = [
  "restaurant",
  "restaurants",
  "restuarant",
  "restuarants",
  "restaraunt",
  "restaraunts",
  "dinner",
  "lunch",
  "brunch",
  "breakfast",
  "dining",
  "sit down",
  "sit-down",
];

const DESSERT_ONLY_RESTAURANT_KEYWORDS = [
  "ice cream",
  "italian ice",
  "shaved ice",
  "gelato",
  "frozen yogurt",
  "froyo",
  "dessert",
  "desserts",
  "dessert shop",
  "bakery",
  "cupcake",
  "cupcakes",
  "cookie",
  "cookies",
  "pastry",
  "pastries",
  "candy",
  "chocolate",
  "sweets",
];

const FULL_MEAL_RESTAURANT_KEYWORDS = [
  "restaurant",
  "dining",
  "kitchen",
  "grill",
  "bistro",
  "brasserie",
  "steak",
  "seafood",
  "sushi",
  "italian",
  "mexican",
  "chinese",
  "thai",
  "indian",
  "mediterranean",
  "american",
  "bbq",
  "pizza",
  "burger",
  "taco",
  "ramen",
  "hibachi",
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
  steak: ["steak", "steakhouse", "filet", "ribeye", "porterhouse"],

  seafood: [
    "seafood",
    "oyster",
    "oysters",
    "raw bar",
    "lobster",
    "crab",
    "shrimp",
    "clam",
    "fish",
    "branzino",
    "salmon",
    "surf and turf",
  ],

  sushi: ["sushi", "omakase", "nigiri", "sashimi", "maki", "japanese sushi"],

  ramen: ["ramen", "tonkotsu", "shoyu ramen"],

  italian: ["italian", "pasta", "risotto", "trattoria", "pizza italiana"],

  mexican: ["mexican", "taco", "tacos", "birria", "quesadilla", "taqueria"],

  chinese: [
    "chinese",
    "dim sum",
    "dumpling",
    "dumplings",
    "szechuan",
    "cantonese",
  ],

  thai: ["thai", "pad thai", "thai food", "thai cuisine"],

  indian: ["indian", "curry", "tikka", "masala", "biryani", "naan"],

  japanese: ["japanese", "izakaya", "yakitori", "hibachi", "teppanyaki"],

  korean: ["korean", "korean bbq", "kbbq", "bulgogi", "hot pot"],

  vietnamese: ["vietnamese", "pho", "banh mi", "vermicelli"],

  filipino: ["filipino", "adobo", "lechon", "lumpia"],

  african: ["african", "nigerian", "ghanaian", "ethiopian", "senegalese"],

  caribbean: ["caribbean", "jamaican", "haitian", "trinidadian", "jerk"],

  soul_food: ["soul food", "southern", "comfort food", "fried chicken"],

  mediterranean: ["mediterranean", "greek", "falafel", "gyro", "hummus"],

  spanish: ["spanish", "paella", "tapas"],

  french: ["french", "bistro", "brasserie"],

  american: ["american", "new american", "american grill", "gastropub"],

  bbq: ["bbq", "barbecue", "smokehouse", "ribs", "brisket"],

  halal: ["halal", "halal food", "halal restaurant"],

  vegan: ["vegan", "plant based", "plant-based"],

  vegetarian: ["vegetarian", "veggie"],

  healthy: ["healthy", "organic", "salad", "wellness"],

  brunch: ["brunch", "bottomless brunch", "brunch spot"],

  breakfast: ["breakfast", "pancakes", "waffles", "breakfast spot"],

  cafe: ["cafe", "coffee", "espresso", "latte", "coffee shop"],

  coffee: ["coffee", "espresso", "latte", "coffee shop"],

  juice: ["juice", "juice bar", "fresh juice"],

  smoothie: ["smoothie", "smoothies", "smoothie bar", "açaí", "acai"],

  quick_bites: ["quick bites", "quick bite", "snack", "snacks", "grab and go"],

  bakery: ["bakery", "pastry", "croissant", "baked goods"],

  dessert: [
    "dessert",
    "desserts",
    "ice cream",
    "gelato",
    "cake",
    "cheesecake",
    "cookies",
    "cupcakes",
  ],

  burgers: ["burger", "burgers", "smashburger"],

  pizza: ["pizza", "pizzeria", "wood fired pizza", "slice shop"],

  wings: ["wings", "buffalo wings", "chicken wings"],

  sandwiches: ["sandwich", "sandwiches", "subs", "heroes", "hoagies"],

  tacos: ["tacos", "street tacos"],

  drinks: ["drinks", "cocktail", "cocktails", "wine", "bar", "mixology"],

  wine_bar: ["wine bar", "wine lounge"],

  rooftop: ["rooftop", "roof top", "skyline", "view"],

  lounge: ["lounge", "cocktail lounge"],

  hookah: ["hookah", "shisha", "hookah lounge", "hookah restaurant"],

  cigar: ["cigar", "cigar lounge", "cigar bar", "cigar friendly"],

  fine_dining: [
    "fine dining",
    "upscale dining",
    "luxury dining",
    "chef tasting",
  ],

  buffet: ["buffet", "all you can eat", "ayce"],

  hibachi: ["hibachi", "teppanyaki"],

  hot_pot: ["hot pot", "shabu shabu"],
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
  paint_and_sip: ["paint and sip", "paint sip", "painting"],
  comedy: ["comedy", "stand up", "stand-up", "comedy club"],
  movie: ["movie", "movies", "cinema", "theater"],
  nightclub: ["nightclub", "night club", "dance club", "club"],
  hookah: ["hookah", "shisha", "hookah lounge", "hookah restaurant"],
  cigar: ["cigar", "cigar lounge", "cigar bar", "cigar friendly"],
  lounge: ["lounge"],
  rooftop: ["rooftop", "roof top", "skyline", "view"],
  live_music: ["live music", "jazz", "music venue"],
  spa: ["spa", "massage", "wellness"],
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
const LOUNGE_ACTIVITY_INTENTS = new Set([
  "hookah",
  "shisha",
  "cigar",
  "lounge",
  "nightclub",
  "rooftop",
]);
const WALKING_MINUTES_PER_MILE = 20;

function isFoodAddOnIntent(foodIntent: string) {
  return FOOD_ADD_ON_INTENTS.has(foodIntent);
}

function isLoungeActivityIntent(intent: string) {
  return LOUNGE_ACTIVITY_INTENTS.has(intent);
}

function getMealFoodIntents(intent: ReturnType<typeof detectIntent>) {
  return intent.foodIntents.filter(
    (foodIntent) =>
      !isFoodAddOnIntent(foodIntent) &&
      !isLoungeActivityIntent(foodIntent)
  );
}

function getAddOnFoodIntents(intent: ReturnType<typeof detectIntent>) {
  return intent.foodIntents.filter(
    (foodIntent) =>
      isFoodAddOnIntent(foodIntent) || isLoungeActivityIntent(foodIntent)
  );
}

function isRealMealRequest(intent: ReturnType<typeof detectIntent>) {
  return getMealFoodIntents(intent).length > 0;
}

function isActualRestaurant(item: any) {
  const searchable = itemText(item);
  const restaurantSignals = [
    "restaurant",
    "steakhouse",
    "steak house",
    "dining",
    "kitchen",
    "grill",
    "seafood",
    "sushi",
    "italian",
    "mexican",
    "caribbean",
    "jamaican",
    "thai",
    "chinese",
    "american",
    "cuisine",
    "food",
  ];
  const loungeOnlySignals = [
    "hookah lounge",
    "shisha lounge",
    "cigar lounge",
    "nightclub",
    "night club",
  ];
  const hasRestaurantSignal = restaurantSignals.some((signal) =>
    searchable.includes(signal)
  );
  const isLoungeOnly =
    loungeOnlySignals.some((signal) => searchable.includes(signal)) &&
    !hasRestaurantSignal;
  return hasRestaurantSignal && !isLoungeOnly;
}

function buildRestaurantSearchInput(
  originalInput: string,
  intent: ReturnType<typeof detectIntent>
) {
  const mealFoodIntents = getMealFoodIntents(intent);
  const locationText = intent.locations.join(" ");

  if (mealFoodIntents.length > 0) {
    return normalizeQuery(
      `${mealFoodIntents
        .map((foodIntent) => foodIntent.replace(/_/g, " "))
        .join(" ")} steakhouse restaurant dinner dining ${locationText}`
    );
  }

  return normalizeQuery(originalInput);
}

function buildActivitySearchInput(
  originalInput: string,
  intent: ReturnType<typeof detectIntent>
) {
  const activityTerms = [...intent.activityIntents, ...getAddOnFoodIntents(intent)];
  const locationText = intent.locations.join(" ");

  if (activityTerms.length > 0) {
    return normalizeQuery(
      `${activityTerms
        .map((activityIntent) => activityIntent.replace(/_/g, " "))
        .join(" ")} activity nightlife lounge ${locationText}`
    );
  }

  return normalizeQuery(originalInput);
}

function normalizeQuery(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s$.-]/g, " ")
    .replace(/\s+/g, " ");
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

function phraseIncludesNormalized(text: string, phrase: string) {
  const cleanText = normalizeQuery(text);
  const cleanPhrase = normalizeQuery(phrase);

  if (!cleanText || !cleanPhrase) return false;

  if (cleanPhrase.length <= 3) {
    return new RegExp(`\\b${cleanPhrase}\\b`).test(cleanText);
  }

  return cleanText.includes(cleanPhrase);
}

function wantsPrimaryMeal(input: string) {
  const text = normalizeQuery(input);

  return PRIMARY_MEAL_KEYWORDS.some((keyword) =>
    phraseIncludesNormalized(text, keyword),
  );
}

function isDessertOnlyRestaurant(item: Record<string, unknown>) {
  const primaryText = [
    item.restaurant_name,
    item.name,
    getCuisine(item),
    getPrimaryCategory(item),
    item.category,
    item.categories,
    item.primary_tag,
  ]
    .filter(Boolean)
    .join(" ");
  const searchable = itemText(item);

  const hasDessertSignal =
    DESSERT_ONLY_RESTAURANT_KEYWORDS.some((keyword) =>
      phraseIncludesNormalized(primaryText, keyword),
    ) ||
    DESSERT_ONLY_RESTAURANT_KEYWORDS.some((keyword) =>
      phraseIncludesNormalized(searchable, keyword),
    );

  if (!hasDessertSignal) return false;

  return !FULL_MEAL_RESTAURANT_KEYWORDS.some((keyword) =>
    phraseIncludesNormalized(primaryText, keyword),
  );
}

function filterPrimaryMealRestaurants(
  restaurants: Record<string, unknown>[],
  intent: ReturnType<typeof detectIntent>,
) {
  if (!intent.wantsPrimaryMeal) return restaurants;

  const primaryMealMatches = restaurants.filter(
    (restaurant) => !isDessertOnlyRestaurant(restaurant),
  );

  return primaryMealMatches.length > 0 ? primaryMealMatches : restaurants;
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
    item.location_tags,
    ...getLocationTags(item),
    getCuisine(item),
    getPrimaryCategory(item),
    ...toArray(item.cuisine_tags),
    item.activity_type,
    item.category,
    item.categories,
    item.subcategory,
    item.types,
    item.business_status,
    item.atmosphere,
    item.lighting,
    item.noise_level,
    item.price_range,
    item.primary_tag,
    item.review_snippet,
    item.search_document,
    ...toArray(item.google_types),
    ...toArray(item.vibe_tags),
    ...toArray(item.best_for_tags),
    ...toArray(item.semantic_tags),
    ...toArray(item.intent_tags),
    item.semantic_search_text,
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

const NON_MEAL_FOOD_TYPES = [
  "juice",
  "juice bar",
  "smoothie",
  "smoothies",
  "açaí",
  "acai",
  "tea",
  "bubble tea",
  "boba",
  "coffee",
  "cafe",
  "bakery",
  "dessert",
  "ice cream",
  "frozen yogurt",
  "yogurt",
  "donut",
  "pastry",
];

function isNonMealFoodPlace(item: any) {
  const text = itemText(item);
  return NON_MEAL_FOOD_TYPES.some((term) => phraseIncludesNormalized(text, term));
}

const DESSERT_TERMS = [
  "dessert",
  "desserts",
  "bakery",
  "bakeshop",
  "pastry",
  "pastries",
  "cake",
  "cakes",
  "cupcake",
  "cupcakes",
  "ice cream",
  "gelato",
  "frozen yogurt",
  "froyo",
  "chocolate",
  "chocolatier",
  "sweets",
  "sweet shop",
  "cookie",
  "cookies",
  "donut",
  "doughnut",
  "waffle",
  "crepe",
  "crepes",
  "pudding",
  "candy",
  "macaron",
  "macarons",
];

const CLEAR_NON_DESSERT_ACTIVITY_TERMS = [
  "candle",
  "candle making",
  "dance",
  "dance studio",
  "studio",
  "paint",
  "painting",
  "pottery",
  "ceramic",
  "ceramics",
  "gym",
  "fitness",
  "spa",
  "massage",
  "museum",
  "gallery",
  "arcade",
  "bowling",
  "axe",
  "escape room",
  "karaoke",
  "hookah",
  "lounge",
  "bar",
  "club",
  "nightclub",
];

const STRONG_DESSERT_TERMS = [
  "bakery",
  "dessert",
  "ice cream",
  "gelato",
  "cake",
  "pastry",
  "chocolate",
  "cookie",
  "cupcake",
];

function userAskedForDessert(
  intent: ReturnType<typeof detectIntent>,
  rawInput?: string,
) {
  const text = `${rawInput || ""} ${(intent?.foodIntents || []).join(" ")} ${(intent?.activityIntents || []).join(" ")}`.toLowerCase();

  return [
    "dessert",
    "desserts",
    "ice cream",
    "gelato",
    "bakery",
    "cake",
    "cupcake",
    "pastry",
    "sweet",
    "sweets",
  ].some((term) => text.includes(term));
}

function isDessertLocation(item: any) {
  const text = itemText(item);

  const hasDessertSignal = DESSERT_TERMS.some((term) =>
    text.includes(term),
  );

  const hasStrongNonDessertActivitySignal =
    CLEAR_NON_DESSERT_ACTIVITY_TERMS.some((term) => text.includes(term));

  if (!hasDessertSignal) return false;

  if (
    hasStrongNonDessertActivitySignal &&
    !STRONG_DESSERT_TERMS.some((term) => text.includes(term))
  ) {
    return false;
  }

  return true;
}

function isClearlyNotDessertLocation(item: any) {
  const text = itemText(item);
  const hasDessertSignal = DESSERT_TERMS.some((term) => text.includes(term));
  if (hasDessertSignal) return false;

  return CLEAR_NON_DESSERT_ACTIVITY_TERMS.some((term) =>
    text.includes(term),
  );
}

function hasClearNonDessertActivityTerm(item: any) {
  const text = itemText(item);
  return CLEAR_NON_DESSERT_ACTIVITY_TERMS.some((term) => text.includes(term));
}


async function trackSearchAppearancesForResponse(responsePayload: any, input: string, outingType?: string) {
  const locationIds = Array.from(
    new Set(
      [
        ...(responsePayload?.restaurants || []).map((item: any) => item?.id),
        ...(responsePayload?.activities || []).map((item: any) => item?.id),
        ...(responsePayload?.matched_locations || []).map((item: any) => item?.id),
      ]
        .filter(Boolean)
        .map(String),
    ),
  ).slice(0, 24);

  await Promise.allSettled(
    locationIds.map((locationId) =>
      trackLocationAnalyticsEvent({
        locationId,
        eventType: "search_appearance",
        eventSource: "search",
        searchQuery: input,
        outingType,
        metadata: {
          result_count: locationIds.length,
          source: "app/api/generate",
        },
      }),
    ),
  );
}

function userAskedForNonMealFood(intent: ReturnType<typeof detectIntent>) {
  return intent.foodIntents.some((food) =>
    [
      "dessert",
      "cafe",
      "drinks",
      "juice",
      "smoothie",
      "coffee",
      "quick_bites",
    ].includes(food),
  );
}

function isMealRestaurant(item: any, intent: ReturnType<typeof detectIntent>) {
  const type = String(item.location_type || "").toLowerCase();
  const text = itemText(item);

  const hasRestaurantSignal =
    type === "restaurant" ||
    Boolean(item.restaurant_name) ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("dinner") ||
    text.includes("brunch") ||
    text.includes("lunch");

  if (!hasRestaurantSignal) return false;

  if (isNonMealFoodPlace(item) && !userAskedForNonMealFood(intent)) {
    return false;
  }

  return true;
}

function mapNonMealFoodPlaceToActivity(
  item: any,
  intent: ReturnType<typeof detectIntent>,
) {
  const originalType = String(item.location_type || "").toLowerCase();
  const requestedNonMealType = intent.foodIntents
    .filter((foodIntent) => FOOD_ADD_ON_INTENTS.has(foodIntent))
    .map((foodIntent) => foodIntent.replace(/_/g, " "))
    .join(" / ");

  return {
    ...item,
    location_type: "activity",
    detail_location_type:
      originalType === "restaurant" ? "restaurants" : "activities",
    activity_name:
      item.activity_name || item.restaurant_name || item.name || "Food stop",
    activity_type:
      item.activity_type ||
      item.category ||
      item.subcategory ||
      requestedNonMealType ||
      "Food stop",
  };
}

function locationDisplayName(item: any) {
  return String(getLocationName(item, "")).trim().toLowerCase();
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
        b.location_name_match_score - a.location_name_match_score,
    )
    .slice(0, 10);
}

const ACTIVITY_LOCATION_TYPES = new Set([
  "activity",
  "lounge",
  "hookah",
  "nightlife",
  "bowling",
  "arcade",
  "museum",
  "rooftop",
  "bar",
  "wellness",
  "creative",
  "event_space",
]);

function normalizeLocationType(type: unknown) {
  return String(type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isRestaurantLocation(location: any) {
  return normalizeLocationType(location?.location_type) === "restaurant";
}

function isActivityLocation(location: any) {
  const type = normalizeLocationType(location?.location_type);
  return type !== "restaurant" || ACTIVITY_LOCATION_TYPES.has(type);
}

function normalizeLocation(item: any) {
  const name = getLocationName(item, "");
  const type = normalizeLocationType(
    item.location_type ||
      (item.activity_name || item.activity_type ? "activity" : "restaurant"),
  );

  const normalized = {
    ...item,
    id: item.id,
    name,
    location_type: type,
    restaurant_name:
      type === "restaurant" ? item.restaurant_name || name : item.restaurant_name,
    activity_name:
      isActivityLocation({ location_type: type })
        ? item.activity_name || name
        : item.activity_name,
    address: item.address || null,
    city: item.city || null,
    state: item.state || null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    cuisine: item.cuisine || item.cuisine_type || null,
    cuisine_type: item.cuisine_type || item.cuisine || null,
    activity_type: item.activity_type || item.category || item.subcategory || null,
    tags: Array.isArray(item.tags) ? item.tags : toArray(item.tags),
    vibe_tags: Array.isArray(item.vibe_tags)
      ? item.vibe_tags
      : toArray(item.vibe_tags),
    best_for_tags: Array.isArray(item.best_for_tags)
      ? item.best_for_tags
      : toArray(item.best_for_tags),
    rating: item.rating ?? null,
    review_count: item.review_count ?? null,
    quality_score: item.quality_score ?? 0,
    popularity_score: item.popularity_score ?? 0,
    search_score: item.search_score ?? item.theouthaven_score ?? item.roseout_score ?? 0,
  };

  return normalized;
}

const MANHATTAN_LOCATION_ALIASES = [
  "manhattan",
  "new york",
  "new york city",
  "soho",
  "tribeca",
  "chelsea",
  "midtown",
  "midtown east",
  "midtown west",
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
];

const QUEENS_LOCATION_ALIASES = [
  "queens",
  "astoria",
  "long island city",
  "lic",
  "sunnyside",
  "woodside",
  "jackson heights",
  "elmhurst",
  "east elmhurst",
  "corona",
  "flushing",
  "bayside",
  "whitestone",
  "college point",
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
  "saint albans",
  "springfield gardens",
  "ozone park",
  "south ozone park",
  "richmond hill",
  "south richmond hill",
  "woodhaven",
  "ridgewood",
  "middle village",
  "maspeth",
  "glendale",
  "bellerose",
  "briarwood",
  "douglaston",
  "little neck",
  "howard beach",
  "rockaway",
  "far rockaway",
  "belle harbor",
  "rockaway beach",
  "arverne",
  "broad channel",
  "auburndale",
  "bay terrace",
  "beechhurst",
  "blissville",
  "brookville",
  "edgemere",
  "glen oaks",
  "hillcrest",
  "holliswood",
  "jamaica hills",
  "kew gardens hills",
  "lindenwood",
  "malba",
  "meadowmere",
  "murray hill queens",
  "murray hill",
  "neponsit",
  "queensboro hill",
  "queensbridge",
  "ravenswood",
  "rosedale",
  "roxbury",
  "seaside",
  "springfield",
  "steinway",
  "ditmars",
  "ditmars steinway",
  "utopia",
  "alley pond",
  "arverne by the sea",
  "astoria heights",
  "bay terrace queens",
  "bayswater",
  "bellaire",
  "bellerose manor",
  "bowne park",
  "cambria heights",
  "clearview",
  "corona heights",
  "downtown flushing",
  "east flushing",
  "edgemere queens",
  "elmhurst queens",
  "fresh pond",
  "glen oaks village",
  "hamilton beach",
  "hammels",
  "hunters point",
  "kew gardens queens",
  "laurelton queens",
  "lefrak city",
  "linden hill",
  "long island city queens",
  "murray hill flushing",
  "old astoria",
  "pomonok",
  "queens plaza",
  "rego park queens",
  "rockaway park",
  "south jamaica",
  "st. albans",
  "willets point",
  "windsor park",
];

const NASSAU_LOCATION_ALIASES = [
  "hempstead",
  "north hempstead",
  "oyster bay",
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
  "bethpage",
  "farmingdale",
  "great neck",
  "manhasset",
  "port washington",
  "roslyn",
  "syosset",
  "plainview",
  "woodbury",
  "jericho",
  "wantagh",
  "merrick",
  "bellmore",
  "oceanside",
  "lynbrook",
  "malverne",
  "albertson",
  "baldwin",
  "carle place",
  "cedarhurst",
  "east meadow",
  "east rockaway",
  "floral park",
  "franklin square",
  "glen cove",
  "glen head",
  "glenwood landing",
  "great neck plaza",
  "hewlett",
  "inwood nassau",
  "island park nassau",
  "lawrence",
  "locust valley",
  "manorhaven",
  "new hyde park",
  "north bellmore",
  "north merrick",
  "old westbury",
  "point lookout",
  "sea cliff",
  "seaford",
  "stewart manor",
  "williston park",
];

const SUFFOLK_LOCATION_ALIASES = [
  "babylon",
  "deer park",
  "ronkonkoma",
  "patchogue",
  "huntington",
  "island park",
  "smithtown",
  "commack",
  "bay shore",
  "islip",
  "east islip",
  "sayville",
  "hauppauge",
  "melville",
  "riverhead",
  "hampton bays",
  "southampton",
  "east hampton",
  "montauk",
  "greenport",
  "amityville",
  "bayport",
  "bellport",
  "blue point",
  "bohemia",
  "brentwood",
  "bridgehampton",
  "brookhaven",
  "centerport",
  "central islip",
  "copiague",
  "dix hills",
  "east northport",
  "farmingville",
  "fire island",
  "great river",
  "holbrook",
  "holtsville",
  "kings park",
  "lake grove",
  "lindenhurst",
  "mastic",
  "mastic beach",
  "medford",
  "miller place",
  "nesconset",
  "northport",
  "oakdale",
  "port jefferson",
  "port jefferson station",
  "rocky point",
  "sag harbor",
  "selden",
  "setauket",
  "shirley",
  "st james",
  "stony brook",
  "westhampton beach",
  "yaphank",
];

const LONG_ISLAND_LOCATION_ALIASES = [
  "nassau",
  "nassau county",
  "suffolk",
  "suffolk county",
  ...NASSAU_LOCATION_ALIASES,
  ...SUFFOLK_LOCATION_ALIASES,
];

const NEW_JERSEY_LOCATION_ALIASES = [
  "new jersey",
  "north jersey",
  "bergen county",
  "essex county",
  "hudson county",
  "passaic county",
  "union county",
  "morris county",
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
  "bayonne",
  "kearny",
  "harrison",
  "elizabeth",
  "maplewood",
  "montclair",
  "bloomfield",
  "clifton",
  "paterson",
  "teaneck",
  "ridgefield",
  "ridgefield park",
  "north bergen",
  "west new york",
  "guttenberg",
  "fairview",
  "palisades park",
  "leonia",
  "asbury park",
  "belmar",
  "belleville",
  "boonton",
  "caldwell",
  "cedar grove",
  "cranford",
  "dover",
  "east orange",
  "elmwood park",
  "emerson",
  "garfield",
  "glen ridge",
  "glen rock",
  "hasbrouck heights",
  "hawthorne",
  "hillsdale",
  "irvington",
  "little ferry",
  "little falls",
  "livingston",
  "lodi",
  "lyndhurst",
  "mahwah",
  "maywood",
  "millburn",
  "morristown",
  "new brunswick",
  "north arlington",
  "nutley",
  "passaic",
  "rutherford",
  "south orange",
  "summit",
  "teterboro",
  "totowa",
  "wayne",
  "wood ridge",
];

const NEW_JERSEY_LOCATION_TERMS = new Set(NEW_JERSEY_LOCATION_ALIASES);

const LOCATION_AREA_ALIASES: Record<string, string[]> = {
  queens: QUEENS_LOCATION_ALIASES,
  "long island": LONG_ISLAND_LOCATION_ALIASES,
  nassau: ["nassau county", ...NASSAU_LOCATION_ALIASES],
  "nassau county": ["nassau", ...NASSAU_LOCATION_ALIASES],
  suffolk: ["suffolk county", ...SUFFOLK_LOCATION_ALIASES],
  "suffolk county": ["suffolk", ...SUFFOLK_LOCATION_ALIASES],
  "new jersey": NEW_JERSEY_LOCATION_ALIASES,
  "north jersey": NEW_JERSEY_LOCATION_ALIASES,
};

const LONG_ISLAND_LOCATION_TERMS = new Set([
  "long island",
  "nassau",
  "nassau county",
  "suffolk",
  "suffolk county",
  ...LONG_ISLAND_LOCATION_ALIASES,
]);

function locationSearchText(item: any) {
  return normalizeQuery(
    [
      item.city,
      item.neighborhood,
      item.borough,
      ...toArray(item.location_tags),
      ...toArray(item.neighborhood_tags),
      ...toArray(item.area_tags),
      item.state,
      item.zip_code,
      item.address,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function locationIntentIncludes(
  detectedLocations: string[],
  terms: Set<string>,
) {
  return detectedLocations.some((location) =>
    terms.has(normalizeQuery(location)),
  );
}

function hasCoordinateInBounds(
  item: any,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  return (
    latitude >= bounds.minLat &&
    latitude <= bounds.maxLat &&
    longitude >= bounds.minLng &&
    longitude <= bounds.maxLng
  );
}

function isLongIslandCityLocation(item: any) {
  const normalizedFields = [
    item.city,
    item.neighborhood,
    item.borough,
    ...toArray(item.location_tags),
    ...toArray(item.neighborhood_tags),
    ...toArray(item.area_tags),
  ]
    .filter(Boolean)
    .map((value) => normalizeQuery(String(value)));

  return (
    normalizedFields.includes("long island city") ||
    normalizedFields.includes("lic") ||
    (normalizedFields.includes("queens") &&
      locationSearchText(item).includes("long island city"))
  );
}

function matchesLongIslandLocation(item: any) {
  const searchable = locationSearchText(item);
  const state = normalizeQuery(String(item.state || ""));

  if (state === "nj" || searchable.includes("new jersey")) return false;
  if (isLongIslandCityLocation(item)) return false;

  if (
    Array.from(LONG_ISLAND_LOCATION_TERMS).some((term) =>
      searchable.includes(term),
    )
  ) {
    return true;
  }

  return hasCoordinateInBounds(item, {
    minLat: 40.5,
    maxLat: 41.35,
    minLng: -73.8,
    maxLng: -71.75,
  });
}

function matchesNewJerseyLocation(item: any) {
  const searchable = locationSearchText(item);
  const state = normalizeQuery(String(item.state || ""));

  if (state === "nj" || searchable.includes("new jersey")) return true;

  return (
    Array.from(NEW_JERSEY_LOCATION_TERMS).some((term) =>
      searchable.includes(term),
    ) ||
    hasCoordinateInBounds(item, {
      minLat: 40.45,
      maxLat: 41.25,
      minLng: -74.35,
      maxLng: -73.85,
    })
  );
}

function expandDetectedLocations(detectedLocations: Iterable<string>) {
  const expanded = new Set<string>();

  Array.from(detectedLocations).forEach((location) => {
    const normalizedLocation = normalizeQuery(location);

    if (!normalizedLocation) return;

    expanded.add(normalizedLocation);

    (LOCATION_AREA_ALIASES[normalizedLocation] || []).forEach((alias) => {
      expanded.add(normalizeQuery(alias));
    });
  });

  return Array.from(expanded);
}

function detectLocation(input: string, locations: any[]) {
  const text = normalizeQuery(input);
  const found = new Set<string>();

  locations.forEach((item) => {
    const fields = [
      item.city,
      item.neighborhood,
      item.borough,
      ...toArray(item.location_tags),
      ...toArray(item.neighborhood_tags),
      ...toArray(item.area_tags),
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
    ...QUEENS_LOCATION_ALIASES,
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
    ...LONG_ISLAND_LOCATION_ALIASES,
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
    ...NEW_JERSEY_LOCATION_ALIASES,
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

  if (found.has("long island city") || found.has("lic")) {
    found.delete("long island");
  }

  return expandDetectedLocations(found);
}

function matchesLocation(item: any, detectedLocations: string[]) {
  if (!detectedLocations || detectedLocations.length === 0) return true;

  if (locationIntentIncludes(detectedLocations, LONG_ISLAND_LOCATION_TERMS)) {
    return matchesLongIslandLocation(item);
  }

  if (locationIntentIncludes(detectedLocations, NEW_JERSEY_LOCATION_TERMS)) {
    return matchesNewJerseyLocation(item);
  }

  const searchable = locationSearchText(item);

  return detectedLocations.some((location) =>
    searchable.includes(normalizeQuery(location)),
  );
}


type StrongGeoArea =
  | "manhattan"
  | "queens"
  | "brooklyn"
  | "bronx"
  | "long_island"
  | "new_jersey";

const BROOKLYN_LOCATION_TERMS = new Set([
  "brooklyn",
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
  "flatbush",
  "sunset park",
  "bay ridge",
  "red hook",
  "gowanus",
  "carroll gardens",
  "cobble hill",
  "boerum hill",
  "bensonhurst",
  "sheepshead bay",
  "brighton beach",
  "coney island",
  "canarsie",
  "brownsville",
  "east new york",
]);

const BRONX_LOCATION_TERMS = new Set([
  "bronx",
  "the bronx",
  "mott haven",
  "fordham",
  "riverdale",
  "kingsbridge",
  "pelham bay",
  "throgs neck",
  "soundview",
  "hunts point",
]);

const MANHATTAN_BOUNDS = {
  minLat: 40.68,
  maxLat: 40.9,
  minLng: -74.03,
  maxLng: -73.9,
};
const QUEENS_BOUNDS = { minLat: 40.48, maxLat: 40.82, minLng: -73.96, maxLng: -73.68 };
const BROOKLYN_BOUNDS = { minLat: 40.56, maxLat: 40.74, minLng: -74.05, maxLng: -73.83 };
const BRONX_BOUNDS = { minLat: 40.78, maxLat: 40.92, minLng: -73.93, maxLng: -73.75 };
const NYC_BOROUGHS = ["Queens", "Brooklyn", "Manhattan", "Bronx", "Staten Island"] as const;
type NycBorough = (typeof NYC_BOROUGHS)[number];

const BOROUGH_ALIASES: Record<NycBorough, string[]> = {
  Queens: [
    "queens", "astoria", "long island city", "lic", "flushing", "jamaica", "forest hills", "rego park", "bayside",
    "jackson heights", "elmhurst", "corona", "sunnyside", "woodside", "ridgewood", "ozone park", "howard beach",
    "rockaway", "queens village", "springfield gardens", "laurelton", "rosedale",
  ],
  Brooklyn: [
    "brooklyn", "williamsburg", "bushwick", "bed stuy", "bed-stuy", "crown heights", "park slope", "downtown brooklyn",
    "dumbo", "flatbush", "canarsie", "bay ridge", "coney island", "red hook", "greenpoint",
  ],
  Manhattan: [
    "manhattan", "harlem", "midtown", "chelsea", "soho", "tribeca", "les", "lower east side", "east village",
    "west village", "financial district", "fidi", "upper east side", "upper west side", "washington heights",
  ],
  Bronx: ["bronx", "the bronx", "fordham", "riverdale", "mott haven", "hunts point", "pelham bay", "throgs neck", "soundview", "morris park", "kingsbridge"],
  "Staten Island": ["staten island", "st george", "st. george", "stapleton", "tottenville", "new dorp", "great kills", "port richmond"],
};

type RequestedGeo = {
  borough: NycBorough | null;
  city: string | null;
  neighborhood: string | null;
  hasHardGeo: boolean;
};

function normalizeGeoText(value: unknown) {
  return normalizeQuery(String(value || "")).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function detectRequestedGeo(input: string): RequestedGeo {
  const text = normalizeGeoText(input);
  let borough: NycBorough | null = null;
  let neighborhood: string | null = null;

  for (const boroughName of NYC_BOROUGHS) {
    const aliases = BOROUGH_ALIASES[boroughName];
    const match = aliases.find((alias) => text.includes(normalizeGeoText(alias)));
    if (match) {
      borough = boroughName;
      if (normalizeGeoText(match) !== normalizeGeoText(boroughName)) neighborhood = match;
      break;
    }
  }

  const city = borough ? "New York" : null;
  return { borough, city, neighborhood, hasHardGeo: Boolean(borough || city || neighborhood) };
}

function normalizeItemBorough(item: any): NycBorough | null {
  const fields = [item?.borough, item?.neighborhood, item?.city, item?.address];
  const joined = fields.map(normalizeGeoText).join(" ");
  for (const boroughName of NYC_BOROUGHS) {
    if (BOROUGH_ALIASES[boroughName].some((alias) => joined.includes(normalizeGeoText(alias)))) return boroughName;
  }
  if (normalizeGeoText(item?.city) === "new york" && BOROUGH_ALIASES.Manhattan.some((alias) => joined.includes(normalizeGeoText(alias)))) {
    return "Manhattan";
  }
  return null;
}

function itemMatchesRequestedGeo(item: any, requestedGeo: RequestedGeo) {
  if (!requestedGeo.hasHardGeo) return true;
  if (requestedGeo.borough) return normalizeItemBorough(item) === requestedGeo.borough;
  const searchable = [item?.city, item?.neighborhood, item?.address, item?.borough].map(normalizeGeoText).join(" ");
  return [requestedGeo.city, requestedGeo.neighborhood]
    .filter(Boolean)
    .some((value) => searchable.includes(normalizeGeoText(value)));
}

function applyHardGeoFilter<T>(items: T[], requestedGeo: RequestedGeo) {
  if (!requestedGeo.hasHardGeo) return items;
  return items.filter((item: any) => itemMatchesRequestedGeo(item, requestedGeo));
}

function requestedStrongGeoAreas(intent: ReturnType<typeof detectIntent>) {
  const requested = expandDetectedLocations(intent.locations || []);
  const areas = new Set<StrongGeoArea>();

  requested.forEach((location) => {
    const normalized = normalizeQuery(location);

    if (normalized === "manhattan" || MANHATTAN_LOCATION_ALIASES.includes(normalized)) {
      areas.add("manhattan");
    }
    if (normalized === "queens" || QUEENS_LOCATION_ALIASES.includes(normalized)) {
      areas.add("queens");
    }
    if (BROOKLYN_LOCATION_TERMS.has(normalized)) areas.add("brooklyn");
    if (BRONX_LOCATION_TERMS.has(normalized)) areas.add("bronx");
    if (LONG_ISLAND_LOCATION_TERMS.has(normalized)) areas.add("long_island");
    if (NEW_JERSEY_LOCATION_TERMS.has(normalized)) areas.add("new_jersey");
  });

  return areas;
}

function inferStrongGeoArea(item: any): StrongGeoArea | null {
  const searchable = locationSearchText(item);
  const walkingArea = inferWalkingArea(item);

  if (walkingArea === "new_jersey") return "new_jersey";
  if (walkingArea === "queens") return "queens";

  if (
    searchable.includes("brooklyn") ||
    Array.from(BROOKLYN_LOCATION_TERMS).some((term) => searchable.includes(term)) ||
    hasCoordinateInBounds(item, BROOKLYN_BOUNDS)
  ) {
    return "brooklyn";
  }

  if (
    searchable.includes("bronx") ||
    Array.from(BRONX_LOCATION_TERMS).some((term) => searchable.includes(term)) ||
    hasCoordinateInBounds(item, BRONX_BOUNDS)
  ) {
    return "bronx";
  }

  if (walkingArea === "manhattan" || hasCoordinateInBounds(item, MANHATTAN_BOUNDS)) {
    return "manhattan";
  }

  if (matchesLongIslandLocation(item)) return "long_island";
  if (hasCoordinateInBounds(item, QUEENS_BOUNDS)) return "queens";

  return null;
}

function hasRequestedStateMismatch(item: any, intent: ReturnType<typeof detectIntent>) {
  const requested = expandDetectedLocations(intent.locations || []);
  const itemState = normalizeQuery(String(item.state || ""));

  if (!itemState || requested.length === 0) return false;

  const wantsNJ = requested.some((location) => NEW_JERSEY_LOCATION_TERMS.has(location));
  const wantsNY = requested.some(
    (location) =>
      location === "nyc" ||
      location === "new york" ||
      location === "new york city" ||
      location === "manhattan" ||
      location === "brooklyn" ||
      location === "queens" ||
      location === "bronx" ||
      location === "long island" ||
      LONG_ISLAND_LOCATION_TERMS.has(location) ||
      QUEENS_LOCATION_ALIASES.includes(location) ||
      MANHATTAN_LOCATION_ALIASES.includes(location) ||
      BROOKLYN_LOCATION_TERMS.has(location) ||
      BRONX_LOCATION_TERMS.has(location),
  );

  return (wantsNJ && itemState !== "nj" && itemState !== "new jersey") ||
    (wantsNY && itemState !== "ny" && itemState !== "new york");
}

function isStrongGeoMismatch(item: any, intent: ReturnType<typeof detectIntent>): boolean {
  if (!intent.locations || intent.locations.length === 0) return false;

  const requestedAreas = requestedStrongGeoAreas(intent);
  const itemArea = inferStrongGeoArea(item);

  if (requestedAreas.size > 0) {
    if (!itemArea) return hasRequestedStateMismatch(item, intent);
    return !requestedAreas.has(itemArea);
  }

  if (hasRequestedStateMismatch(item, intent)) return true;

  return !matchesLocation(item, intent.locations);
}

function applyStrongGeoFilter<T>(items: T[], intent: ReturnType<typeof detectIntent>) {
  if (!intent.locations || intent.locations.length === 0) return items;

  const filtered = items.filter((item: any) => !isStrongGeoMismatch(item, intent));

  return filtered.length > 0 ? filtered : items;
}

function sameRequestedState(item: any, intent: ReturnType<typeof detectIntent>) {
  const requested = expandDetectedLocations(intent.locations || []);
  const state = normalizeQuery(String(item.state || ""));

  if (requested.some((location) => NEW_JERSEY_LOCATION_TERMS.has(location))) {
    return state === "nj" || state === "new jersey";
  }

  if (requested.length > 0) return state === "ny" || state === "new york";

  return true;
}

function fallbackByGeoStages(
  sourceLocations: any[],
  predicate: (item: any) => boolean,
  intent: ReturnType<typeof detectIntent>,
  strictWalkingRequest: boolean,
) {
  const base = sourceLocations.filter(predicate);
  if (base.length === 0) return [];

  const sameCityOrBorough = base.filter((item) => matchesLocation(item, intent.locations));
  if (sameCityOrBorough.length > 0) return sameCityOrBorough;

  const sameState = base.filter((item) => sameRequestedState(item, intent));
  if (sameState.length > 0) return sameState;

  if (strictWalkingRequest && intent.locations.length > 0) return [];

  return base;
}

function locationIdentityKey(item: any) {
  const placeId = item.google_place_id || item.place_id;

  if (placeId) return normalizeQuery(String(placeId));

  const nameAddressKey = normalizeQuery(
    [getLocationName(item, ""), item.address, item.city]
      .filter(Boolean)
      .join(" "),
  );

  return nameAddressKey || normalizeQuery(String(item.id || ""));
}

function isLoungeStyleLocation(item: any) {
  const searchable = itemText(item);

  return (
    searchable.includes("lounge") ||
    searchable.includes("hookah") ||
    searchable.includes("shisha") ||
    searchable.includes("cigar") ||
    searchable.includes("nightclub") ||
    searchable.includes("night club") ||
    searchable.includes("cocktail lounge") ||
    searchable.includes("rooftop bar")
  );
}
function isExplicitFoodAtLoungeRequest(
  intent: ReturnType<typeof detectIntent>,
) {
  const text = intent.text;

  if (!intent.wantsLounge) return false;

  return (
    text.includes("food") ||
    text.includes("eat") ||
    text.includes("dinner") ||
    text.includes("lunch") ||
    text.includes("brunch") ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("kitchen") ||
    text.includes("serve food") ||
    text.includes("with food")
  );
}

function isLoungeActivityOnlyRequest(intent: ReturnType<typeof detectIntent>) {
  return intent.wantsLounge && !isExplicitFoodAtLoungeRequest(intent);
}

function removeDuplicateLocationsWithinType<T>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = locationIdentityKey(item);

    if (!key) return true;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function removeDuplicateLocationsAcrossTypes(
  restaurants: any[],
  activities: any[],
  prefer: "restaurants" | "activities" = "activities",
) {
  const uniqueRestaurants = removeDuplicateLocationsWithinType(restaurants);
  const uniqueActivities = removeDuplicateLocationsWithinType(activities);
  const restaurantKeys = new Set(uniqueRestaurants.map(locationIdentityKey));
  const activityKeys = new Set(uniqueActivities.map(locationIdentityKey));

  if (prefer === "restaurants") {
    return {
      restaurants: uniqueRestaurants,
      activities: uniqueActivities.filter(
        (activity) => !restaurantKeys.has(locationIdentityKey(activity)),
      ),
    };
  }

  return {
    restaurants: uniqueRestaurants.filter(
      (restaurant) => !activityKeys.has(locationIdentityKey(restaurant)),
    ),
    activities: uniqueActivities,
  };
}

const NON_OUTING_LOCATION_KEYWORDS = [
  "hospital",
  "medical center",
  "medical clinic",
  "urgent care",
  "doctor",
  "dentist",
  "dental",
  "pharmacy",
  "health clinic",
  "healthcare",
  "pediatric",
  "therapy",
  "physical therapy",
  "rehab",
  "veterinary",
  "animal hospital",
  "funeral home",
  "cemetery",
  "school",
  "daycare",
  "university",
  "church",
  "mosque",
  "synagogue",
  "place of worship",
  "courthouse",
  "city hall",
  "government office",
  "local government",
  "municipal",
  "police",
  "fire station",
  "post office",
  "library",
  "bank",
  "atm",
  "insurance agency",
  "law office",
  "lawyer",
  "accounting",
  "tax service",
  "consultant",
  "office",
  "real estate agency",
  "storage facility",
  "parking garage",
  "gas station",
  "car repair",
  "laundromat",
];

function isOutingEligibleLocation(item: any) {
  const disqualifyingText = normalizeQuery(
    [
      item.activity_name,
      item.name,
      item.category,
      item.categories,
      item.subcategory,
      ...getLocationTags(item),
      item.description,
      item.address,
      item.business_status,
      ...toArray(item.types),
      ...toArray(item.search_keywords),
      ...toArray(item.categories),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return !NON_OUTING_LOCATION_KEYWORDS.some((keyword) =>
    disqualifyingText.includes(keyword),
  );
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
    "new jersey",
    "north jersey",
    "jersey city",
    "hoboken",
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
          keywords.some((keyword) => text.includes(keyword)),
        )
        .map(([key]) => key),
    ),
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
  if (foodIntent === "hookah") return isHookahPlace(item);
  if (foodIntent === "cigar") return isCigarPlace(item);

  const searchable = itemText(item);
  const keywords = FOOD_INTENTS[foodIntent] || [foodIntent.replace(/_/g, " ")];

  return keywords.some((keyword) => searchable.includes(keyword));
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

function budgetBoost(item: any, budget: ReturnType<typeof detectBudget>) {
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

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 3958.8;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingMinutesFromMiles(distanceMiles: number | null) {
  if (distanceMiles === null || !Number.isFinite(distanceMiles)) return null;

  return Math.max(1, Math.round(distanceMiles * WALKING_MINUTES_PER_MILE));
}

function walkingLabelBetweenStops(
  distanceMiles: number | null,
  fromName?: string | null,
) {
  const walkingMinutes = walkingMinutesFromMiles(distanceMiles);

  if (!walkingMinutes || !fromName) return null;

  return `${walkingMinutes} min walk from ${fromName}`;
}

function isWithinTheOutHavenServiceArea(item: any) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);

  if (!lat || !lng) return true;

  // NYC + Long Island + Westchester + North Jersey
  return lat >= 40.4 && lat <= 41.2 && lng >= -74.3 && lng <= -73.5;
}

function distanceBoost(
  item: any,
  userLat?: number,
  userLng?: number,
  maxMiles?: number | null,
) {
  if (!userLat || !userLng || !item.latitude || !item.longitude) return 0;

  const miles = haversineMiles(
    Number(userLat),
    Number(userLng),
    Number(item.latitude),
    Number(item.longitude),
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
    0,
  );
}

function weightedVibeBoost(item: any, vibes: string[]) {
  return vibes.reduce(
    (total, vibe) =>
      total + (itemHasTag(item, vibe) ? PRIORITY_WEIGHTS.vibeExact : 0),
    0,
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
  const text = normalizeQuery(input);

  const requestedTags = detectFromMap(input, TAG_KEYWORDS);
  const rawFoodIntents = detectFromMap(input, FOOD_INTENTS);
  const rawActivityIntents = detectFromMap(input, ACTIVITY_INTENTS);

  const loungeFromFood = rawFoodIntents.filter(isLoungeActivityIntent);
  const realMealFoodIntents = rawFoodIntents.filter(
    (intent) => !isLoungeActivityIntent(intent)
  );
  const foodIntents =
    realMealFoodIntents.length > 0 ? realMealFoodIntents : rawFoodIntents;

  const activityIntents = Array.from(
    new Set([...rawActivityIntents, ...loungeFromFood])
  );
  const detectedLocations = detectLocation(input, locations);

  const wantsFoodMap = buildWantsMap(Object.keys(FOOD_INTENTS), foodIntents);
  const wantsActivityMap = buildWantsMap(
    Object.keys(ACTIVITY_INTENTS),
    activityIntents,
  );

  const wantsFood =
    FOOD_KEYWORDS.some((word) => text.includes(word)) || foodIntents.length > 0;

  const wantsActivity =
    ACTIVITY_KEYWORDS.some((word) => text.includes(word)) ||
    activityIntents.length > 0;

  const allOptions = [
    ...Object.values(FOOD_INTENTS).flat(),
    ...Object.values(ACTIVITY_INTENTS).flat(),
    ...Object.values(TAG_KEYWORDS).flat(),
  ];

  const mentionsAnyTheOutHavenOption = allOptions.some((option) =>
    text.includes(option),
  );

  const wantsFullOuting =
    text.includes("date night") ||
    text.includes("outing") ||
    text.includes("night out") ||
    text.includes("full plan") ||
    text.includes("plan a date") ||
    text.includes("birthday plan") ||
    text.includes("birthday outing") ||
    text.includes("date idea") ||
    text.includes("date ideas") ||
    text.includes("places to go") ||
    text.includes("things to do") ||
    text.includes("with") ||
    text.includes("and") ||
    (wantsFood && wantsActivity) ||
    (foodIntents.length > 0 && activityIntents.length > 0) ||
    (mentionsAnyTheOutHavenOption && text.includes("date"));

  const wantsRestaurant =
    wantsFood || wantsFullOuting || (!wantsFood && !wantsActivity);

  const vibes = Array.from(
    new Set([
      ...requestedTags.filter((tag) =>
        [
          "romantic",
          "fun",
          "luxury",
          "chill",
          "nightlife",
          "scenic",
          "birthday",
        ].includes(tag),
      ),
      ...(text.includes("romantic") ? ["romantic"] : []),
      ...(text.includes("fun") ? ["fun"] : []),
      ...(text.includes("luxury") || text.includes("upscale")
        ? ["luxury"]
        : []),
      ...(text.includes("chill") ? ["chill"] : []),
    ]),
  );

  const budget = detectBudget(input);
  const maxMiles = body.maxMiles || body.max_miles || detectDistance(input);
  const userLat = body.lat || body.latitude || null;
  const userLng = body.lng || body.longitude || null;

  const onlyFoodAddOnRequested =
    foodIntents.length > 0 && foodIntents.every(isFoodAddOnIntent);
  const primaryMealRequested =
    wantsPrimaryMeal(input) && !(onlyFoodAddOnRequested && !wantsFullOuting);

  const multiIntentMode =
    wantsFullOuting ||
    (foodIntents.length > 0 && activityIntents.length > 0) ||
    (wantsFood && wantsActivity);

  return {
    text,
    wantsFood,
    wantsActivity,
    wantsFullOuting,
    wantsRestaurant,
    wantsPrimaryMeal: primaryMealRequested,
    requestedTags,
    foodIntents,
    activityIntents,
    wantsFoodMap,
    wantsActivityMap,
    wantsBudget: Boolean(budget.level),
    budget,
    userLat,
    userLng,
    maxMiles,
    vibes,
    multiIntentMode,
    locations: detectedLocations,

    wantsBirthday: text.includes("birthday"),
    wantsBirthdayDinner: text.includes("birthday dinner"),
    wantsBirthdayBrunch: text.includes("birthday brunch"),
    wantsRooftop:
      foodIntents.includes("rooftop") ||
      activityIntents.includes("rooftop") ||
      requestedTags.includes("rooftop"),
    wantsHookah:
      foodIntents.includes("hookah") || activityIntents.includes("hookah"),
    wantsCigar:
      foodIntents.includes("cigar") || activityIntents.includes("cigar"),
    wantsLounge:
      foodIntents.includes("lounge") || activityIntents.includes("lounge"),
    wantsNightclub: activityIntents.includes("nightclub"),
  };
}

type NearbySortableLocation = {
  distance_miles?: unknown;
  theouthaven_score?: unknown;
  roseout_score?: unknown;
  quality_score?: unknown;
  trend_score?: unknown;
  conversion_score?: unknown;
  review_score?: unknown;
};

function resultDistanceValue(item: NearbySortableLocation) {
  const distance = Number(item.distance_miles);

  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function resultScoreValue(item: NearbySortableLocation) {
  const score = Number(getSearchRankingScore(item));

  return Number.isFinite(score) ? score : 0;
}

function sortLocationsNearFirst<T extends NearbySortableLocation>(
  items: T[],
  intent: ReturnType<typeof detectIntent>,
) {
  const shouldPrioritizeNearby = Boolean(
    (intent.userLat && intent.userLng) ||
    intent.maxMiles ||
    intent.locations.length,
  );

  if (!shouldPrioritizeNearby) return items;

  return [...items].sort((a, b) => {
    const aMatchesLocation = matchesLocation(a, intent.locations);
    const bMatchesLocation = matchesLocation(b, intent.locations);

    if (aMatchesLocation !== bMatchesLocation) {
      return aMatchesLocation ? -1 : 1;
    }

    const aDistance = resultDistanceValue(a);
    const bDistance = resultDistanceValue(b);

    if (aDistance !== bDistance) return aDistance - bDistance;

    return resultScoreValue(b) - resultScoreValue(a);
  });
}


function calculateSearchQualityScore(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>,
) {
  let score = 0;
  const query = normalizeQuery(input);
  const name = locationDisplayName(item);
  const text = itemText(item);
  const rating = Number(item.rating || 0);
  const reviewCount = Number(item.review_count || 0);
  const qualityScore = Number(item.quality_score || 0);
  const popularityScore = Number(item.popularity_score || 0);

  if (name && query) {
    if (query === name) score += 700;
    else if (query.includes(name) || name.includes(query)) score += 350;
    else {
      const queryWords = query.split(" ").filter((word) => word.length > 2);
      const nameWords = name.split(" ").filter((word) => word.length > 2);
      const overlap = nameWords.filter((word) => queryWords.includes(word)).length;
      score += overlap * 65;
    }
  }

  if (intent.locations.length > 0) {
    if (isStrongGeoMismatch(item, intent)) score -= 500;
    else if (matchesLocation(item, intent.locations)) score += 180;
    else score -= 120;
  }

  intent.foodIntents.forEach((foodIntent) => {
    score += matchesFoodIntent(item, foodIntent) ? 160 : -35;
  });

  intent.activityIntents.forEach((activityIntent) => {
    score += matchesActivityIntent(item, activityIntent) ? 160 : -35;
  });

  [...intent.vibes, ...intent.requestedTags].forEach((tag) => {
    if (itemHasTag(item, tag) || text.includes(normalizeQuery(tag))) score += 55;
  });

  if (rating >= 4.7) score += 120;
  else if (rating >= 4.5) score += 95;
  else if (rating >= 4.2) score += 65;
  else if (rating >= 4.0) score += 25;
  else if (rating > 0) score -= 140;

  if (reviewCount > 0) score += Math.min(150, Math.log10(reviewCount + 1) * 55);
  score += Math.min(180, Math.max(0, qualityScore) * 0.75);
  score += Math.min(120, Math.max(0, popularityScore) * 0.45);
  score += Math.min(100, Math.max(0, Number(item.search_score || 0)) * 0.35);

  const distance = Number(item.distance_miles);
  if (Number.isFinite(distance)) {
    if (distance <= 0.5) score += 120;
    else if (distance <= 1) score += 95;
    else if (distance <= 2) score += 70;
    else if (distance <= 5) score += 35;
    else if (distance > 10) score -= 60;
  }

  const wantsNearbyOrWalking =
    intent.maxMiles ||
    query.includes("nearby") ||
    query.includes("near me") ||
    query.includes("walking distance") ||
    query.includes("walkable") ||
    query.includes("close by");

  if (wantsNearbyOrWalking && (!item.latitude || !item.longitude)) score -= 180;

  if (userAskedForDessert(intent, input)) {
    const dessertLocation = isDessertLocation(item);

    if (dessertLocation) score += 150;
    if (STRONG_DESSERT_TERMS.some((term) => text.includes(term))) {
      score += 200;
    }
    if (isClearlyNotDessertLocation(item)) score -= 500;
    if (!dessertLocation && hasClearNonDessertActivityTerm(item)) score -= 1000;
  }

  return score;
}

function diversifyResults<T extends Record<string, any>>(items: T[], maxResults: number) {
  const sorted = [...items].sort(
    (a, b) => Number(b.theouthaven_score || b.smart_match_score || 0) - Number(a.theouthaven_score || a.smart_match_score || 0),
  );
  const selected: T[] = [];
  const deferred: T[] = [];
  const seenNames = new Set<string>();
  const topSixTypeCounts = new Map<string, number>();
  const topSixAreaCounts = new Map<string, number>();
  const specificLocationRequested = sorted.some((item: any) => item.__specific_location_requested);

  sorted.forEach((item) => {
    const nameKey = normalizeQuery(getLocationName(item, ""));
    if (nameKey && seenNames.has(nameKey)) return;

    const typeKey = normalizeQuery(
      item.cuisine || item.cuisine_type || item.activity_type || item.primary_category || item.location_type || "other",
    );
    const areaKey = normalizeQuery(item.neighborhood || item.city || item.borough || "unknown");
    const inTopSix = selected.length < 6;
    const tooMuchSameType = inTopSix && typeKey && (topSixTypeCounts.get(typeKey) || 0) >= 2;
    const tooMuchSameArea =
      inTopSix &&
      !specificLocationRequested &&
      areaKey &&
      areaKey !== "unknown" &&
      (topSixAreaCounts.get(areaKey) || 0) >= 3;

    if (tooMuchSameType || tooMuchSameArea) {
      deferred.push(item);
      return;
    }

    selected.push(item);
    if (nameKey) seenNames.add(nameKey);
    if (selected.length <= 6) {
      topSixTypeCounts.set(typeKey, (topSixTypeCounts.get(typeKey) || 0) + 1);
      topSixAreaCounts.set(areaKey, (topSixAreaCounts.get(areaKey) || 0) + 1);
    }
  });

  deferred.forEach((item) => {
    if (selected.length >= maxResults) return;
    const nameKey = normalizeQuery(getLocationName(item, ""));
    if (nameKey && seenNames.has(nameKey)) return;
    selected.push(item);
    if (nameKey) seenNames.add(nameKey);
  });

  return selected.slice(0, maxResults);
}

function scoreRestaurant(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>,
) {
  let score = 0;
  const restaurantScoringIntent = {
    ...intent,
    foodIntents: getMealFoodIntents(intent),
  };

  score += locationNameMatchScore(item, input);

  if (shouldRestaurantFirstMixedIntent(intent)) {
    if (isRestaurantWithHookahAndMeal(item, intent)) {
      score += 450;
    } else if (isHookahPlace(item)) {
      score += 75;
    }
  }
  score += calculateSearchQualityScore(item, input, intent);
  score += keywordBoost(item, input);
  score += weightedVibeBoost(item, intent.vibes);
  score += weightedTagBoost(item, intent.requestedTags);
  score += weightedFoodBoost(item, restaurantScoringIntent.foodIntents);

  if (intent.wantsPrimaryMeal && isDessertOnlyRestaurant(item)) {
    score -= 260;
  }

  score += budgetBoost(item, intent.budget);
  score += distanceBoost(item, intent.userLat, intent.userLng, intent.maxMiles);
  score += popularityBoost(item);

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
    if (shouldRestaurantFirstMixedIntent(intent)) {
      score += isHookahPlace(item) ? 180 : 25;
    } else {
      score += isHookahPlace(item)
        ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.foodExact
        : PRIORITY_WEIGHTS.mismatchPenalty;
    }
  }

  score += clampScore(getSearchRankingScore(item)) * 0.4;
  score += clampScore(item.popularity_score || 0) * 0.1;

  return clampScore(score);
}

function scoreActivity(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>,
) {
  let score = 0;

  score += locationNameMatchScore(item, input);

  if (shouldRestaurantFirstMixedIntent(intent)) {
    if (isRestaurantWithHookahAndMeal(item, intent)) {
      score += 250;
    } else if (isHookahPlace(item)) {
      score -= 120;
    }
  }

  score += calculateSearchQualityScore(item, input, intent);

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

    if (shouldRestaurantFirstMixedIntent(intent)) {
      score -= 120;
    }
  }

  if (intent.wantsCigar) {
    score += isCigarPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.activityExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  if (intent.wantsNightclub && matchesActivityIntent(item, "nightclub")) {
    score += PRIORITY_WEIGHTS.nightlife;
  }

  if (userAskedForDessert(intent, input)) {
    const text = itemText(item);
    const dessertLocation = isDessertLocation(item);

    if (dessertLocation) score += 150;
    if (STRONG_DESSERT_TERMS.some((term) => text.includes(term))) {
      score += 200;
    }
    if (isClearlyNotDessertLocation(item)) score -= 500;
    if (!dessertLocation && hasClearNonDessertActivityTerm(item)) score -= 1000;
  }

  score += clampScore(getSearchRankingScore(item)) * 0.4;
  score += clampScore(item.popularity_score || 0) * 0.1;

  return clampScore(score);
}


type UserPreferenceSignals = {
  favorite_cuisines: string[];
  favorite_neighborhoods: string[];
  favorite_outing_types: string[];
  average_budget?: string | null;
  nightlife_preference?: boolean | null;
  romantic_preference?: boolean | null;
  luxury_preference?: boolean | null;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeQuery(String(item))).filter(Boolean) : [];
}

async function loadUserPreferenceSignals(body: any): Promise<UserPreferenceSignals | null> {
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return null;

  const { data } = await supabase
    .from("user_preferences")
    .select("favorite_cuisines, favorite_neighborhoods, favorite_outing_types, average_budget, nightlife_preference, romantic_preference, luxury_preference")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    favorite_cuisines: asStringArray((data as any).favorite_cuisines),
    favorite_neighborhoods: asStringArray((data as any).favorite_neighborhoods),
    favorite_outing_types: asStringArray((data as any).favorite_outing_types),
    average_budget: (data as any).average_budget || null,
    nightlife_preference: Boolean((data as any).nightlife_preference),
    romantic_preference: Boolean((data as any).romantic_preference),
    luxury_preference: Boolean((data as any).luxury_preference),
  };
}

function promotionBoost(item: any, baseScore: number, intent: ReturnType<typeof detectIntent>) {
  if (!item?.is_promoted) return 0;

  const endsAt = item.promotion_ends_at ? new Date(item.promotion_ends_at).getTime() : null;
  if (endsAt && endsAt < Date.now()) return 0;

  if (baseScore < 120 || isStrongGeoMismatch(item, intent)) return 0;

  const tier = normalizeQuery(String(item.promotion_tier || "starter"));
  const tierBoost = tier.includes("launch") ? 85 : tier.includes("growth") ? 65 : 45;

  return Math.min(85, tierBoost);
}

function personalizationBoost(item: any, prefs: UserPreferenceSignals | null, intent: ReturnType<typeof detectIntent>) {
  if (!prefs || isStrongGeoMismatch(item, intent)) return 0;

  const text = itemText(item);
  let boost = 0;

  if (prefs.favorite_cuisines.some((cuisine) => cuisine && text.includes(cuisine))) boost += 45;
  if (prefs.favorite_neighborhoods.some((neighborhood) => neighborhood && text.includes(neighborhood))) boost += 35;
  if (prefs.favorite_outing_types.some((outingType) => outingType && text.includes(outingType))) boost += 35;
  if (prefs.average_budget && normalizeQuery(String(item.price_range || item.price || "")).includes(normalizeQuery(prefs.average_budget))) boost += 15;
  if (prefs.nightlife_preference && (isHookahPlace(item) || matchesActivityIntent(item, "nightclub") || text.includes("lounge") || text.includes("bar"))) boost += 30;
  if (prefs.romantic_preference && (text.includes("romantic") || text.includes("date night") || text.includes("intimate"))) boost += 25;
  if (prefs.luxury_preference && (text.includes("upscale") || text.includes("luxury") || text.includes("fine dining"))) boost += 25;

  return Math.min(100, boost);
}

function applyMarketplaceBoosts(
  item: any,
  baseScore: number,
  intent: ReturnType<typeof detectIntent>,
  prefs: UserPreferenceSignals | null,
) {
  return clampScore(baseScore + promotionBoost(item, baseScore, intent) + personalizationBoost(item, prefs, intent));
}

function hasReservationAvailability(item: any) {
  return Boolean(
    item.reservation_enabled ||
      item.reservation_link ||
      item.reservation_url ||
      item.external_reservation_url ||
      item.booking_url,
  );
}

function isPromotedOrProLocation(item: any) {
  const planText = normalizeQuery(
    [item.subscription_plan, item.plan, item.business_plan, item.pricing_plan, item.promotion_tier]
      .filter(Boolean)
      .join(" "),
  );

  return Boolean(item.is_promoted) || /\b(pro|premium|growth|launch)\b/.test(planText);
}

function strictIntentMatchScore(item: any, intent: ReturnType<typeof detectIntent>, role: "restaurant" | "activity") {
  let score = 0;
  const text = itemText(item);
  const tags = toArray(item.intent_tags).map(normalizeQuery);

  if (role === "restaurant" && (intent.wantsRestaurant || intent.wantsPrimaryMeal)) {
    score += isMealRestaurant(item, intent) || tags.includes("restaurant") ? 260 : -900;
  }

  if (role === "activity" && intent.wantsActivity) {
    score += isActivityLocation(item) || tags.includes("activity") ? 220 : -500;
  }

  if (userAskedForDessert(intent)) {
    score += isDessertLocation(item) || tags.includes("dessert") ? 380 : -1200;
  }

  if (intent.wantsLounge || intent.wantsHookah || intent.wantsCigar) {
    score += isLoungeStyleLocation(item) || tags.includes("nightlife") ? 320 : -650;
  }

  if (intent.requestedTags.includes("romantic") || intent.vibes.includes("romantic")) {
    score += text.includes("romantic") || tags.includes("romantic") ? 80 : 0;
  }

  if (intent.requestedTags.includes("birthday") || intent.wantsBirthdayDinner || intent.wantsBirthdayBrunch) {
    score += text.includes("birthday") || tags.includes("birthday") ? 90 : 0;
  }

  return score;
}

function enhancedRankingScore(
  item: any,
  currentScore: number,
  intent: ReturnType<typeof detectIntent>,
  role: "restaurant" | "activity",
) {
  let score = Number(currentScore || 0);
  const rating = Number(item.rating || 0);
  const semanticSimilarity = Number(item.semantic_similarity || 0);

  score += strictIntentMatchScore(item, intent, role);
  score += semanticSimilarity > 0 ? semanticSimilarity * 140 : 0;
  score += Number(item.recommendation_score || 0) * 1.2;
  score += Number(item.quality_score || 0) * 0.45;
  score += rating > 0 ? rating * 18 : 0;
  score += Number(item.analytics_score || 0) * 0.35;

  if (intent.locations.length > 0 && matchesLocation(item, intent.locations)) score += 90;
  if (hasReservationAvailability(item)) score += 45;
  if (isPromotedOrProLocation(item)) score += 35;

  return clampScore(score);
}

function searchNeedsDessertGuardrail(intent: ReturnType<typeof detectIntent>) {
  return userAskedForDessert(intent);
}

function searchNeedsRestaurantGuardrail(intent: ReturnType<typeof detectIntent>) {
  return intent.wantsRestaurant || intent.wantsPrimaryMeal;
}

function searchNeedsNightlifeGuardrail(intent: ReturnType<typeof detectIntent>) {
  return intent.wantsLounge || intent.wantsHookah || intent.wantsCigar;
}

function searchNeedsActivityGuardrail(intent: ReturnType<typeof detectIntent>) {
  return intent.wantsActivity && !searchNeedsDessertGuardrail(intent) && !searchNeedsNightlifeGuardrail(intent);
}

function passesStrictIntentGuardrail(item: any, intent: ReturnType<typeof detectIntent>, role: "restaurant" | "activity") {
  const intentTags = toArray(item.intent_tags).map(normalizeQuery);

  if (searchNeedsDessertGuardrail(intent)) {
    return isDessertLocation(item) || intentTags.includes("dessert");
  }

  if (searchNeedsNightlifeGuardrail(intent)) {
    return isLoungeStyleLocation(item) || intentTags.includes("nightlife");
  }

  if (role === "restaurant" && searchNeedsRestaurantGuardrail(intent)) {
    return isMealRestaurant(item, intent) || intentTags.includes("restaurant");
  }

  if (role === "activity" && searchNeedsActivityGuardrail(intent)) {
    return isActivityLocation(item) || intentTags.includes("activity");
  }

  return true;
}

function applyStrictSearchGuardrails(
  restaurants: any[],
  activities: any[],
  intent: ReturnType<typeof detectIntent>,
) {
  let guardedRestaurants = restaurants;
  let guardedActivities = activities;

  if (searchNeedsRestaurantGuardrail(intent) && !searchNeedsDessertGuardrail(intent) && !isLoungeActivityOnlyRequest(intent)) {
    guardedRestaurants = guardedRestaurants.filter((item) => passesStrictIntentGuardrail(item, intent, "restaurant"));
  }

  if (searchNeedsDessertGuardrail(intent) || searchNeedsNightlifeGuardrail(intent) || searchNeedsActivityGuardrail(intent)) {
    guardedActivities = guardedActivities.filter((item) => passesStrictIntentGuardrail(item, intent, "activity"));
  }

  if (searchNeedsDessertGuardrail(intent) && !intent.wantsPrimaryMeal) {
    guardedRestaurants = guardedRestaurants.filter((item) => passesStrictIntentGuardrail(item, intent, "restaurant"));
  }

  if (searchNeedsNightlifeGuardrail(intent) && isLoungeActivityOnlyRequest(intent)) {
    guardedRestaurants = [];
  }

  return {
    restaurants: guardedRestaurants,
    activities: guardedActivities,
  };
}


const SECONDARY_EXPERIENCE_FOOD_INTENTS = new Set([
  "hookah",
  "cigar",
  "lounge",
  "rooftop",
  "drinks",
  "wine_bar",
]);

const MEAL_SIGNAL_WORDS = [
  "dinner",
  "lunch",
  "brunch",
  "breakfast",
  "restaurant",
  "restaurants",
  "dining",
  "food",
  "eat",
  "steak",
  "steakhouse",
  "seafood",
  "sushi",
  "italian",
  "mexican",
  "chinese",
  "thai",
  "indian",
  "caribbean",
  "soul food",
  "bbq",
  "burger",
  "pizza",
  "halal",
];

function hasMealRestaurantIntent(intent: ReturnType<typeof detectIntent>) {
  return (
    intent.wantsFood &&
    (
      MEAL_SIGNAL_WORDS.some((word) => intent.text.includes(word)) ||
      intent.foodIntents.some(
        (foodIntent) => !SECONDARY_EXPERIENCE_FOOD_INTENTS.has(foodIntent)
      )
    )
  );
}

function getPrimaryMealFoodIntents(intent: ReturnType<typeof detectIntent>) {
  return intent.foodIntents.filter(
    (foodIntent) => !SECONDARY_EXPERIENCE_FOOD_INTENTS.has(foodIntent)
  );
}

function getSecondaryExperienceFoodIntents(intent: ReturnType<typeof detectIntent>) {
  return intent.foodIntents.filter((foodIntent) =>
    SECONDARY_EXPERIENCE_FOOD_INTENTS.has(foodIntent)
  );
}

function shouldRestaurantFirstMixedIntent(intent: ReturnType<typeof detectIntent>) {
  return (
    hasMealRestaurantIntent(intent) &&
    getSecondaryExperienceFoodIntents(intent).length > 0
  );
}

function isRestaurantWithHookahAndMeal(
  item: any,
  intent: ReturnType<typeof detectIntent>
) {
  const text = itemText(item);

  const hasHookah =
    isHookahPlace(item) ||
    text.includes("hookah") ||
    text.includes("shisha");

  const primaryMealIntents = getPrimaryMealFoodIntents(intent);

  const hasRequestedMeal =
    primaryMealIntents.length === 0
      ? hasMealRestaurantIntent(intent)
      : primaryMealIntents.some((food) => matchesFoodIntent(item, food));

  const looksLikeFoodPlace =
    Boolean(item.restaurant_name) ||
    Boolean(item.cuisine) ||
    Boolean(item.cuisine_type) ||
    text.includes("restaurant") ||
    text.includes("dining") ||
    text.includes("steak") ||
    text.includes("steakhouse") ||
    text.includes("dinner") ||
    text.includes("food");

  return hasHookah && hasRequestedMeal && looksLikeFoodPlace;
}

function isRestaurantLikeLocation(item: any) {
  const text = itemText(item);
  const type = String(item.location_type || "").toLowerCase();
  return (
    isOutingEligibleLocation(item) &&
    (
      type === "restaurant" ||
      Boolean(item.restaurant_name) ||
      Boolean(item.cuisine) ||
      Boolean(item.cuisine_type) ||
      text.includes("restaurant") ||
      text.includes("steakhouse") ||
      text.includes("dining") ||
      text.includes("food") ||
      text.includes("cuisine")
    )
  );
}

function fallbackMealRestaurants(
  sourceLocations: any[],
  intent: ReturnType<typeof detectIntent>,
  mealFoodIntents: string[]
) {
  let candidates = sourceLocations.filter(isRestaurantLikeLocation);
  if (intent.locations.length > 0) {
    const locationMatches = candidates.filter((item: any) =>
      matchesLocation(item, intent.locations)
    );
    if (locationMatches.length > 0) {
      candidates = locationMatches;
    }
  }
  if (mealFoodIntents.length > 0) {
    const exactMealMatches = candidates.filter((item: any) =>
      mealFoodIntents.some((foodIntent) => matchesFoodIntent(item, foodIntent))
    );
    if (exactMealMatches.length > 0) {
      return exactMealMatches;
    }
  }
  return candidates;
}

function filterRestaurantsByFoodIntent(
  restaurants: any[],
  intent: ReturnType<typeof detectIntent>
) {
  const mealFoodIntents = getMealFoodIntents(intent);

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
  intent: ReturnType<typeof detectIntent>,
) {
  if (intent.activityIntents.length === 0) return activities;

  const exactMatches = activities.filter((activity: any) =>
    intent.activityIntents.every((activityIntent) =>
      matchesActivityIntent(activity, activityIntent),
    ),
  );

  if (exactMatches.length > 0) return exactMatches;

  const partialMatches = activities.filter((activity: any) =>
    intent.activityIntents.some((activityIntent) =>
      matchesActivityIntent(activity, activityIntent),
    ),
  );

  if (partialMatches.length > 0) return partialMatches;

  return [];
}

const WALKING_DISTANCE_MILES = 1.25;
const WALKING_PAIR_CANDIDATE_LIMIT = 80;

function hasValidCoordinates(item: any) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function walkingDistanceScore(distance: number) {
  if (distance <= 0.25) return 120;
  if (distance <= 0.5) return 90;
  if (distance <= 0.75) return 60;
  if (distance <= 1) return 25;
  return -75;
}

function sameMajorWalkingArea(first: any, second: any) {
  if (isCrossAreaWalkingPair(first, second)) return false;

  const firstArea = inferStrongGeoArea(first);
  const secondArea = inferStrongGeoArea(second);

  if (firstArea && secondArea && firstArea !== secondArea) return false;

  const firstState = normalizeQuery(String(first.state || ""));
  const secondState = normalizeQuery(String(second.state || ""));
  if (firstState && secondState && firstState !== secondState) return false;

  return true;
}

function hasSameWalkingArea(a: any, b: any) {
  const aArea = inferWalkingArea(a);
  const bArea = inferWalkingArea(b);
  if (!aArea || !bArea) return true;
  return aArea === bArea;
}

function pairWalkingDistanceMatches(
  restaurants: any[],
  activities: any[],
  strictWalkingRequest = false,
): any[] {
  const pairs = restaurants
    .flatMap((restaurant) =>
      activities.map((activity) => {
        if (!hasValidCoordinates(restaurant) || !hasValidCoordinates(activity)) {
          return null;
        }

        if (isCrossAreaWalkingPair(restaurant, activity)) {
          return null;
        }

        if (!hasSameWalkingArea(restaurant, activity)) {
          return null;
        }

        if (!sameMajorWalkingArea(restaurant, activity)) {
          return null;
        }

        const distance = haversineMiles(
          Number(restaurant.latitude),
          Number(restaurant.longitude),
          Number(activity.latitude),
          Number(activity.longitude),
        );

        if (
          !Number.isFinite(distance) ||
          distance <= 0 ||
          distance > WALKING_DISTANCE_MILES
        ) {
          return null;
        }

        const walkingMinutes = walkingMinutesFromMiles(distance);
        const sameCity =
          normalizeQuery(String(restaurant.city || "")) ===
          normalizeQuery(String(activity.city || ""));
        const sameNeighborhood =
          normalizeQuery(String(restaurant.neighborhood || "")) &&
          normalizeQuery(String(restaurant.neighborhood || "")) ===
            normalizeQuery(String(activity.neighborhood || ""));
        const pairScore =
          Number(restaurant.theouthaven_score || getLocationScore(restaurant)) +
          Number(activity.theouthaven_score || getLocationScore(activity)) +
          200 +
          walkingDistanceScore(distance) +
          (strictWalkingRequest && distance <= 0.75 ? 80 : 0) +
          (strictWalkingRequest && distance > 0.75 ? -60 : 0);

        return {
          restaurant,
          activity,
          distance_miles: Number(distance.toFixed(2)),
          walking_minutes: walkingMinutes,
          walking_label: `${walkingMinutes} min walk from ${
            restaurant.restaurant_name || restaurant.name
          }`,
          same_city: Boolean(sameCity),
          same_neighborhood: Boolean(sameNeighborhood),
          pair_score: pairScore,
        };
      }),
    )
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (b.pair_score !== a.pair_score) return b.pair_score - a.pair_score;
      return a.distance_miles - b.distance_miles;
    });

  return pairs.slice(0, 5);
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
            Number(activity.longitude),
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
      }),
    )
    .sort((a, b) => b.pair_score - a.pair_score);

  const usedRestaurantIds = new Set<string>();
  const usedActivityIds = new Set<string>();

  const bestPairs = pairs
    .filter((pair) => {
      const restaurantId = String(
        pair.restaurant.id || pair.restaurant.restaurant_name || "",
      );

      const activityId = String(
        pair.activity.id || pair.activity.activity_name || "",
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
      pair_walking_minutes: walkingMinutesFromMiles(pair.distance_miles),
      pair_walking_label: walkingLabelBetweenStops(
        pair.distance_miles,
        pair.activity.activity_name || pair.activity.name,
      ),
      pair_score: pair.pair_score,
    })),
    activities: bestPairs.map((pair) => ({
      ...pair.activity,
      paired_restaurant_name:
        pair.restaurant.restaurant_name || pair.restaurant.name || null,
      pair_distance_miles: pair.distance_miles,
      pair_walking_minutes: walkingMinutesFromMiles(pair.distance_miles),
      pair_walking_label: walkingLabelBetweenStops(
        pair.distance_miles,
        pair.restaurant.restaurant_name || pair.restaurant.name,
      ),
      pair_score: pair.pair_score,
    })),
    pairs: bestPairs,
  };
}

const LOCATION_SELECT = `
  id,
  location_type,
  restaurant_name,
  activity_name,
  name,
  address,
  city,
  borough,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  primary_category,
  cuisine,
  cuisine_type,
  activity_type,
  primary_tag,
  tags,
  google_types,
  atmosphere,
  price_range,
  external_reservation_url,
  reservation_url,
  reservation_link,
  reservation_enabled,
  booking_url,
  website,
  phone,
  main_image,
  image_url,
  images,
  rating,
  review_count,
  theouthaven_score,
  roseout_score,
  quality_score,
  trend_score,
  conversion_score,
  review_score,
  popularity_score,
  analytics_score,
  recommendation_score,
  semantic_tags,
  intent_tags,
  semantic_search_text,
  ranking_badge,
  subscription_plan,
  is_promoted,
  promotion_tier,
  promotion_starts_at,
  promotion_ends_at,
  promotion_budget,
  review_keywords,
  vibe_tags,
  best_for_tags,
  search_keywords,
  date_style_tags,
  best_for,
  is_searchable,
  data_status,
  missing_fields,
  is_hidden,
  status,
  last_quality_check_at,
  search_document
`;

function applyPublicSearchFilters(query: any) {
  return query
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")');
}

async function fetchFallbackRecords(input: string = "") {
  const text = normalizeQuery(input);

  const buildTextOrFilter = (columns: string[], terms: string[]) =>
    terms
      .map(normalizeQuery)
      .filter(Boolean)
      .slice(0, 20)
      .flatMap((term) => {
        const safeTerm = term.replace(/%/g, "").replace(/,/g, " ").trim();
        return columns.map((column) => `${column}.ilike.%${safeTerm}%`);
      })
      .join(",");

  const searchableColumns = [
    "name",
    "restaurant_name",
    "activity_name",
    "search_document",
    "primary_category",
    "cuisine",
    "cuisine_type",
    "activity_type",
    "primary_tag",
    "description",
  ];

  const foodTerms = new Set<string>();

  Object.entries(FOOD_INTENTS).forEach(([intentKey, keywords]) => {
    if (keywords.some((keyword) => text.includes(normalizeQuery(keyword)))) {
      keywords.forEach((keyword) => foodTerms.add(normalizeQuery(keyword)));
      foodTerms.add(normalizeQuery(intentKey.replace(/_/g, " ")));
    }
  });

  const textTerms = Array.from(
    new Set([
      ...text.split(" ").filter((term) => term.length > 2),
      text,
    ]),
  );
  const textFilter = buildTextOrFilter(searchableColumns, textTerms);
  const foodFilter =
    foodTerms.size > 0
      ? buildTextOrFilter(searchableColumns, Array.from(foodTerms))
      : "";

  const applySearchFilter = (query: any, filter: string) => {
    if (!filter) return query;
    return query.or(filter);
  };

  const locationQueries: PromiseLike<any>[] = [
    applyPublicSearchFilters(supabase.from("locations").select(LOCATION_SELECT))
      .order("theouthaven_score", { ascending: false, nullsFirst: false })
      .limit(SEARCH_LIMITS.fallbackGeneralRecords),
  ];

  if (textFilter) {
    locationQueries.push(
      applySearchFilter(
        applyPublicSearchFilters(
          supabase.from("locations").select(LOCATION_SELECT),
        ),
        textFilter,
      )
        .order("theouthaven_score", { ascending: false, nullsFirst: false })
        .limit(SEARCH_LIMITS.fallbackRegionalRecords),
    );
  }

  if (foodFilter) {
    locationQueries.push(
      applySearchFilter(
        applyPublicSearchFilters(
          supabase.from("locations").select(LOCATION_SELECT),
        ),
        foodFilter,
      )
        .order("theouthaven_score", { ascending: false, nullsFirst: false })
        .limit(SEARCH_LIMITS.fallbackRegionalRecords),
    );
  }

  if (text.includes("queens")) {
    locationQueries.push(
      applyPublicSearchFilters(
        supabase.from("locations").select(LOCATION_SELECT),
      )
        .eq("state", "NY")
        .gte("latitude", 40.48)
        .lte("latitude", 40.82)
        .gte("longitude", -73.96)
        .lte("longitude", -73.68)
        .limit(SEARCH_LIMITS.fallbackRegionalRecords),
    );
  }

  if (
    text.includes("long island") ||
    text.includes("nassau") ||
    text.includes("suffolk")
  ) {
    locationQueries.push(
      applyPublicSearchFilters(
        supabase.from("locations").select(LOCATION_SELECT),
      )
        .eq("state", "NY")
        .gte("latitude", 40.5)
        .lte("latitude", 41.35)
        .gte("longitude", -73.8)
        .lte("longitude", -71.75)
        .limit(SEARCH_LIMITS.fallbackRegionalRecords),
    );
  }

  if (
    text.includes("new jersey") ||
    text.includes("north jersey") ||
    text.includes("jersey")
  ) {
    locationQueries.push(
      applyPublicSearchFilters(
        supabase.from("locations").select(LOCATION_SELECT),
      )
        .eq("state", "NJ")
        .gte("latitude", 40.45)
        .lte("latitude", 41.25)
        .gte("longitude", -74.35)
        .lte("longitude", -73.85)
        .limit(SEARCH_LIMITS.fallbackRegionalRecords),
    );
  }

  const locationResults = await Promise.all(locationQueries);
  const locationRows: any[] = [];

  locationResults.forEach((result: any) => {
    if (result.error) throw result.error;
    locationRows.push(...(result.data || []));
  });

  const seenLocations = new Set<string>();
  const locations = locationRows
    .filter(isPublicSearchVisible)
    .filter((location: any) => {
      const key = String(
        location.id ||
          location.google_place_id ||
          `${location.name || location.restaurant_name || location.activity_name || ""}-${
            location.address || ""
          }`,
      );

      if (!key || seenLocations.has(key)) return false;
      seenLocations.add(key);
      return true;
    });

  return {
    locations,
    restaurants: [],
    activities: [],
  };
}

async function fetchSupportingRecords() {
  const { data, error } = await applyPublicSearchFilters(
    supabase.from("locations").select(LOCATION_SELECT),
  ).limit(SEARCH_LIMITS.supportingLocations);

  if (error) throw error;

  return {
    locations: (data || []).filter(isPublicSearchVisible),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages || [];
    const input = body.input || messages[messages.length - 1]?.content || "";

    if (!input) {
      return Response.json({ error: "Missing input" }, { status: 400 });
    }

    const smartIntent = detectSmartMatchIntent(input);
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

    const semanticResults = new Map<string, any>();

    let matchedRecords = {
      locations: [] as any[],
      restaurants: [] as any[],
      activities: [] as any[],
    };

    try {
      matchedRecords = await fetchFallbackRecords(input);
    } catch (searchError) {
      console.error("PUBLIC LOCATION SEARCH ERROR:", searchError);
      const supportingRecords = await fetchSupportingRecords();
      matchedRecords = {
        locations: supportingRecords.locations || [],
        restaurants: [],
        activities: [],
      };
    }

    const mergedLocations = [
      ...(matchedRecords.locations || []),

      ...(matchedRecords.restaurants || []).map((restaurant: any) => ({
        ...restaurant,
        location_type: "restaurant",
        name: getLocationName(restaurant, ""),
        restaurant_name: restaurant.restaurant_name || restaurant.name,
      })),

      ...(matchedRecords.activities || []).map((activity: any) => ({
        ...activity,
        location_type: "activity",
        name: getLocationName(activity, ""),
        activity_name: activity.activity_name || activity.name,
      })),
    ];

    const locations = mergedLocations
      .map(normalizeLocation)
      .filter(isPublicSearchVisible);

    const intent = detectIntent(input, body, locations);
    const requestedGeo = detectRequestedGeo(input);
    const parsedIntent = await parseSearchIntent(openai, input).catch(() => ({
      city: null,
      borough: null,
      restaurantType: null,
      activityType: null,
      vibe: null,
      wantsWalkingDistance: false,
      keywords: [],
    }));
    const dessertAddonSearch = userAskedForDessert(intent, input);
    const isStrictFoodAddonSearch =
      dessertAddonSearch || userAskedForNonMealFood(intent);
    const userPreferenceSignals = await loadUserPreferenceSignals(body);

    const cacheKey = buildResponseCacheKey(input, intent);

    const { data: cached } = await supabase
      .from("ai_response_cache")
      .select("response, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.response) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();

      if (cacheAge < 1000 * 60 * 60 * CACHE_HOURS) {
        await trackSearchAppearancesForResponse(cached.response, input, cached.response?.smart_match?.mode);
        return Response.json(cached.response);
      }
    }

    const usableLocations = locations.filter(
      (item: any) =>
        isPublicSearchVisible(item) && isWithinTheOutHavenServiceArea(item),
    );

    const strictWalkingRequest =
      input.toLowerCase().includes("walking distance") ||
      input.toLowerCase().includes("walkable") ||
      input.toLowerCase().includes("walk from");

    const broaderSourceLocations =
      usableLocations.length > 0 ? usableLocations : locations;
    let sourceLocations = applyStrongGeoFilter(broaderSourceLocations, intent);
    const geoFilteredSourceLocations = requestedGeo.hasHardGeo
      ? applyHardGeoFilter(sourceLocations, requestedGeo)
      : sourceLocations;
    sourceLocations = geoFilteredSourceLocations;

    console.log("GENERATE SEARCH DEBUG", {
      locations: intent.locations,
      source_count: broaderSourceLocations.length,
      filtered_count: sourceLocations.length,
    });

    const matchedLocationResults = buildMatchedLocationResults(
      sourceLocations.filter(isOutingEligibleLocation),
      input,
    );

    let restaurants = sourceLocations.filter(isRestaurantLikeLocation);

    let activities = sourceLocations.filter(
      (item: any) => isOutingEligibleLocation(item) && isActivityLocation(item),
    );

    if (userAskedForNonMealFood(intent)) {
      const nonMealFoodActivities = sourceLocations
        .filter(isOutingEligibleLocation)
        .filter((item: any) =>
          dessertAddonSearch ? isDessertLocation(item) : isNonMealFoodPlace(item),
        )
        .map((item: any) => mapNonMealFoodPlaceToActivity(item, intent));

      activities = [...activities, ...nonMealFoodActivities];
    }

    if (dessertAddonSearch) {
      activities = activities.filter((item: any) => isDessertLocation(item));
    }

    const foodAddOnIntents = getAddOnFoodIntents(intent);
    const mealFoodIntents = getMealFoodIntents(intent);
    const shouldSplitFoodAddOnStops =
      intent.wantsFullOuting &&
      foodAddOnIntents.length > 0 &&
      mealFoodIntents.length > 0;
    const preFilteredRestaurantCandidates = restaurants.filter(isActualRestaurant);

    if (shouldSplitFoodAddOnStops) {
      restaurants = filterRestaurantsByFoodIntent(restaurants, {
        ...intent,
        foodIntents: mealFoodIntents,
      });

      restaurants = filterRestaurantsByFoodIntent(
        preFilteredRestaurantCandidates.length > 0
          ? preFilteredRestaurantCandidates
          : restaurants,
        {
          ...intent,
          foodIntents: mealFoodIntents,
        }
      );

      const foodAddOnActivities = sourceLocations
        .filter(isOutingEligibleLocation)
        .filter((item: any) =>
          foodAddOnIntents.some((foodIntent) =>
            matchesFoodIntent(item, foodIntent) ||
            matchesActivityIntent(item, foodIntent)
          )
        )
        .map((item: any) => {
          const originalType = String(item.location_type || "").toLowerCase();
          return {
            ...item,
            location_type: "activity",
            detail_location_type:
              originalType === "restaurant" ? "restaurants" : "activities",
            activity_name:
              item.activity_name ||
              item.restaurant_name ||
              item.name ||
              "Activity stop",
            activity_type:
              item.activity_type ||
              item.category ||
              item.subcategory ||
              foodAddOnIntents
                .map((foodIntent) => foodIntent.replace(/_/g, " "))
                .join(" / "),
          };
        });

      activities = filterActivitiesByActivityIntent(
        [...activities, ...foodAddOnActivities],
        {
          ...intent,
          activityIntents: Array.from(
            new Set([...intent.activityIntents, ...foodAddOnIntents])
          ),
        },
      );
    } else {
      restaurants = filterRestaurantsByFoodIntent(restaurants, intent);
      activities = filterActivitiesByActivityIntent(activities, intent);
    }
    if (isRealMealRequest(intent)) {
      const actualRestaurantMatches = restaurants.filter(isActualRestaurant);
      if (actualRestaurantMatches.length > 0) {
        restaurants = actualRestaurantMatches;
      }
    }

    if (mealFoodIntents.length > 0) {
      const guardedRestaurants = restaurants.filter((restaurant: any) => {
        const matchesMeal = mealFoodIntents.some((foodIntent) =>
          matchesFoodIntent(restaurant, foodIntent)
        );
        const onlyMatchesAddOn =
          !matchesMeal &&
          foodAddOnIntents.some(
            (foodIntent) =>
              matchesFoodIntent(restaurant, foodIntent) ||
              matchesActivityIntent(restaurant, foodIntent)
          );
        return !onlyMatchesAddOn;
      });
      if (guardedRestaurants.length > 0) {
        restaurants = guardedRestaurants;
      } else {
        const fallbackRestaurants = fallbackMealRestaurants(
          sourceLocations,
          intent,
          mealFoodIntents
        );
        if (fallbackRestaurants.length > 0) {
          restaurants = fallbackRestaurants;
        }
      }
    }

    if (dessertAddonSearch) {
      activities = activities.filter((item: any) => isDessertLocation(item));
    }

    if (
      restaurants.length === 0 &&
      intent.wantsRestaurant &&
      intent.foodIntents.length === 0
    ) {
      restaurants = sourceLocations.filter((item: any) => {
        const searchable = itemText(item);

        return (
          isOutingEligibleLocation(item) &&
          (searchable.includes("restaurant") ||
            searchable.includes("dining") ||
            searchable.includes("food") ||
            searchable.includes("cuisine"))
        );
      });
    }
    if (intent.wantsRestaurant && mealFoodIntents.length > 0) {
      const hasMealRestaurant = restaurants.some((restaurant: any) =>
        mealFoodIntents.some((foodIntent) =>
          matchesFoodIntent(restaurant, foodIntent)
        )
      );
      if (!hasMealRestaurant) {
        const fallbackRestaurants = fallbackMealRestaurants(
          sourceLocations,
          intent,
          mealFoodIntents
        );
        if (fallbackRestaurants.length > 0) {
          restaurants = fallbackRestaurants;
        }
      }
    }


    if (isLoungeActivityOnlyRequest(intent)) {
      restaurants = [];
      activities = sourceLocations.filter(
        (item: any) =>
          isOutingEligibleLocation(item) &&
          isLoungeStyleLocation(item) &&
          intent.activityIntents.some((activityIntent) =>
            matchesActivityIntent(item, activityIntent),
          ),
      );
    }

    if (isExplicitFoodAtLoungeRequest(intent) && !isRealMealRequest(intent)) {
      restaurants = restaurants.filter(isLoungeStyleLocation);
    }

    if (intent.locations.length > 0) {
      const locationRestaurants = restaurants.filter(
        (item: any) => !isStrongGeoMismatch(item, intent),
      );

      const locationActivities = activities.filter(
        (item: any) => !isStrongGeoMismatch(item, intent),
      );

      restaurants = locationRestaurants.length > 0 ? locationRestaurants : restaurants;
      activities = locationActivities.length > 0 ? locationActivities : activities;
    }
    if (
      restaurants.length === 0 &&
      intent.wantsRestaurant &&
      mealFoodIntents.length > 0
    ) {
      restaurants = sourceLocations
        .filter(isOutingEligibleLocation)
        .filter(isActualRestaurant)
        .filter((item: any) =>
          intent.locations.length > 0 ? matchesLocation(item, intent.locations) : true
        );
      const mealMatches = filterRestaurantsByFoodIntent(restaurants, {
        ...intent,
        foodIntents: mealFoodIntents,
      });
      restaurants = mealMatches.length > 0 ? mealMatches : restaurants;
    }

    console.log("SPLIT INTENTS:", {
      foodIntents: intent.foodIntents,
      activityIntents: intent.activityIntents,
      mealFoodIntents,
      foodAddOnIntents,
      restaurantCount: restaurants.length,
      activityCount: activities.length,
    });

    if (
      intent.activityIntents.length > 0 &&
      !shouldRestaurantFirstMixedIntent(intent)
    ) {
      let forcedActivityMatches = sourceLocations.filter(
        (item: any) =>
          isOutingEligibleLocation(item) &&
          intent.activityIntents.some((activityIntent) =>
            matchesActivityIntent(item, activityIntent),
          ),
      );

      if (intent.locations.length > 0) {
        const locationFiltered = forcedActivityMatches.filter((item: any) =>
          matchesLocation(item, intent.locations),
        );

        forcedActivityMatches = locationFiltered;
      }

      if (dessertAddonSearch) {
        forcedActivityMatches = forcedActivityMatches.filter((item: any) =>
          isDessertLocation(item),
        );
      }

      if (forcedActivityMatches.length > 0) {
        activities = forcedActivityMatches;
      }
    }

    if (dessertAddonSearch) {
      activities = activities.filter((item: any) => isDessertLocation(item));
    }

    if (isLoungeActivityOnlyRequest(intent)) {
      restaurants = [];
    }

    if (restaurants.length === 0 && intent.wantsRestaurant && !isLoungeActivityOnlyRequest(intent)) {
      restaurants = fallbackByGeoStages(
        geoFilteredSourceLocations,
        (item: any) => isOutingEligibleLocation(item) && isMealRestaurant(item, intent),
        intent,
        strictWalkingRequest,
      );
    }

    if (activities.length === 0 && dessertAddonSearch) {
      activities = fallbackByGeoStages(
        geoFilteredSourceLocations,
        (item: any) => isOutingEligibleLocation(item) && isDessertLocation(item),
        intent,
        strictWalkingRequest,
      ).map((item: any) => mapNonMealFoodPlaceToActivity(item, intent));
    } else if (activities.length === 0 && isStrictFoodAddonSearch) {
      activities = fallbackByGeoStages(
        geoFilteredSourceLocations,
        (item: any) => isOutingEligibleLocation(item) && isNonMealFoodPlace(item),
        intent,
        strictWalkingRequest,
      ).map((item: any) => mapNonMealFoodPlaceToActivity(item, intent));
    } else if (activities.length === 0 && intent.wantsActivity) {
      activities = fallbackByGeoStages(
        geoFilteredSourceLocations,
        (item: any) => isOutingEligibleLocation(item) && isActivityLocation(item),
        intent,
        strictWalkingRequest,
      );
    }

    if (dessertAddonSearch) {
      activities = activities.filter((item: any) => isDessertLocation(item));
    }

    const dedupedLocationResults = removeDuplicateLocationsAcrossTypes(
      restaurants,
      activities,
      isExplicitFoodAtLoungeRequest(intent) ? "restaurants" : "activities",
    );

    restaurants = dedupedLocationResults.restaurants;
    activities = dessertAddonSearch
      ? dedupedLocationResults.activities.filter((item: any) =>
          isDessertLocation(item),
        )
      : dedupedLocationResults.activities;

    const strictGuardedResults = applyStrictSearchGuardrails(
      restaurants,
      activities,
      intent,
    );
    restaurants = strictGuardedResults.restaurants;
    activities = strictGuardedResults.activities;

    if (shouldRestaurantFirstMixedIntent(intent) && restaurants.length === 0) {
      restaurants = sourceLocations.filter((item: any) => {
        const type = String(item.location_type || "").toLowerCase();
        const text = itemText(item);

        return (
          isOutingEligibleLocation(item) &&
          matchesLocation(item, intent.locations) &&
          (
            type === "restaurant" ||
            Boolean(item.restaurant_name) ||
            Boolean(item.cuisine) ||
            Boolean(item.cuisine_type) ||
            text.includes("restaurant") ||
            text.includes("dining") ||
            text.includes("steak") ||
            text.includes("steakhouse") ||
            text.includes("food")
          )
        );
      });
    }

    let rankedRestaurants = restaurants
      .map((restaurant: any) => {
        const semantic = semanticScoreBoost(restaurant, semanticResults);
        const baseScore = clampScore(
          scoreRestaurant(restaurant, input, intent) +
            semantic.semantic_score_boost,
        );
        const marketplaceScore = applyMarketplaceBoosts(restaurant, baseScore, intent, userPreferenceSignals);
        const score = enhancedRankingScore(restaurant, marketplaceScore, intent, "restaurant");
        const confidence = confidenceFromScores({
          ...restaurant,
          smart_match_score: score,
          semantic_similarity: semantic.semantic_similarity,
          location_name_match_score: locationNameMatchScore(restaurant, input),
        });

        return {
          ...restaurant,
          theouthaven_score: score,
          smart_match_score: score,
          semantic_similarity: semantic.semantic_similarity,
          semantic_score_boost: semantic.semantic_score_boost,
          confidence: confidence.confidence,
          confidence_label: confidence.confidence_label,
          location_name_match_score: locationNameMatchScore(restaurant, input),
        };
      })
      .sort((a: any, b: any) => b.theouthaven_score - a.theouthaven_score);

    let rankedActivities = activities
      .map((activity: any) => {
        const semantic = semanticScoreBoost(activity, semanticResults);
        const baseScore = clampScore(
          scoreActivity(activity, input, intent) +
            semantic.semantic_score_boost,
        );
        const marketplaceScore = applyMarketplaceBoosts(activity, baseScore, intent, userPreferenceSignals);
        const score = enhancedRankingScore(activity, marketplaceScore, intent, "activity");
        const confidence = confidenceFromScores({
          ...activity,
          smart_match_score: score,
          semantic_similarity: semantic.semantic_similarity,
          location_name_match_score: locationNameMatchScore(activity, input),
        });

        return {
          ...activity,
          theouthaven_score: score,
          smart_match_score: score,
          semantic_similarity: semantic.semantic_similarity,
          semantic_score_boost: semantic.semantic_score_boost,
          confidence: confidence.confidence,
          confidence_label: confidence.confidence_label,
          location_name_match_score: locationNameMatchScore(activity, input),
        };
      })
      .sort((a: any, b: any) => b.theouthaven_score - a.theouthaven_score);

    rankedRestaurants.sort((a: any, b: any) => {
      if (shouldRestaurantFirstMixedIntent(intent)) {
        const aBest = isRestaurantWithHookahAndMeal(a, intent);
        const bBest = isRestaurantWithHookahAndMeal(b, intent);

        if (aBest && !bBest) return -1;
        if (!aBest && bBest) return 1;
      }

      return (b._score || 0) - (a._score || 0);
    });

    rankedRestaurants = diversifyResults(
      rankedRestaurants.map((item: any) => ({
        ...item,
        __specific_location_requested: intent.locations.length > 0,
      })),
      24,
    );
    rankedActivities = diversifyResults(
      rankedActivities.map((item: any) => ({
        ...item,
        __specific_location_requested: intent.locations.length > 0,
      })),
      24,
    );

    console.log("GENERATE RANKING DEBUG", {
      ranked_restaurant_count: rankedRestaurants.length,
      ranked_activity_count: rankedActivities.length,
    });
    const localFirst = localFirstFilter(geoFilteredSourceLocations as any, parsedIntent as any);
    if (localFirst.restaurants.length > 0) {
      rankedRestaurants = rankedRestaurants.filter((r:any)=>localFirst.restaurants.some((lr:any)=>String(lr.id)===String(r.id)));
    }
    if (localFirst.activities.length > 0) {
      rankedActivities = rankedActivities.filter((a:any)=>localFirst.activities.some((la:any)=>String(la.id)===String(a.id)));
    }


    const strictRankedRestaurants =
      intent.foodIntents.length > 0
        ? rankedRestaurants.filter((restaurant: any) =>
            intent.foodIntents.some((foodIntent) =>
              matchesFoodIntent(restaurant, foodIntent)
            )
          )
        : rankedRestaurants;

    const strictRankedActivities =
      intent.activityIntents.length > 0
        ? rankedActivities.filter((activity: any) =>
            intent.activityIntents.some((activityIntent) =>
              matchesActivityIntent(activity, activityIntent)
            )
          )
        : rankedActivities;

    const smartBalanced = balanceSmartMatches(
      strictRankedRestaurants,
      strictRankedActivities,
      smartIntent,
    );

    if (
      intent.activityIntents.length > 0 &&
      rankedActivities.length > 0 &&
      smartBalanced.activities.length === 0
    ) {
      smartBalanced.activities = strictRankedActivities.slice(0, 2);
    }

    if (
      intent.foodIntents.length > 0 &&
      rankedRestaurants.length > 0 &&
      smartBalanced.restaurants.length === 0
    ) {
      smartBalanced.restaurants = strictRankedRestaurants.slice(0, 2);
    }

    if (
      shouldSplitFoodAddOnStops &&
      rankedActivities.length > 0 &&
      smartBalanced.activities.length === 0
    ) {
      smartBalanced.activities = strictRankedActivities.slice(0, 2);
    }

    const wantsWalkingPair =
      intent.wantsFullOuting ||
      (intent.wantsRestaurant && intent.wantsActivity) ||
      input.toLowerCase().includes("walking distance") ||
      input.toLowerCase().includes("walkable") ||
      input.toLowerCase().includes("nearby") ||
      input.toLowerCase().includes("close by");

    const walkingPairRestaurants = wantsWalkingPair
      ? strictRankedRestaurants.slice(0, WALKING_PAIR_CANDIDATE_LIMIT)
      : [];
    const walkingPairActivities = wantsWalkingPair
      ? strictRankedActivities.slice(0, WALKING_PAIR_CANDIDATE_LIMIT)
      : [];

    const walkingPairs =
      walkingPairRestaurants.length > 0 && walkingPairActivities.length > 0
        ? rankPairs(pairLocations(walkingPairRestaurants as any, walkingPairActivities as any, 1.25)).map((pair:any)=>({
            restaurant: pair.restaurant,
            activity: pair.activity,
            distance_miles: Number(pair.distanceMiles.toFixed(2)),
            walking_minutes: pair.walkingMinutes,
            walking_label: `${pair.walkingMinutes} min walk`,
            pair_score: pair.score,
          }))
        : [];

    console.log("GENERATE WALKING DEBUG", {
      walking_pair_count: walkingPairs.length,
    });

    const pairedResults =
      walkingPairs.length > 0
        ? {
            restaurants: walkingPairs.map((pair: any) => ({
              ...pair.restaurant,
              paired_activity_name:
                pair.activity.activity_name || pair.activity.name,
              pair_distance_miles: pair.distance_miles,
              pair_walking_minutes: pair.walking_minutes,
              pair_walking_label: pair.walking_label,
              pair_score: pair.pair_score,
            })),
            activities: walkingPairs.map((pair: any) => ({
              ...pair.activity,
              paired_restaurant_name:
                pair.restaurant.restaurant_name || pair.restaurant.name,
              pair_distance_miles: pair.distance_miles,
              pair_walking_minutes: pair.walking_minutes,
              pair_walking_label: `${pair.walking_minutes} min walk from ${
                pair.restaurant.restaurant_name || pair.restaurant.name
              }`,
              pair_score: pair.pair_score,
            })),
            pairs: walkingPairs,
          }
        : strictWalkingRequest
          ? {
              restaurants: [],
              activities: [],
              pairs: [],
            }
          : smartBalanced.restaurants.length > 0 &&
              smartBalanced.activities.length > 0
            ? pairSmartMatches(
                smartBalanced.restaurants,
                smartBalanced.activities,
              )
            : {
                restaurants: smartBalanced.restaurants,
                activities: smartBalanced.activities,
                pairs: [],
              };

    const finalDedupedResults = removeDuplicateLocationsAcrossTypes(
      pairedResults.restaurants,
      pairedResults.activities,
      isExplicitFoodAtLoungeRequest(intent) ? "restaurants" : "activities",
    );

    let topRestaurants = sortLocationsNearFirst(
      finalDedupedResults.restaurants,
      intent,
    );
    let topActivities = sortLocationsNearFirst(
      finalDedupedResults.activities,
      intent,
    );
    topRestaurants = applyHardGeoFilter(topRestaurants, requestedGeo);
    topActivities = applyHardGeoFilter(topActivities, requestedGeo);

    const slimMatchedLocations = matchedLocationResults.map((item: any) => ({
      id: String(item.id),
      name: getLocationName(item, ""),
      location_type: item.location_type,
      city: item.city,
      address: item.address,
      cuisine: item.cuisine || item.cuisine_type || null,
      activity_type:
        item.activity_type || item.category || item.subcategory || null,
      score: item.location_name_match_score,
    }));

    const slimRestaurants = topRestaurants.map((r: any) => ({
      name: getLocationName(r, ""),
      city: r.city,
      cuisine: r.cuisine || r.cuisine_type,
      score: clampScore(getLocationScore(r)),
      location_name_match_score: r.location_name_match_score || 0,
      semantic_similarity: r.semantic_similarity || 0,
      confidence_label: r.confidence_label || "low",
      tag: r.primary_tag,
      rating: r.rating,
      review_count: r.review_count,
      distance_miles: r.distance_miles || null,
      review_keywords: toArray(r.review_keywords).slice(0, 5),
    }));

    const slimActivities = topActivities.map((a: any) => ({
      name: getLocationName(a, ""),
      city: a.city,
      type: a.activity_type || a.category || a.subcategory,
      score: clampScore(getLocationScore(a)),
      location_name_match_score: a.location_name_match_score || 0,
      semantic_similarity: a.semantic_similarity || 0,
      confidence_label: a.confidence_label || "low",
      tag: a.primary_tag,
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
- Treat high confidence matches as strongest. For medium/low confidence, say "best available matches" instead of sounding certain.
- Prefer items with stronger semantic_similarity when the user's request is a full sentence or describes a vibe.
- If the user typed a specific business/location name and it appears in "Matched location/business names", prioritize it.
- If there is a matched business/location name, mention that match first.
- If the user asks for food plus any activity, include both a restaurant and a matching activity when available.
- Never ignore the requested activity intent.
- If the user asks for food/dinner/restaurant plus hookah, food is the primary request and hookah is the secondary add-on.
- If a location has both the requested food and hookah, rank it highest.
- For searches like “steak dinner and hookah in Queens,” recommend steak/restaurant results first.
- Hookah-only lounges should not replace restaurants when the user asked for dinner, steak, seafood, restaurant, lunch, brunch, or food.
- Standalone hookah lounges are acceptable only as activity/add-on results unless the user only searched for hookah.
- If a location is detected, prioritize restaurants and activities from that location.
- If matching activities only exist in another borough, still include the matching activity.
- Never say “I don’t have any.”
- Never ask the user to provide a list.
- Never say “let me know.”
- Balance restaurant and activity perfectly when both are requested.
- If budget is detected, recommend options that fit the budget first.
- If distance is detected, prioritize closer options first.
- When pairing two stops with a distance, say the walking time as “XX min walk from [restaurant or activity name]”.
- Match the vibe, food intent, activity intent, and location together.
- Do NOT recommend museums unless the user asked for museums, art, galleries, exhibits, or culture.
- Do NOT suggest unrelated cuisines or unrelated activities.
- Do NOT invent business details.
- Do NOT add times unless asked.
- Do NOT add dessert, walks, or extra stops unless asked.
- If the user asks for a restaurant with activities, date night, full outing, nearby, walkable, or walking distance, prioritize restaurant/activity pairs within 1.25 miles.
`;

    const dessertSearchWithoutDessertResults =
      dessertAddonSearch && topActivities.length === 0;

    const hasResults =
      !dessertSearchWithoutDessertResults &&
      (topRestaurants.length > 0 ||
        topActivities.length > 0 ||
        matchedLocationResults.length > 0);

    const response = hasResults
      ? await openai.responses.create({
          model: AI_MODEL,
          input: prompt,
          max_output_tokens: 180,
        })
      : null;

    const responsePayload = {
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
        dessertSearchWithoutDessertResults
          ? "I couldn’t find a true dessert spot nearby. Try a broader area or search for bakery, ice cream, or cafe."
          : pairedResults.pairs.length > 0
            ? response?.output_text ||
              "Here are walkable restaurant and activity matches."
            : strictWalkingRequest
              ? "I couldn’t find a restaurant and activity that are truly walking distance from each other. Try a nearby neighborhood or expand to a short drive."
              : response?.output_text ||
                "I found your request, but no matching restaurants or activities are available yet. Try a broader search like seafood dinner, romantic dinner, or restaurants in Queens.",
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
        cuisine: item.cuisine || item.cuisine_type || null,
        activity_type:
          item.activity_type || item.category || item.subcategory || null,
        detail_location_type: item.detail_location_type || item.location_type,
        website: item.website,
        phone: item.phone || null,
        google_maps_url: item.google_maps_url || null,
        main_image: item.main_image || null,
        image_url: item.image_url || null,
        images: Array.isArray(item.images) ? item.images : null,
        external_reservation_url: item.external_reservation_url || null,
        reservation_url: item.reservation_url || null,
        reservation_link: item.reservation_link || null,
        reservation_enabled: item.reservation_enabled ?? null,
        location_name_match_score: item.location_name_match_score,
      })),
      pairs: pairedResults.pairs.map((pair: any) => ({
        restaurant_name:
          pair.restaurant.restaurant_name || pair.restaurant.name,
        activity_name: pair.activity.activity_name || pair.activity.name,
        distance_miles: pair.distance_miles,
        walking_minutes: walkingMinutesFromMiles(pair.distance_miles),
        walking_label_from_restaurant: walkingLabelBetweenStops(
          pair.distance_miles,
          pair.restaurant.restaurant_name || pair.restaurant.name,
        ),
        walking_label_from_activity: walkingLabelBetweenStops(
          pair.distance_miles,
          pair.activity.activity_name || pair.activity.name,
        ),
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
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        primary_category: getPrimaryCategory(r),
        cuisine: getCuisine(r),
        cuisine_type: r.cuisine_type || null,
        food_type: r.food_type || null,
        tags: Array.isArray(r.tags) ? r.tags : null,
        google_types: Array.isArray(r.google_types) ? r.google_types : null,
        atmosphere: r.atmosphere || null,
        price_range: r.price_range || null,
        theouthaven_score: clampScore(getLocationScore(r)),
        smart_match_score: clampScore(
          r.smart_match_score ?? getLocationScore(r),
        ),
        semantic_similarity: r.semantic_similarity || 0,
        semantic_score_boost: r.semantic_score_boost || 0,
        confidence: r.confidence || 0,
        confidence_label: r.confidence_label || "low",
        location_name_match_score: r.location_name_match_score || 0,
        paired_activity_name: r.paired_activity_name || null,
        pair_distance_miles: r.pair_distance_miles || null,
        pair_walking_minutes: r.pair_walking_minutes || null,
        pair_walking_label: r.pair_walking_label || null,
        pair_score: r.pair_score ? clampScore(r.pair_score) : null,
        external_reservation_url: r.external_reservation_url || null,
        reservation_url: r.reservation_url || null,
        reservation_link: r.reservation_link || null,
        reservation_enabled: r.reservation_enabled ?? null,
        website: r.website,
        main_image: r.main_image || null,
        image_url: r.image_url || null,
        images: Array.isArray(r.images) ? r.images : null,
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
        detail_location_type: a.detail_location_type || "activities",
        address: a.address,
        city: a.city,
        state: a.state,
        zip_code: a.zip_code,
        google_maps_url: a.google_maps_url || null,
        latitude: a.latitude || null,
        longitude: a.longitude || null,
        price_range: a.price_range,
        atmosphere: a.atmosphere,
        group_friendly: a.group_friendly,
        theouthaven_score: clampScore(getLocationScore(a)),
        smart_match_score: clampScore(
          a.smart_match_score ?? getLocationScore(a),
        ),
        semantic_similarity: a.semantic_similarity || 0,
        semantic_score_boost: a.semantic_score_boost || 0,
        confidence: a.confidence || 0,
        confidence_label: a.confidence_label || "low",
        location_name_match_score: a.location_name_match_score || 0,
        paired_restaurant_name: a.paired_restaurant_name || null,
        pair_distance_miles: a.pair_distance_miles || null,
        pair_walking_minutes: a.pair_walking_minutes || null,
        pair_walking_label: a.pair_walking_label || null,
        pair_score: a.pair_score ? clampScore(a.pair_score) : null,
        external_reservation_url: a.external_reservation_url || null,
        reservation_url: a.reservation_url || null,
        reservation_link: a.reservation_link || null,
        reservation_enabled: a.reservation_enabled ?? null,
        website: a.website,
        main_image: a.main_image || null,
        image_url: a.image_url || null,
        images: Array.isArray(a.images) ? a.images : null,
        rating: a.rating || null,
        review_count: a.review_count || null,
        review_score: a.review_score || null,
        review_keywords: toArray(a.review_keywords),
        review_snippet: a.review_snippet || null,
        primary_tag: a.primary_tag || null,
        date_style_tags: toArray(a.date_style_tags),
        distance_miles: a.distance_miles || null,
      })),
    };

    await trackSearchAppearancesForResponse(responsePayload, input, smartBalanced.mode);

    await supabase.from("ai_response_cache").upsert({
      cache_key: cacheKey,
      user_query: input,
      response: responsePayload,
    });

    return Response.json(responsePayload);
  } catch (error: any) {
    console.error("GENERATE ERROR:", error);

    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 },
    );
  }
}
