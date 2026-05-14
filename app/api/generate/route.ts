import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { clampScore } from "@/lib/clampScore";
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const AI_MODEL = "gpt-4o-mini";
const CACHE_HOURS = 6;
const RESPONSE_CACHE_VERSION = `food-cuisine-location-distance-v10-enterprise-rpc-${SEMANTIC_SEARCH_VERSION}`;

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

  sushi: [
    "sushi",
    "omakase",
    "nigiri",
    "sashimi",
    "maki",
    "japanese sushi",
  ],

  ramen: ["ramen", "tonkotsu", "shoyu ramen"],

  italian: [
    "italian",
    "pasta",
    "risotto",
    "trattoria",
    "pizza italiana",
  ],

  mexican: [
    "mexican",
    "taco",
    "tacos",
    "birria",
    "quesadilla",
    "taqueria",
  ],

  chinese: [
    "chinese",
    "dim sum",
    "dumpling",
    "dumplings",
    "szechuan",
    "cantonese",
  ],

  thai: ["thai", "pad thai", "thai food", "thai cuisine"],

  indian: [
    "indian",
    "curry",
    "tikka",
    "masala",
    "biryani",
    "naan",
  ],

  japanese: [
    "japanese",
    "izakaya",
    "yakitori",
    "hibachi",
    "teppanyaki",
  ],

  korean: [
    "korean",
    "korean bbq",
    "kbbq",
    "bulgogi",
    "hot pot",
  ],

  vietnamese: [
    "vietnamese",
    "pho",
    "banh mi",
    "vermicelli",
  ],

  filipino: [
    "filipino",
    "adobo",
    "lechon",
    "lumpia",
  ],

  african: [
    "african",
    "nigerian",
    "ghanaian",
    "ethiopian",
    "senegalese",
  ],

  caribbean: [
    "caribbean",
    "jamaican",
    "haitian",
    "trinidadian",
    "jerk",
  ],

  soul_food: [
    "soul food",
    "southern",
    "comfort food",
    "fried chicken",
  ],

  mediterranean: [
    "mediterranean",
    "greek",
    "falafel",
    "gyro",
    "hummus",
  ],

  spanish: [
    "spanish",
    "paella",
    "tapas",
  ],

  french: [
    "french",
    "bistro",
    "brasserie",
  ],

  american: [
    "american",
    "new american",
    "american grill",
    "gastropub",
  ],

  bbq: [
    "bbq",
    "barbecue",
    "smokehouse",
    "ribs",
    "brisket",
  ],

  halal: [
    "halal",
    "halal food",
    "halal restaurant",
  ],

  vegan: [
    "vegan",
    "plant based",
    "plant-based",
  ],

  vegetarian: [
    "vegetarian",
    "veggie",
  ],

  healthy: [
    "healthy",
    "organic",
    "salad",
    "wellness",
  ],

  brunch: [
    "brunch",
    "bottomless brunch",
    "brunch spot",
  ],

  breakfast: [
    "breakfast",
    "pancakes",
    "waffles",
    "breakfast spot",
  ],

  cafe: [
    "cafe",
    "coffee",
    "espresso",
    "latte",
    "coffee shop",
  ],

  bakery: [
    "bakery",
    "pastry",
    "croissant",
    "baked goods",
  ],

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

  burgers: [
    "burger",
    "burgers",
    "smashburger",
  ],

  pizza: [
    "pizza",
    "pizzeria",
    "wood fired pizza",
    "slice shop",
  ],

  wings: [
    "wings",
    "buffalo wings",
    "chicken wings",
  ],

  sandwiches: [
    "sandwich",
    "sandwiches",
    "subs",
    "heroes",
    "hoagies",
  ],

  tacos: [
    "tacos",
    "street tacos",
  ],

  drinks: [
    "drinks",
    "cocktail",
    "cocktails",
    "wine",
    "bar",
    "mixology",
  ],

  wine_bar: [
    "wine bar",
    "wine lounge",
  ],

  rooftop: [
    "rooftop",
    "roof top",
    "skyline",
    "view",
  ],

  lounge: [
    "lounge",
    "cocktail lounge",
  ],

  hookah: [
    "hookah",
    "shisha",
    "hookah lounge",
    "hookah restaurant",
  ],

  cigar: [
    "cigar",
    "cigar lounge",
    "cigar bar",
    "cigar friendly",
  ],

  fine_dining: [
    "fine dining",
    "upscale dining",
    "luxury dining",
    "chef tasting",
  ],

  buffet: [
    "buffet",
    "all you can eat",
    "ayce",
  ],

  hibachi: [
    "hibachi",
    "teppanyaki",
  ],

  hot_pot: [
    "hot pot",
    "shabu shabu",
  ],
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
const WALKING_MINUTES_PER_MILE = 20;

function isFoodAddOnIntent(foodIntent: string) {
  return FOOD_ADD_ON_INTENTS.has(foodIntent);
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
    item.cuisine,
    item.cuisine_type,
    item.food_type,
    ...toArray(item.cuisine_tags),
    item.activity_type,
    item.category,
    item.categories,
    item.subcategory,
    item.google_types,
    item.types,
    item.business_status,
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
  return String(item.restaurant_name || item.activity_name || item.name || "")
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

function normalizeLocation(item: any) {
  const name = item.name || item.restaurant_name || item.activity_name || "";
  const type =
    item.location_type ||
    (item.activity_name || item.activity_type ? "activity" : "restaurant");

  return {
    ...item,
    name,
    location_type: String(type).toLowerCase(),
    restaurant_name:
      String(type).toLowerCase() === "restaurant"
        ? item.restaurant_name || name
        : item.restaurant_name,
    activity_name:
      String(type).toLowerCase() === "activity"
        ? item.activity_name || name
        : item.activity_name,
  };
}

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
];

const LONG_ISLAND_LOCATION_ALIASES = [
  "nassau",
  "nassau county",
  "suffolk",
  "suffolk county",
  ...NASSAU_LOCATION_ALIASES,
  ...SUFFOLK_LOCATION_ALIASES,
];

const LOCATION_AREA_ALIASES: Record<string, string[]> = {
  queens: QUEENS_LOCATION_ALIASES,
  "long island": LONG_ISLAND_LOCATION_ALIASES,
  nassau: ["nassau county", ...NASSAU_LOCATION_ALIASES],
  "nassau county": ["nassau", ...NASSAU_LOCATION_ALIASES],
  suffolk: ["suffolk county", ...SUFFOLK_LOCATION_ALIASES],
  "suffolk county": ["suffolk", ...SUFFOLK_LOCATION_ALIASES],
};

const LONG_ISLAND_LOCATION_TERMS = new Set([
  "long island",
  "nassau",
  "nassau county",
  "suffolk",
  "suffolk county",
  ...LONG_ISLAND_LOCATION_ALIASES,
]);

const NEW_JERSEY_LOCATION_TERMS = new Set([
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
  "bayonne",
  "kearny",
  "harrison",
  "elizabeth",
  "union",
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
      .join(" ")
  );
}

function locationIntentIncludes(
  detectedLocations: string[],
  terms: Set<string>
) {
  return detectedLocations.some((location) =>
    terms.has(normalizeQuery(location))
  );
}

function hasCoordinateInBounds(
  item: any,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
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

function matchesLongIslandLocation(item: any) {
  const searchable = locationSearchText(item);
  const state = normalizeQuery(String(item.state || ""));

  if (state === "nj" || searchable.includes("new jersey")) return false;

  if (
    Array.from(LONG_ISLAND_LOCATION_TERMS).some((term) =>
      searchable.includes(term)
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
      searchable.includes(term)
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
    searchable.includes(normalizeQuery(location))
  );
}


function locationIdentityKey(item: any) {
  const placeId = item.google_place_id || item.place_id;

  if (placeId) return normalizeQuery(String(placeId));

  const nameAddressKey = normalizeQuery(
    [
      item.restaurant_name || item.activity_name || item.name,
      item.address,
      item.city,
    ]
      .filter(Boolean)
      .join(" ")
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
function isExplicitFoodAtLoungeRequest(intent: ReturnType<typeof detectIntent>) {
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
  prefer: "restaurants" | "activities" = "activities"
) {
  const uniqueRestaurants = removeDuplicateLocationsWithinType(restaurants);
  const uniqueActivities = removeDuplicateLocationsWithinType(activities);
  const restaurantKeys = new Set(uniqueRestaurants.map(locationIdentityKey));
  const activityKeys = new Set(uniqueActivities.map(locationIdentityKey));

  if (prefer === "restaurants") {
    return {
      restaurants: uniqueRestaurants,
      activities: uniqueActivities.filter(
        (activity) => !restaurantKeys.has(locationIdentityKey(activity))
      ),
    };
  }

  return {
    restaurants: uniqueRestaurants.filter(
      (restaurant) => !activityKeys.has(locationIdentityKey(restaurant))
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
      item.activity_type,
      item.primary_tag,
      item.description,
      item.address,
      item.business_status,
      ...toArray(item.google_types),
      ...toArray(item.types),
      ...toArray(item.search_keywords),
      ...toArray(item.categories),
      ...toArray(item.google_types),
      ...toArray(item.types),
    ]
      .filter(Boolean)
      .join(" ")
  );

  return !NON_OUTING_LOCATION_KEYWORDS.some((keyword) =>
    disqualifyingText.includes(keyword)
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
    item.activity_type,
    item.activity_name,
    item.category,
    item.categories,
    item.subcategory,
    item.primary_tag,
    ...toArray(item.google_types),
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
  const activityName = String(
    item.activity_name || item.name || ""
  ).toLowerCase();

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

function walkingMinutesFromMiles(distanceMiles: number | null) {
  if (distanceMiles === null || !Number.isFinite(distanceMiles)) return null;

  return Math.max(1, Math.round(distanceMiles * WALKING_MINUTES_PER_MILE));
}

function walkingLabelBetweenStops(
  distanceMiles: number | null,
  fromName?: string | null
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
  return (
    lat >= 40.4 &&
    lat <= 41.2 &&
    lng >= -74.3 &&
    lng <= -73.5
  );
}

function distanceBoost(
  item: any,
  userLat?: number,
  userLng?: number,
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
  const text = normalizeQuery(input);

  const requestedTags = detectFromMap(input, TAG_KEYWORDS);
  const foodIntents = detectFromMap(input, FOOD_INTENTS);
  const activityIntents = detectFromMap(input, ACTIVITY_INTENTS);
  const detectedLocations = detectLocation(input, locations);

  const wantsFoodMap = buildWantsMap(Object.keys(FOOD_INTENTS), foodIntents);
  const wantsActivityMap = buildWantsMap(
    Object.keys(ACTIVITY_INTENTS),
    activityIntents
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
    text.includes(option)
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
        ].includes(tag)
      ),
      ...(text.includes("romantic") ? ["romantic"] : []),
      ...(text.includes("fun") ? ["fun"] : []),
      ...(text.includes("luxury") || text.includes("upscale")
        ? ["luxury"]
        : []),
      ...(text.includes("chill") ? ["chill"] : []),
    ])
  );

  const budget = detectBudget(input);
  const maxMiles = body.maxMiles || body.max_miles || detectDistance(input);
  const userLat = body.lat || body.latitude || null;
  const userLng = body.lng || body.longitude || null;

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
};

function resultDistanceValue(item: NearbySortableLocation) {
  const distance = Number(item.distance_miles);

  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function resultScoreValue(item: NearbySortableLocation) {
  const score = Number(item.theouthaven_score);

  return Number.isFinite(score) ? score : 0;
}

function sortLocationsNearFirst<T extends NearbySortableLocation>(
  items: T[],
  intent: ReturnType<typeof detectIntent>
) {
  const shouldPrioritizeNearby = Boolean(
    (intent.userLat && intent.userLng) ||
      intent.maxMiles ||
      intent.locations.length
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

function scoreRestaurant(
  item: any,
  input: string,
  intent: ReturnType<typeof detectIntent>
) {
  let score = 0;

  score += locationNameMatchScore(item, input);
  score += keywordBoost(item, input);
  score += weightedVibeBoost(item, intent.vibes);
  score += weightedTagBoost(item, intent.requestedTags);
  score += weightedFoodBoost(item, intent.foodIntents);
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
    score += isHookahPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.foodExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  if (intent.wantsCigar) {
    score += isCigarPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.foodExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  score += clampScore(item.theouthaven_score || 0) * 0.25;
  score += clampScore(item.quality_score || 0) * 0.15;
  score += clampScore(item.popularity_score || 0) * 0.1;
  score += clampScore(item.review_score || 0) * 0.2;

  return clampScore(score);
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
    const name = String(item.activity_name || item.name || "").toLowerCase();
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
  }

  if (intent.wantsCigar) {
    score += isCigarPlace(item)
      ? PRIORITY_WEIGHTS.nightlife + PRIORITY_WEIGHTS.activityExact
      : PRIORITY_WEIGHTS.mismatchPenalty;
  }

  if (intent.wantsNightclub && matchesActivityIntent(item, "nightclub")) {
    score += PRIORITY_WEIGHTS.nightlife;
  }

  score += clampScore(item.theouthaven_score || 0) * 0.25;
  score += clampScore(item.quality_score || 0) * 0.15;
  score += clampScore(item.popularity_score || 0) * 0.1;
  score += clampScore(item.review_score || 0) * 0.2;

  return clampScore(score);
}

function filterRestaurantsByFoodIntent(
  restaurants: any[],
  intent: ReturnType<typeof detectIntent>
) {
  if (intent.foodIntents.length === 0) return restaurants;

  const exactMatches = restaurants.filter((restaurant: any) =>
    intent.foodIntents.every((food) => matchesFoodIntent(restaurant, food))
  );

  if (exactMatches.length > 0) return exactMatches;

  const partialMatches = restaurants.filter((restaurant: any) =>
    intent.foodIntents.some((food) => matchesFoodIntent(restaurant, food))
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

const WALKING_DISTANCE_MILES = 0.45;

function pairWalkingDistanceMatches(
  restaurants: any[],
  activities: any[]
): any[] {
  const pairs = restaurants
    .flatMap((restaurant) =>
      activities.map((activity) => {
        if (
          !restaurant.latitude ||
          !restaurant.longitude ||
          !activity.latitude ||
          !activity.longitude
        ) {
          return null;
        }

        const distance = haversineMiles(
          Number(restaurant.latitude),
          Number(restaurant.longitude),
          Number(activity.latitude),
          Number(activity.longitude)
        );

        if (distance > WALKING_DISTANCE_MILES) {
          return null;
        }

        const walkingMinutes = walkingMinutesFromMiles(distance);

        return {
          restaurant,
          activity,
          distance_miles: Number(distance.toFixed(2)),
          walking_minutes: walkingMinutes,
          walking_label: `${walkingMinutes} min walk from ${
            restaurant.restaurant_name || restaurant.name
          }`,
          pair_score:
            Number(restaurant.theouthaven_score || 0) +
            Number(activity.theouthaven_score || 0) +
            200,
        };
      })
    )
    .filter(Boolean)
    .filter((pair: any) => pair.distance_miles <= WALKING_DISTANCE_MILES)
    .sort((a: any, b: any) => {
      if (a.distance_miles !== b.distance_miles) {
        return a.distance_miles - b.distance_miles;
      }

      return b.pair_score - a.pair_score;
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
          Number(restaurant.theouthaven_score || 0) +
          Number(activity.theouthaven_score || 0);

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
      pair_walking_minutes: walkingMinutesFromMiles(pair.distance_miles),
      pair_walking_label: walkingLabelBetweenStops(
        pair.distance_miles,
        pair.activity.activity_name || pair.activity.name
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
        pair.restaurant.restaurant_name || pair.restaurant.name
      ),
      pair_score: pair.pair_score,
    })),
    pairs: bestPairs,
  };
}


const LOCATION_COLUMNS = `
  id,
  location_type,
  restaurant_name,
  activity_name,
  name,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  description,
  cuisine,
  cuisine_type,
  activity_type,
  atmosphere,
  lighting,
  noise_level,
  price_range,
  group_friendly,
  reservation_link,
  reservation_url,
  booking_url,
  website,
  phone,
  image_url,
  rating,
  review_count,
  review_score,
  review_keywords,
  review_snippet,
  search_document
`;

const ACTIVITY_COLUMNS = `
  id,
  activity_name,
  activity_type,
  address,
  city,
  state,
  zip_code,
  price_range,
  atmosphere,
  group_friendly,
  reservation_link,
  website,
  image_url,
  status,
  date_style_tags,
  primary_tag,
  rating,
  review_count,
  quality_score,
  popularity_score,
  detail_url,
  claim_url,
  view_count,
  click_count,
  roseout_score,
  neighborhood,
  latitude,
  longitude,
  reservation_url,
  phone,
  noise_level,
  dress_code,
  parking_info,
  hours,
  description,
  best_for,
  special_features,
  signature_items,
  search_keywords,
  ranking_badge,
  trend_score,
  conversion_score,
  review_score,
  review_keywords,
  google_maps_url,
  price_level,
  theouthaven_score,
  search_document
`;

const RESTAURANT_COLUMNS = `
  id,
  restaurant_name,
  city,
  state,
  cuisine_type,
  price_range,
  description,
  reservation_link,
  google_maps_link,
  yelp_link,
  instagram_url,
  status,
  mood_tags,
  lighting,
  noise_level,
  atmosphere,
  best_for,
  phone,
  email,
  website,
  neighborhood,
  hours_of_operation,
  days_of_operation,
  kitchen_closing_time,
  street,
  zip_code,
  address,
  image_url,
  date_style_tags,
  primary_tag,
  rating,
  review_count,
  yelp_id,
  yelp_url,
  google_place_id,
  quality_score,
  popularity_score,
  detail_url,
  claim_url,
  claim_status,
  updated_at,
  facebook_url,
  view_count,
  click_count,
  claim_count,
  roseout_score,
  owner_name,
  owner_phone,
  claimed,
  latitude,
  longitude,
  search_document
`;

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

  const foodColumns = [
    "restaurant_name",
    "cuisine_type",
    "description",
    "primary_tag",
    "search_document",
  ];

  const foodTerms = new Set<string>();

  Object.entries(FOOD_INTENTS).forEach(([intentKey, keywords]) => {
    if (keywords.some((keyword) => text.includes(normalizeQuery(keyword)))) {
      keywords.forEach((keyword) => foodTerms.add(normalizeQuery(keyword)));
      foodTerms.add(normalizeQuery(intentKey.replace(/_/g, " ")));
    }
  });

  const foodFilter =
    foodTerms.size > 0
      ? buildTextOrFilter(foodColumns, Array.from(foodTerms))
      : "";

  const applyFoodFilter = (query: any) => {
    if (!foodFilter) return query;
    return query.or(foodFilter);
  };

  const restaurantQueries: PromiseLike<any>[] = [];

  // General food fallback. This keeps the request URL short because it only
  // searches food terms, not every neighborhood name.
  let foodQuery = supabase.from("restaurants").select(RESTAURANT_COLUMNS);
  foodQuery = applyFoodFilter(foodQuery);
  restaurantQueries.push(foodQuery.limit(300));

  // Queens fallback by coordinate bounds. This keeps ALL Queens neighborhoods
  // without sending a huge OR list in the URL.
  if (text.includes("queens")) {
    let queensQuery = supabase
      .from("restaurants")
      .select(RESTAURANT_COLUMNS)
      .eq("state", "NY")
      .gte("latitude", 40.48)
      .lte("latitude", 40.82)
      .gte("longitude", -73.96)
      .lte("longitude", -73.68);

    queensQuery = applyFoodFilter(queensQuery);
    restaurantQueries.push(queensQuery.limit(150));
  }

  // Long Island fallback by coordinate bounds.
  if (text.includes("long island") || text.includes("nassau") || text.includes("suffolk")) {
    let longIslandQuery = supabase
      .from("restaurants")
      .select(RESTAURANT_COLUMNS)
      .eq("state", "NY")
      .gte("latitude", 40.5)
      .lte("latitude", 41.35)
      .gte("longitude", -73.8)
      .lte("longitude", -71.75);

    longIslandQuery = applyFoodFilter(longIslandQuery);
    restaurantQueries.push(longIslandQuery.limit(150));
  }

  // North Jersey fallback by coordinate bounds.
  if (text.includes("new jersey") || text.includes("north jersey") || text.includes("jersey")) {
    let jerseyQuery = supabase
      .from("restaurants")
      .select(RESTAURANT_COLUMNS)
      .eq("state", "NJ")
      .gte("latitude", 40.45)
      .lte("latitude", 41.25)
      .gte("longitude", -74.35)
      .lte("longitude", -73.85);

    jerseyQuery = applyFoodFilter(jerseyQuery);
    restaurantQueries.push(jerseyQuery.limit(150));
  }

  const [locationsResult, activitiesResult, ...restaurantResults] =
    await Promise.all([
      supabase.from("locations").select(LOCATION_COLUMNS).limit(100),
      supabase.from("activities").select(ACTIVITY_COLUMNS).limit(300),
      ...restaurantQueries,
    ]);

  if (locationsResult.error) throw locationsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;

  const restaurantRows: any[] = [];
  restaurantResults.forEach((result: any) => {
    if (result.error) throw result.error;
    restaurantRows.push(...(result.data || []));
  });

  const seenRestaurants = new Set<string>();
  const restaurants = restaurantRows.filter((restaurant: any) => {
    const key = String(
      restaurant.id ||
        restaurant.google_place_id ||
        `${restaurant.restaurant_name || ""}-${restaurant.address || ""}`
    );

    if (!key || seenRestaurants.has(key)) return false;
    seenRestaurants.add(key);
    return true;
  });

  return {
    locations: locationsResult.data || [],
    restaurants,
    activities: activitiesResult.data || [],
  };
}


async function fetchSupportingRecords() {
  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_COLUMNS)
    .limit(100);

  if (error) throw error;

  return {
    locations: data || [],
  };
}

function confidenceLabelFromSimilarity(similarity: number) {
  if (similarity >= 0.78) return "high";
  if (similarity >= 0.68) return "medium";
  return "low";
}

async function createSearchEmbedding(input: string) {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  return embeddingResponse.data[0].embedding;
}

function mapEnterpriseRestaurant(restaurant: any) {
  const semanticSimilarity = Number(restaurant.semantic_similarity || 0);
  const finalScore = Number(restaurant.final_score || 0) * 100;

  return {
    ...restaurant,
    location_type: "restaurant",
    name: restaurant.restaurant_name,
    restaurant_name: restaurant.restaurant_name,
    cuisine: restaurant.cuisine || restaurant.cuisine_type,
    cuisine_type: restaurant.cuisine_type || restaurant.cuisine,
    theouthaven_score: finalScore,
    smart_match_score: finalScore,
    semantic_similarity: semanticSimilarity,
    semantic_score_boost: semanticSimilarity * 100,
    confidence: semanticSimilarity,
    confidence_label: confidenceLabelFromSimilarity(semanticSimilarity),
  };
}

function mapEnterpriseActivity(activity: any) {
  const semanticSimilarity = Number(activity.semantic_similarity || 0);
  const finalScore = Number(activity.final_score || 0) * 100;

  return {
    ...activity,
    location_type: "activity",
    name: activity.activity_name,
    activity_name: activity.activity_name,
    theouthaven_score: finalScore,
    smart_match_score: finalScore,
    semantic_similarity: semanticSimilarity,
    semantic_score_boost: semanticSimilarity * 100,
    confidence: semanticSimilarity,
    confidence_label: confidenceLabelFromSimilarity(semanticSimilarity),
  };
}

async function fetchEnterpriseSearchRecords(
  input: string,
  intent: ReturnType<typeof detectIntent>
) {
  const embedding = await createSearchEmbedding(input);

  const requestedCity = intent.locations[0] || null;
  const requestedCuisine = intent.foodIntents[0] || null;
  const requestedActivity = intent.activityIntents[0] || null;

  const [restaurantsResult, activitiesResult] = await Promise.all([
    supabase.rpc("search_restaurants_enterprise", {
      query_embedding: embedding,
      requested_city: requestedCity,
      requested_cuisine: requestedCuisine,
      match_limit: 40,
    }),
    supabase.rpc("search_activities_enterprise", {
      query_embedding: embedding,
      requested_city: requestedCity,
      requested_activity: requestedActivity,
      match_limit: 40,
    }),
  ]);

  if (restaurantsResult.error) {
    throw restaurantsResult.error;
  }

  if (activitiesResult.error) {
    throw activitiesResult.error;
  }

  return {
    restaurants: (restaurantsResult.data || []).map(mapEnterpriseRestaurant),
    activities: (activitiesResult.data || []).map(mapEnterpriseActivity),
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

const preliminaryIntent = detectIntent(input, body, []);
const semanticResults = new Map<string, any>();

let matchedRecords = {
  locations: [] as any[],
  restaurants: [] as any[],
  activities: [] as any[],
};

try {
  const [enterpriseRecords, supportingRecords] = await Promise.all([
    fetchEnterpriseSearchRecords(input, preliminaryIntent),
    fetchSupportingRecords(),
  ]);

  matchedRecords = {
    locations: supportingRecords.locations || [],
    restaurants: enterpriseRecords.restaurants || [],
    activities: enterpriseRecords.activities || [],
  };
} catch (rpcError) {
  console.error("ENTERPRISE RPC FALLBACK:", rpcError);
  matchedRecords = await fetchFallbackRecords(input);
}

const mergedLocations = [
  ...(matchedRecords.locations || []),

  ...(matchedRecords.restaurants || []).map((restaurant: any) => ({
    ...restaurant,
    location_type: "restaurant",
    name: restaurant.restaurant_name || restaurant.name,
    restaurant_name: restaurant.restaurant_name || restaurant.name,
  })),

  ...(matchedRecords.activities || []).map((activity: any) => ({
    ...activity,
    location_type: "activity",
    name: activity.activity_name || activity.name,
    activity_name: activity.activity_name || activity.name,
  })),
];

const locations = mergedLocations.map(normalizeLocation);

const intent = detectIntent(input, body, locations);

const cacheKey = buildResponseCacheKey(input, intent);

const { data: cached } = await supabase
  .from("ai_response_cache")
  .select("response, created_at")
  .eq("cache_key", cacheKey)
  .maybeSingle();

if (cached?.response) {
  const cacheAge = Date.now() - new Date(cached.created_at).getTime();

  if (cacheAge < 1000 * 60 * 60 * CACHE_HOURS) {
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
      sourceLocations.filter(isOutingEligibleLocation),
      input
    );

    let restaurants = sourceLocations.filter((item: any) => {
      const type = String(item.location_type || "").toLowerCase();

return (
  isOutingEligibleLocation(item) &&
  (
    type === "restaurant" ||
    Boolean(item.restaurant_name) ||
    Boolean(item.cuisine) ||
    Boolean(item.cuisine_type)
  )
);
});

    let activities = sourceLocations.filter((item: any) => {
      const type = String(item.location_type || "").toLowerCase();

      return (
        isOutingEligibleLocation(item) &&
        (type === "activity" ||
          Boolean(item.activity_name) ||
          Boolean(item.activity_type) ||
          intent.activityIntents.some((activityIntent) =>
            matchesActivityIntent(item, activityIntent)
          ))
      );
    });

    const foodAddOnIntents = intent.foodIntents.filter(isFoodAddOnIntent);
    const mealFoodIntents = intent.foodIntents.filter(
      (foodIntent) => !isFoodAddOnIntent(foodIntent)
    );
    const shouldSplitFoodAddOnStops =
      intent.wantsFullOuting &&
      foodAddOnIntents.length > 0 &&
      (intent.text.includes("restaurant") ||
        intent.text.includes("restuarant") ||
        intent.text.includes("restaraunt") ||
        intent.text.includes("dinner") ||
        intent.text.includes("lunch") ||
        intent.text.includes("brunch") ||
        intent.text.includes("food") ||
        intent.text.includes("eat"));

    if (shouldSplitFoodAddOnStops) {
      restaurants = filterRestaurantsByFoodIntent(restaurants, {
        ...intent,
        foodIntents: mealFoodIntents,
      });

      const foodAddOnActivities = sourceLocations
        .filter(isOutingEligibleLocation)
        .filter((item: any) =>
          foodAddOnIntents.some((foodIntent) =>
            matchesFoodIntent(item, foodIntent)
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
              "Dessert stop",
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
        intent
      );
    } else {
      restaurants = filterRestaurantsByFoodIntent(restaurants, intent);
      activities = filterActivitiesByActivityIntent(activities, intent);
    }

    if (restaurants.length === 0 && intent.wantsRestaurant) {
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

    if (isLoungeActivityOnlyRequest(intent)) {
      restaurants = [];
      activities = sourceLocations.filter(
        (item: any) =>
          isOutingEligibleLocation(item) &&
          isLoungeStyleLocation(item) &&
          intent.activityIntents.some((activityIntent) =>
            matchesActivityIntent(item, activityIntent)
          )
      );
    }

    if (isExplicitFoodAtLoungeRequest(intent)) {
      restaurants = restaurants.filter(isLoungeStyleLocation);
    }

    if (intent.locations.length > 0) {
      const locationRestaurants = restaurants.filter((item: any) =>
        matchesLocation(item, intent.locations)
      );

      const locationActivities = activities.filter((item: any) =>
        matchesLocation(item, intent.locations)
      );

      restaurants = locationRestaurants;
      activities = locationActivities;
    }

    if (intent.activityIntents.length > 0) {
      let forcedActivityMatches = sourceLocations.filter(
        (item: any) =>
          isOutingEligibleLocation(item) &&
          intent.activityIntents.some((activityIntent) =>
            matchesActivityIntent(item, activityIntent)
          )
      );

      if (intent.locations.length > 0) {
        const locationFiltered = forcedActivityMatches.filter((item: any) =>
          matchesLocation(item, intent.locations)
        );

        forcedActivityMatches = locationFiltered;
      }

      if (forcedActivityMatches.length > 0) {
        activities = forcedActivityMatches;
      }
    }

    if (isLoungeActivityOnlyRequest(intent)) {
      restaurants = [];
    }

    const dedupedLocationResults = removeDuplicateLocationsAcrossTypes(
      restaurants,
      activities,
      isExplicitFoodAtLoungeRequest(intent) ? "restaurants" : "activities"
    );

    restaurants = dedupedLocationResults.restaurants;
    activities = dedupedLocationResults.activities;

    const rankedRestaurants = restaurants
      .map((restaurant: any) => {
        const semantic = semanticScoreBoost(restaurant, semanticResults);
        const score = clampScore(
          scoreRestaurant(restaurant, input, intent) + semantic.semantic_score_boost
        );
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

    const rankedActivities = activities
      .map((activity: any) => {
        const semantic = semanticScoreBoost(activity, semanticResults);
        const score = clampScore(
          scoreActivity(activity, input, intent) + semantic.semantic_score_boost
        );
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

    const smartBalanced = balanceSmartMatches(
      rankedRestaurants,
      rankedActivities,
      smartIntent
    );

    if (
      intent.activityIntents.length > 0 &&
      rankedActivities.length > 0 &&
      smartBalanced.activities.length === 0
    ) {
      smartBalanced.activities = rankedActivities.slice(0, 2);
    }

    if (
      intent.foodIntents.length > 0 &&
      rankedRestaurants.length > 0 &&
      smartBalanced.restaurants.length === 0
    ) {
      smartBalanced.restaurants = rankedRestaurants.slice(0, 2);
    }

    if (
      shouldSplitFoodAddOnStops &&
      rankedActivities.length > 0 &&
      smartBalanced.activities.length === 0
    ) {
      smartBalanced.activities = rankedActivities.slice(0, 2);
    }

 const wantsWalkingPair =
  intent.wantsFullOuting ||
  (intent.wantsRestaurant && intent.wantsActivity) ||
  input.toLowerCase().includes("walking distance") ||
  input.toLowerCase().includes("walkable") ||
  input.toLowerCase().includes("nearby") ||
  input.toLowerCase().includes("close by");

const walkingPairs =
  wantsWalkingPair &&
  smartBalanced.restaurants.length > 0 &&
  smartBalanced.activities.length > 0
    ? pairWalkingDistanceMatches(
        smartBalanced.restaurants,
        smartBalanced.activities
      )
    : [];

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
            pair.activity.activity_name || pair.activity.name
          }`,
          pair_score: pair.pair_score,
        })),
        pairs: walkingPairs,
      }
    : smartBalanced.restaurants.length > 0 &&
        smartBalanced.activities.length > 0
      ? pairSmartMatches(smartBalanced.restaurants, smartBalanced.activities)
      : {
          restaurants: smartBalanced.restaurants,
          activities: smartBalanced.activities,
          pairs: [],
        };

    const finalDedupedResults = removeDuplicateLocationsAcrossTypes(
      pairedResults.restaurants,
      pairedResults.activities,
      isExplicitFoodAtLoungeRequest(intent) ? "restaurants" : "activities"
    );

    const topRestaurants = sortLocationsNearFirst(
      finalDedupedResults.restaurants,
      intent
    );
    const topActivities = sortLocationsNearFirst(
      finalDedupedResults.activities,
      intent
    );

    const slimMatchedLocations = matchedLocationResults.map((item: any) => ({
      id: String(item.id),
      name: item.restaurant_name || item.activity_name || item.name,
      location_type: item.location_type,
      city: item.city,
      address: item.address,
      cuisine: item.cuisine || item.cuisine_type || null,
      activity_type:
        item.activity_type || item.category || item.subcategory || null,
      score: item.location_name_match_score,
    }));

    const slimRestaurants = topRestaurants.map((r: any) => ({
      name: r.restaurant_name || r.name,
      city: r.city,
      cuisine: r.cuisine || r.cuisine_type,
      score: clampScore(r.theouthaven_score),
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
      name: a.activity_name || a.name,
      city: a.city,
      type: a.activity_type || a.category || a.subcategory,
      score: clampScore(a.theouthaven_score),
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
- If the user asks for a restaurant with activities, date night, full outing, nearby, walkable, or walking distance, prioritize restaurant/activity pairs within 0.75 miles.
`;

    const hasResults =
      topRestaurants.length > 0 ||
      topActivities.length > 0 ||
      matchedLocationResults.length > 0;

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
        response?.output_text ||
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
        name: item.restaurant_name || item.activity_name || item.name,
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
        image_url: item.image_url || null,
        reservation_url: item.reservation_url || item.booking_url || null,
        location_name_match_score: item.location_name_match_score,
      })),
      pairs: pairedResults.pairs.map((pair: any) => ({
        restaurant_name: pair.restaurant.restaurant_name || pair.restaurant.name,
        activity_name: pair.activity.activity_name || pair.activity.name,
        distance_miles: pair.distance_miles,
        walking_minutes: walkingMinutesFromMiles(pair.distance_miles),
        walking_label_from_restaurant: walkingLabelBetweenStops(
          pair.distance_miles,
          pair.restaurant.restaurant_name || pair.restaurant.name
        ),
        walking_label_from_activity: walkingLabelBetweenStops(
          pair.distance_miles,
          pair.activity.activity_name || pair.activity.name
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
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        cuisine: r.cuisine || r.cuisine_type || null,
        atmosphere: r.atmosphere || null,
        price_range: r.price_range || null,
        theouthaven_score: clampScore(r.theouthaven_score),
        smart_match_score: clampScore(r.smart_match_score || r.theouthaven_score),
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
        reservation_link: r.reservation_link,
        reservation_url: r.reservation_url || r.booking_url,
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
        activity_type: a.activity_type || a.category || a.subcategory,
        detail_location_type: a.detail_location_type || "activities",
        address: a.address,
        city: a.city,
        state: a.state,
        zip_code: a.zip_code,
        latitude: a.latitude || null,
        longitude: a.longitude || null,
        price_range: a.price_range,
        atmosphere: a.atmosphere,
        group_friendly: a.group_friendly,
        theouthaven_score: clampScore(a.theouthaven_score),
        smart_match_score: clampScore(a.smart_match_score || a.theouthaven_score),
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
        reservation_link: a.reservation_link,
        reservation_url: a.reservation_url || a.booking_url,
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
    };

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
      { status: 500 }
    );
  }
}
