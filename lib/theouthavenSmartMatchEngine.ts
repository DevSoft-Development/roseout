export type SmartMatchIntent = {
  query: string;
  wantsFood: boolean;
  wantsActivity: boolean;
  wantsFullOuting: boolean;
  foodIntents: string[];
  activityIntents: string[];
  vibes: string[];
  locations: string[];
  locationCoordinates: Array<{
    location: string;
    latitude: number;
    longitude: number;
  }>;
  primaryLocationCoordinate: {
    location: string;
    latitude: number;
    longitude: number;
  } | null;
  strictFoodMode: boolean;
  strictActivityMode: boolean;
};

type ScoredSmartMatchItem = SmartMatchItem & { smart_match_score: number };

const SINGLE_STOP_RESULT_LIMIT = 8;
const FULL_OUTING_RESULT_LIMIT = 6;

export type SmartMatchItem = {
  id?: string;
  name?: string;
  restaurant_name?: string;
  activity_name?: string;
  title?: string;
  cuisine?: string | null;
  category?: string | null;
  atmosphere?: string | null;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  price_range?: string | null;
  theouthaven_score?: number | null;
  rating?: number | null;
  review_count?: number | null;
  tags?: string[] | null;
  date_style_tags?: string[] | null;
  review_keywords?: string[] | null;
  review_snippet?: string | null;
  primary_tag?: string | null;
};

export const FOOD_INTENTS: Record<string, string[]> = {
  steak: ["steak", "steakhouse", "ribeye", "filet mignon", "porterhouse"],
  seafood: ["seafood", "lobster", "crab", "shrimp", "oyster", "oysters", "fish"],
  sushi: ["sushi", "omakase", "japanese sushi"],
  italian: ["italian", "pasta", "spaghetti", "fettuccine", "carbonara"],
  mexican: ["mexican", "taco", "tacos", "burrito", "quesadilla"],
  chinese: ["chinese", "dumplings", "dim sum", "noodles"],
  thai: ["thai", "pad thai", "thai food"],
  indian: ["indian", "curry", "tikka", "masala"],
  mediterranean: ["mediterranean", "greek", "hummus", "falafel"],
  middle_eastern: ["middle eastern", "shawarma", "kebab", "gyro"],
  korean: ["korean", "kbbq", "korean bbq"],
  vietnamese: ["vietnamese", "pho", "banh mi"],
  caribbean: ["caribbean", "jamaican", "jerk chicken", "oxtail"],
  african: ["african", "ethiopian", "nigerian"],
  soul_food: ["soul food", "southern", "comfort food"],
  bbq: ["bbq", "barbecue", "smoked meat", "ribs", "brisket"],
  american: ["american", "classic american"],
  pizza: ["pizza", "pizzeria", "slice"],
  burger: ["burger", "burgers", "cheeseburger"],
  wings: ["wings", "chicken wings"],
  sandwich: ["sandwich", "subs", "hoagie", "hero"],
  deli: ["deli", "delicatessen"],
  fast_food: ["fast food", "quick bite"],
  street_food: ["street food", "food truck"],
  brunch: ["brunch", "bottomless brunch"],
  breakfast: ["breakfast", "eggs", "pancakes", "waffles"],
  lunch: ["lunch"],
  late_night_food: ["late night food", "open late", "24 hours"],
  drinks: ["drinks", "cocktail", "cocktails", "bar", "lounge"],
  wine_bar: ["wine bar", "wine tasting"],
  rooftop: ["rooftop", "rooftop dining"],
  speakeasy: ["speakeasy", "hidden bar"],
  fine_dining: ["fine dining", "tasting menu", "michelin", "chef tasting"],
  luxury_dining: ["luxury dining", "upscale restaurant"],
  romantic_restaurant: ["romantic dinner", "date restaurant", "candlelight"],
  waterfront: ["waterfront", "water view", "river view"],
  outdoor_dining: ["outdoor dining", "patio", "garden seating"],
  vegan: ["vegan", "plant based", "plant-based"],
  vegetarian: ["vegetarian"],
  halal: ["halal"],
  kosher: ["kosher"],
  gluten_free: ["gluten free", "gluten-free"],
  dessert: [
    "dessert",
    "desserts",
    "desert",
    "deserts",
    "sweets",
    "cake",
    "bakery",
  ],
  ice_cream: ["ice cream", "gelato"],
  coffee: ["coffee", "cafe", "espresso", "latte"],
  hibachi: ["hibachi", "teppanyaki"],
  buffet: ["buffet", "all you can eat", "all-you-can-eat"],
  hot_pot: ["hot pot"],
};

export const ACTIVITY_INTENTS: Record<string, string[]> = {
  bowling: ["bowling", "bowl", "bowling alley"],
  karaoke: ["karaoke", "karoke", "karoake", "singing"],
  arcade: ["arcade", "games", "game room"],
  museum: ["museum", "gallery", "art", "exhibit"],
  comedy: ["comedy", "stand up", "stand-up"],
  escape_room: ["escape room", "escape"],
  mini_golf: ["mini golf", "minigolf", "miniature golf"],
  spa: ["spa", "massage"],
  live_music: ["live music", "jazz", "concert", "music venue"],
  nightclub: ["nightclub", "night club", "club", "dance club"],
  lounge: ["lounge", "cocktail lounge", "hookah lounge", "music lounge"],
  pool: ["pool", "billiards", "pool hall"],
  hookah: ["hookah", "hookah lounge", "shisha", "hookah bar"],
  cigar: ["cigar", "cigar lounge", "cigar bar", "smoke lounge"],
  park: [
    "park",
    "outdoor",
    "picnic",
    "walk",
    "nature",
    "garden",
    "waterfront",
    "riverwalk",
    "scenic",
  ],
  rooftop: ["rooftop", "rooftop bar", "rooftop lounge"],
  boat: ["boat", "yacht", "cruise", "ferry"],
  movie: ["movie", "cinema", "theater"],
  shopping: ["shopping", "mall", "boutique"],
  art_class: ["paint", "painting", "sip and paint", "art class"],
  dance: ["dance", "dancing"],
  axe_throwing: ["axe throwing", "axe"],
  paintball: ["paintball"],
  golf: ["golf", "topgolf", "driving range", "indoor golf"],
};

export const VIBE_INTENTS: Record<string, string[]> = {
  romantic: [
    "romantic",
    "date night",
    "anniversary",
    "intimate",
    "candlelight",
    "love",
    "couples",
  ],
  first_date: ["first date", "casual date", "get to know"],
  double_date: ["double date", "with another couple"],
  birthday: ["birthday", "celebrate", "celebration", "party", "turning"],
  anniversary: ["anniversary", "special occasion"],
  group_fun: ["group", "friends", "with friends", "crew"],
  luxury: [
    "luxury",
    "upscale",
    "fine dining",
    "elegant",
    "classy",
    "high end",
    "premium",
    "vip",
  ],
  boujee: ["boujee", "fancy", "instagram", "aesthetic", "vibes", "trendy"],
  fun: ["fun", "exciting", "games", "interactive", "energetic"],
  chill: ["chill", "relaxed", "quiet", "low key", "low-key", "laid back"],
  cozy: ["cozy", "warm", "comfortable", "intimate vibe"],
  nightlife: ["nightlife", "late night", "after hours", "turn up"],
  daytime: ["day date", "daytime", "afternoon"],
  brunch_vibe: ["brunch vibes", "bottomless", "day party"],
  live_vibe: ["live music", "jazz", "band", "performance"],
  party_vibe: ["party", "lit", "turn up", "dance"],
  outdoor: ["outdoor", "outside", "park", "nature", "fresh air"],
  scenic: ["view", "rooftop", "waterfront", "city view", "skyline"],
  quick_bite: ["quick", "fast", "grab and go"],
  long_dinner: ["long dinner", "sit down", "slow dinner", "full experience"],
  business: ["business", "meeting", "client", "professional"],
  solo: ["solo", "alone", "by myself"],
  adventurous: [
    "adventurous",
    "something different",
    "unique",
    "new experience",
  ],
  cheap: ["cheap", "budget", "affordable", "low cost"],
};

export const LOCATION_INTENTS: string[] = [
  "nyc",
  "new york",
  "new york city",
  "manhattan",
  "soho",
  "south of houston",
  "tribeca",
  "hudson square",
  "civic center",
  "downtown",
  "uptown",
  "two bridges",
  "lower east side",
  "les",
  "east village",
  "alphabet city",
  "noho",
  "nolita",
  "little italy",
  "chinatown",
  "financial district",
  "fidi",
  "wall street",
  "battery park",
  "battery park city",
  "seaport",
  "south street seaport",
  "west village",
  "greenwich village",
  "meatpacking district",
  "chelsea",
  "flatiron",
  "nomad",
  "gramercy",
  "union square",
  "stuyvesant town",
  "peter cooper village",
  "kips bay",
  "murray hill",
  "midtown",
  "midtown east",
  "midtown west",
  "hells kitchen",
  "hell s kitchen",
  "hell's kitchen",
  "clinton",
  "theater district",
  "times square",
  "garment district",
  "koreatown",
  "herald square",
  "hudson yards",
  "turtle bay",
  "sutton place",
  "upper east side",
  "ues",
  "yorkville",
  "lenox hill",
  "carnegie hill",
  "upper west side",
  "uws",
  "lincoln square",
  "columbus circle",
  "manhattan valley",
  "morningside heights",
  "harlem",
  "east harlem",
  "spanish harlem",
  "central harlem",
  "west harlem",
  "hamilton heights",
  "washington heights",
  "inwood",
  "marble hill",
  "roosevelt island",
  "brooklyn",
  "queens",
  "bronx",
  "staten island",
  "williamsburg",
  "bushwick",
  "dumbo",
  "downtown brooklyn",
  "brooklyn heights",
  "park slope",
  "prospect heights",
  "bed stuy",
  "bedford stuyvesant",
  "crown heights",
  "greenpoint",
  "fort greene",
  "clinton hill",
  "red hook",
  "sunset park",
  "bay ridge",
  "flatbush",
  "east flatbush",
  "canarsie",
  "sheepshead bay",
  "brighton beach",
  "coney island",
  "astoria",
  "long island city",
  "lic",
  "flushing",
  "jamaica",
  "forest hills",
  "rego park",
  "jackson heights",
  "elmhurst",
  "woodside",
  "ridgewood",
  "ozone park",
  "richmond hill",
  "south ozone park",
  "far rockaway",
  "rockaway",
  "rockaway park",
  "bayside",
  "whitestone",
  "college point",
  "fresh meadows",
  "kew gardens",
  "queens village",
  "laurelton",
  "cambria heights",
  "st albans",
  "springfield gardens",
  "middle village",
  "maspeth",
  "glendale",
  "bellerose",
  "briarwood",
  "douglaston",
  "little neck",
  "howard beach",
  "arverne",
  "broad channel",
  "hunters point",
  "queens plaza",
  "south bronx",
  "fordham",
  "riverdale",
  "kingsbridge",
  "bronx zoo",
  "pelham bay",
  "st george",
  "tottenville",
  "great kills",
  "yonkers",
  "mount vernon",
  "new rochelle",
  "white plains",
  "scarsdale",
  "tarrytown",
  "elmsford",
  "ossining",
  "peekskill",
  "long island",
  "nassau county",
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
  "hicksville",
  "westbury",
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
  "merrick",
  "bellmore",
  "oceanside",
  "lynbrook",
  "new hyde park",
  "glen cove",
  "east meadow",
  "seaford",
  "babylon",
  "deer park",
  "ronkonkoma",
  "patchogue",
  "huntington",
  "smithtown",
  "commack",
  "bay shore",
  "islip",
  "sayville",
  "hauppauge",
  "melville",
  "riverhead",
  "hampton bays",
  "southampton",
  "east hampton",
  "montauk",
  "greenport",
  "port jefferson",
  "stony brook",
  "lindenhurst",
  "brentwood",
  "central islip",
  "sag harbor",
  "island park",
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
  "asbury park",
  "belmar",
  "cranford",
  "east orange",
  "glen ridge",
  "livingston",
  "lodi",
  "lyndhurst",
  "mahwah",
  "millburn",
  "morristown",
  "new brunswick",
  "nutley",
  "passaic",
  "rutherford",
  "south orange",
  "summit",
  "wayne",
  "laguardia",
  "jfk",
];

type LocationCoordinate = {
  latitude: number;
  longitude: number;
};

const MANHATTAN_LOCATION_COORDINATES: Record<string, LocationCoordinate> = {
  manhattan: { latitude: 40.7831, longitude: -73.9712 },
  soho: { latitude: 40.7233, longitude: -74.003 },
  "south of houston": { latitude: 40.7233, longitude: -74.003 },
  tribeca: { latitude: 40.7163, longitude: -74.0086 },
  "hudson square": { latitude: 40.7266, longitude: -74.0074 },
  "civic center": { latitude: 40.7135, longitude: -74.0024 },
  downtown: { latitude: 40.7209, longitude: -74.0007 },
  uptown: { latitude: 40.8156, longitude: -73.9465 },
  "two bridges": { latitude: 40.7114, longitude: -73.9968 },
  "lower east side": { latitude: 40.715, longitude: -73.9843 },
  les: { latitude: 40.715, longitude: -73.9843 },
  "east village": { latitude: 40.7265, longitude: -73.9815 },
  "alphabet city": { latitude: 40.7258, longitude: -73.9786 },
  noho: { latitude: 40.7287, longitude: -73.9926 },
  nolita: { latitude: 40.7223, longitude: -73.9957 },
  "little italy": { latitude: 40.7191, longitude: -73.9973 },
  chinatown: { latitude: 40.7158, longitude: -73.997 },
  "financial district": { latitude: 40.7075, longitude: -74.0113 },
  fidi: { latitude: 40.7075, longitude: -74.0113 },
  "wall street": { latitude: 40.706, longitude: -74.0088 },
  "battery park": { latitude: 40.7033, longitude: -74.017 },
  "battery park city": { latitude: 40.7116, longitude: -74.0158 },
  seaport: { latitude: 40.7065, longitude: -74.0036 },
  "south street seaport": { latitude: 40.7065, longitude: -74.0036 },
  "west village": { latitude: 40.7358, longitude: -74.0036 },
  "greenwich village": { latitude: 40.7336, longitude: -73.9992 },
  "meatpacking district": { latitude: 40.7409, longitude: -74.0077 },
  chelsea: { latitude: 40.7465, longitude: -74.0014 },
  flatiron: { latitude: 40.7411, longitude: -73.9897 },
  nomad: { latitude: 40.7447, longitude: -73.9884 },
  gramercy: { latitude: 40.7376, longitude: -73.9846 },
  "union square": { latitude: 40.7359, longitude: -73.9911 },
  "stuyvesant town": { latitude: 40.7317, longitude: -73.9776 },
  "peter cooper village": { latitude: 40.7338, longitude: -73.9787 },
  "kips bay": { latitude: 40.7423, longitude: -73.9781 },
  "murray hill": { latitude: 40.7479, longitude: -73.9765 },
  midtown: { latitude: 40.7549, longitude: -73.984 },
  "midtown east": { latitude: 40.754, longitude: -73.9708 },
  "midtown west": { latitude: 40.759, longitude: -73.9928 },
  "hells kitchen": { latitude: 40.7638, longitude: -73.9918 },
  "hell s kitchen": { latitude: 40.7638, longitude: -73.9918 },
  "hell's kitchen": { latitude: 40.7638, longitude: -73.9918 },
  clinton: { latitude: 40.7638, longitude: -73.9918 },
  "theater district": { latitude: 40.759, longitude: -73.986 },
  "times square": { latitude: 40.758, longitude: -73.9855 },
  "garment district": { latitude: 40.7547, longitude: -73.9917 },
  koreatown: { latitude: 40.7476, longitude: -73.9867 },
  "herald square": { latitude: 40.7501, longitude: -73.9877 },
  "hudson yards": { latitude: 40.7538, longitude: -74.0022 },
  "turtle bay": { latitude: 40.754, longitude: -73.968 },
  "sutton place": { latitude: 40.7586, longitude: -73.9618 },
  "upper east side": { latitude: 40.7736, longitude: -73.9566 },
  ues: { latitude: 40.7736, longitude: -73.9566 },
  yorkville: { latitude: 40.7762, longitude: -73.9492 },
  "lenox hill": { latitude: 40.7687, longitude: -73.9588 },
  "carnegie hill": { latitude: 40.7845, longitude: -73.9557 },
  "upper west side": { latitude: 40.787, longitude: -73.9754 },
  uws: { latitude: 40.787, longitude: -73.9754 },
  "lincoln square": { latitude: 40.7738, longitude: -73.9845 },
  "columbus circle": { latitude: 40.7681, longitude: -73.9819 },
  "manhattan valley": { latitude: 40.7986, longitude: -73.9619 },
  "morningside heights": { latitude: 40.8075, longitude: -73.9626 },
  harlem: { latitude: 40.8116, longitude: -73.9465 },
  "east harlem": { latitude: 40.7957, longitude: -73.9389 },
  "spanish harlem": { latitude: 40.7957, longitude: -73.9389 },
  "central harlem": { latitude: 40.8116, longitude: -73.9465 },
  "west harlem": { latitude: 40.8188, longitude: -73.9558 },
  "hamilton heights": { latitude: 40.8253, longitude: -73.9477 },
  "washington heights": { latitude: 40.8417, longitude: -73.9394 },
  inwood: { latitude: 40.8677, longitude: -73.9212 },
  "marble hill": { latitude: 40.8761, longitude: -73.9103 },
  "roosevelt island": { latitude: 40.7618, longitude: -73.9499 },
};

const LOCATION_COORDINATES: Record<string, LocationCoordinate> = {
  ...MANHATTAN_LOCATION_COORDINATES,
};

function coordinatesForSmartLocations(locations: string[]) {
  return locations
    .map((location) => {
      const normalizedLocation = normalize(location);
      const coordinates = LOCATION_COORDINATES[normalizedLocation];

      if (!coordinates) return null;

      return {
        location: normalizedLocation,
        ...coordinates,
      };
    })
    .filter(
      (coordinates): coordinates is {
        location: string;
        latitude: number;
        longitude: number;
      } => Boolean(coordinates)
    );
}

const MEAL_WORDS = [
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
  "food",
  "eat",
];

function normalize(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s$.-]/g, " ")
    .replace(/\s+/g, " ");
}

function phraseIncludes(text: string, phrase: string) {
  const cleanText = normalize(text);
  const cleanPhrase = normalize(phrase);

  if (!cleanText || !cleanPhrase) return false;

  if (cleanPhrase.length <= 3) {
    return new RegExp(`\\b${cleanPhrase}\\b`).test(cleanText);
  }

  return cleanText.includes(cleanPhrase);
}

function detectFromMap(input: string, map: Record<string, string[]>) {
  const text = normalize(input);

  return Array.from(
    new Set(
      Object.entries(map)
        .filter(([, keywords]) =>
          keywords.some((word) => phraseIncludes(text, word))
        )
        .map(([key]) => key)
    )
  );
}

function normalizeLocation(location: string) {
  if (location === "lic") return "long island city";
  if (location === "les") return "lower east side";
  if (location === "fidi") return "financial district";
  return location;
}

function isLongIslandCityItem(item: SmartMatchItem) {
  const locationFields = [
    item.city,
    item.neighborhood,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .map((value) => normalize(String(value)));

  return (
    locationFields.includes("long island city") ||
    locationFields.includes("lic") ||
    (locationFields.includes("queens") &&
      phraseIncludes(getSearchText(item), "long island city"))
  );
}

export function detectSmartMatchIntent(input: string): SmartMatchIntent {
  const text = normalize(input);

  const foodIntents = detectFromMap(text, FOOD_INTENTS);
  const activityIntents = detectFromMap(text, ACTIVITY_INTENTS);
  const vibes = detectFromMap(text, VIBE_INTENTS);

  const locations = Array.from(
    new Set(
      LOCATION_INTENTS.filter((location) => phraseIncludes(text, location)).map(
        normalizeLocation
      )
    )
  );

  const locationCoordinates = coordinatesForSmartLocations(locations);
  const primaryLocationCoordinate = locationCoordinates[0] || null;

  const wantsFood =
    foodIntents.length > 0 || MEAL_WORDS.some((word) => phraseIncludes(text, word));

  const wantsActivity =
    activityIntents.length > 0 ||
    ["activity", "activities", "things to do", "date idea", "date ideas", "outing"].some(
      (word) => phraseIncludes(text, word)
    );

  const wantsFullOuting =
    phraseIncludes(text, "with") ||
    phraseIncludes(text, "and") ||
    text.includes("+") ||
    phraseIncludes(text, "date night") ||
    phraseIncludes(text, "outing") ||
    (wantsFood && wantsActivity);

  return {
    query: text,
    wantsFood,
    wantsActivity,
    wantsFullOuting,
    foodIntents,
    activityIntents,
    vibes,
    locations,
    locationCoordinates,
    primaryLocationCoordinate,
    strictFoodMode: foodIntents.length > 0,
    strictActivityMode: activityIntents.length > 0,
  };
}

function getSearchText(item: SmartMatchItem) {
  return [
    item.name,
    item.restaurant_name,
    item.activity_name,
    item.title,
    item.cuisine,
    item.category,
    item.atmosphere,
    item.description,
    item.city,
    item.state,
    item.neighborhood,
    item.address,
    item.price_range,
    item.primary_tag,
    item.review_snippet,
    ...(item.tags || []),
    ...(item.date_style_tags || []),
    ...(item.review_keywords || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesIntent(
  item: SmartMatchItem,
  intentKeys: string[],
  intentMap: Record<string, string[]>
) {
  const text = getSearchText(item);

  return intentKeys.some((key) => {
    const keywords = intentMap[key] || [];
    return keywords.some((word) => phraseIncludes(text, word));
  });
}

export function matchesFoodIntent(
  item: SmartMatchItem,
  intent: SmartMatchIntent
) {
  if (!intent.strictFoodMode) return true;
  return matchesIntent(item, intent.foodIntents, FOOD_INTENTS);
}

export function matchesActivityIntent(
  item: SmartMatchItem,
  intent: SmartMatchIntent
) {
  if (!intent.strictActivityMode) return true;
  return matchesIntent(item, intent.activityIntents, ACTIVITY_INTENTS);
}

export function matchesLocationIntent(
  item: SmartMatchItem,
  intent: SmartMatchIntent
) {
  if (!intent.locations.length) return true;

  if (
    intent.locations.includes("long island") &&
    !intent.locations.includes("long island city") &&
    isLongIslandCityItem(item)
  ) {
    return false;
  }

  const text = getSearchText(item);

  return intent.locations.some((location) => phraseIncludes(text, location));
}

export function scoreRestaurant(
  restaurant: SmartMatchItem,
  intent: SmartMatchIntent
) {
  let score = Number(restaurant.theouthaven_score || 0);
  const text = getSearchText(restaurant);

  if (matchesFoodIntent(restaurant, intent)) score += 30;
  if (matchesLocationIntent(restaurant, intent)) score += 15;

  for (const vibe of intent.vibes) {
    const vibeWords = VIBE_INTENTS[vibe] || [];
    if (vibeWords.some((word) => phraseIncludes(text, word))) {
      score += 12;
    }
  }

  if (intent.vibes.includes("luxury")) {
    if (restaurant.price_range === "$$$" || restaurant.price_range === "$$$$") {
      score += 10;
    }
  }

  if (intent.vibes.includes("romantic")) {
    if (
      phraseIncludes(text, "romantic") ||
      phraseIncludes(text, "intimate") ||
      phraseIncludes(text, "candle") ||
      phraseIncludes(text, "date")
    ) {
      score += 12;
    }
  }

  if (intent.vibes.includes("birthday") || intent.vibes.includes("group_fun")) {
    if (
      phraseIncludes(text, "group") ||
      phraseIncludes(text, "celebration") ||
      phraseIncludes(text, "birthday") ||
      phraseIncludes(text, "large party")
    ) {
      score += 10;
    }
  }

  if (restaurant.rating) score += Number(restaurant.rating) * 2;
  if (restaurant.review_count) {
    score += Math.min(Number(restaurant.review_count) / 100, 8);
  }

  return score;
}

export function scoreActivity(
  activity: SmartMatchItem,
  intent: SmartMatchIntent
) {
  let score = Number(activity.theouthaven_score || 0);
  const text = getSearchText(activity);

  if (matchesActivityIntent(activity, intent)) score += 35;
  if (matchesLocationIntent(activity, intent)) score += 15;

  for (const vibe of intent.vibes) {
    const vibeWords = VIBE_INTENTS[vibe] || [];
    if (vibeWords.some((word) => phraseIncludes(text, word))) {
      score += 12;
    }
  }

  if (intent.vibes.includes("fun")) {
    if (
      phraseIncludes(text, "games") ||
      phraseIncludes(text, "bowling") ||
      phraseIncludes(text, "karaoke") ||
      phraseIncludes(text, "arcade") ||
      phraseIncludes(text, "interactive")
    ) {
      score += 14;
    }
  }

  if (intent.vibes.includes("chill") || intent.vibes.includes("cozy")) {
    if (
      phraseIncludes(text, "park") ||
      phraseIncludes(text, "lounge") ||
      phraseIncludes(text, "cafe") ||
      phraseIncludes(text, "walk")
    ) {
      score += 10;
    }
  }

  if (intent.vibes.includes("nightlife")) {
    if (
      phraseIncludes(text, "hookah") ||
      phraseIncludes(text, "cigar") ||
      phraseIncludes(text, "lounge") ||
      phraseIncludes(text, "club") ||
      phraseIncludes(text, "bar")
    ) {
      score += 14;
    }
  }

  if (activity.rating) score += Number(activity.rating) * 2;
  if (activity.review_count) {
    score += Math.min(Number(activity.review_count) / 100, 8);
  }

  return score;
}

export function filterSmartRestaurants(
  restaurants: SmartMatchItem[],
  intent: SmartMatchIntent
) {
  return restaurants
    .filter((restaurant) => matchesLocationIntent(restaurant, intent))
    .filter((restaurant) => matchesFoodIntent(restaurant, intent))
    .map((restaurant) => ({
      ...restaurant,
      smart_match_score: scoreRestaurant(restaurant, intent),
    }))
    .sort(
      (a: ScoredSmartMatchItem, b: ScoredSmartMatchItem) =>
        b.smart_match_score - a.smart_match_score
    );
}

export function filterSmartActivities(
  activities: SmartMatchItem[],
  intent: SmartMatchIntent
) {
  return activities
    .filter((activity) => matchesLocationIntent(activity, intent))
    .filter((activity) => matchesActivityIntent(activity, intent))
    .map((activity) => ({
      ...activity,
      smart_match_score: scoreActivity(activity, intent),
    }))
    .sort(
      (a: ScoredSmartMatchItem, b: ScoredSmartMatchItem) =>
        b.smart_match_score - a.smart_match_score
    );
}

export function balanceSmartMatches(
  restaurants: SmartMatchItem[],
  activities: SmartMatchItem[],
  intent: SmartMatchIntent
) {
  const smartRestaurants = filterSmartRestaurants(restaurants, intent);
  const smartActivities = filterSmartActivities(activities, intent);

  const finalRestaurants =
    smartRestaurants.length > 0 ? smartRestaurants : restaurants;

  const finalActivities =
    smartActivities.length > 0 ? smartActivities : activities;

  if (intent.wantsFood && !intent.wantsActivity && !intent.wantsFullOuting) {
    return {
      restaurants: finalRestaurants.slice(0, SINGLE_STOP_RESULT_LIMIT),
      activities: [],
      mode: "food_only",
    };
  }

  if (!intent.wantsFood && intent.wantsActivity && !intent.wantsFullOuting) {
    return {
      restaurants: [],
      activities: finalActivities.slice(0, SINGLE_STOP_RESULT_LIMIT),
      mode: "activity_only",
    };
  }

  return {
    restaurants: finalRestaurants.slice(0, FULL_OUTING_RESULT_LIMIT),
    activities: finalActivities.slice(0, FULL_OUTING_RESULT_LIMIT),
    mode: "full_outing",
  };
}

export function getSmartMatchVersion() {
  return "theouthaven-smart-match-engine-v9";
}
