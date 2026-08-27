export const CANONICAL_CUISINES = [
  "steak",
  "seafood",
  "italian",
  "mexican",
  "caribbean",
  "soul_food",
  "american",
  "asian",
  "chinese",
  "japanese",
  "korean",
  "thai",
  "indian",
  "mediterranean",
  "french",
  "spanish",
  "latin",
  "african",
  "brunch",
  "vegan",
  "bbq",
  "dessert",
  "cafe",
  "bars_with_food",
  "hookah",
] as const;

export const CUISINE_SYNONYMS: Record<string, string[]> = {
  steak: [
    "steak",
    "steakhouse",
    "steak house",
    "ribeye",
    "filet mignon",
    "porterhouse",
    "sirloin",
    "tomahawk",
    "churrasco",
    "brazilian steakhouse",
  ],
  seafood: ["seafood", "fish", "lobster", "crab", "shrimp", "oyster", "raw bar", "clam", "salmon"],
  italian: ["italian", "pasta", "pizza", "trattoria", "osteria", "pizzeria", "lasagna", "ravioli"],
  mexican: ["mexican", "tacos", "taco", "burrito", "quesadilla", "taqueria", "tequila bar"],
  caribbean: ["caribbean", "jamaican", "trinidadian", "haitian", "west indian", "jerk chicken", "oxtail", "curry goat", "roti"],
  soul_food: ["soul food", "southern", "fried chicken", "mac and cheese", "collard greens", "comfort food"],
  american: ["american", "new american", "burgers", "burger", "grill", "gastropub", "diner"],
  asian: ["asian", "pan asian", "fusion", "noodle", "noodles"],
  chinese: ["chinese", "dim sum", "dumplings", "szechuan", "sichuan", "cantonese"],
  japanese: ["japanese", "sushi", "ramen", "izakaya", "omakase", "hibachi", "teppanyaki"],
  korean: ["korean", "korean bbq", "kbbq", "bulgogi", "bibimbap"],
  thai: ["thai", "pad thai", "curry", "tom yum"],
  indian: ["indian", "biryani", "curry", "tandoori", "tikka", "masala"],
  mediterranean: ["mediterranean", "greek", "turkish", "middle eastern", "falafel", "gyro", "kebab", "shawarma", "hummus"],
  french: ["french", "bistro", "brasserie", "crepe", "steak frites"],
  spanish: ["spanish", "tapas", "paella"],
  latin: ["latin", "latin american", "peruvian", "colombian", "dominican", "cuban", "puerto rican", "empanada", "arepa"],
  african: ["african", "nigerian", "ethiopian", "senegalese", "ghanaian", "jollof", "injera", "suya"],
  brunch: ["brunch", "breakfast", "pancakes", "waffles", "eggs", "cafe brunch"],
  vegan: ["vegan", "vegetarian", "plant based", "plant-based", "veggie"],
  bbq: ["bbq", "barbecue", "barbeque", "smokehouse", "smoked meat", "ribs", "brisket"],
  dessert: ["dessert", "bakery", "cake", "pastries", "ice cream", "gelato", "donuts", "sweets"],
  cafe: ["cafe", "coffee", "espresso", "latte", "coffee shop"],
  bars_with_food: ["wine bar", "cocktail bar", "gastropub", "sports bar", "bar and grill"],
  hookah: ["hookah", "hookah lounge", "lounge", "shisha"],
};

export const RESTAURANT_CATEGORY_SYNONYMS = CUISINE_SYNONYMS;

const FOOD_SIGNALS = ["restaurant", "bistro", "grill", "kitchen", "food", "dining", "cuisine", "menu"];
const SIGNATURE_QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "breakfast",
  "brooklyn",
  "bronx",
  "dinner",
  "eat",
  "food",
  "for",
  "in",
  "island",
  "lunch",
  "manhattan",
  "me",
  "near",
  "new",
  "nyc",
  "of",
  "or",
  "queens",
  "restaurant",
  "restaurants",
  "staten",
  "the",
  "to",
  "with",
  "york",
]);

const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const arr = (value: unknown) => (Array.isArray(value) ? value : [value]);

export function normalizeFoodText(input: string) {
  return norm(input)
    .replace(/\brestaurants\b/g, "restaurant")
    .replace(/\bcafes\b/g, "cafe")
    .replace(/\btacos\b/g, "taco");
}

function signatureItems(location: any) {
  return arr(location?.signature_items)
    .map((value) => normalizeFoodText(String(value ?? "")))
    .filter(Boolean);
}

function significantTokens(value: string) {
  return normalizeFoodText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !SIGNATURE_QUERY_STOP_WORDS.has(token));
}

export function scoreSignatureItemMatch(location: any, query: string) {
  const normalizedQuery = normalizeFoodText(query);
  const queryTokens = new Set(significantTokens(normalizedQuery));
  const items = signatureItems(location);
  let bestScore = 0;
  let bestReason: string | null = null;

  for (const item of items) {
    if (item.length >= 4 && normalizedQuery.includes(item)) {
      if (180 > bestScore) {
        bestScore = 180;
        bestReason = `signature_exact:${item}`;
      }
      continue;
    }

    const itemTokens = significantTokens(item);
    if (!itemTokens.length) continue;
    const overlap = itemTokens.filter((token) => queryTokens.has(token));
    const overlapRatio = overlap.length / itemTokens.length;

    if (overlap.length >= 2 && overlapRatio >= 0.5) {
      const score = 80 + Math.min(30, overlap.length * 10);
      if (score > bestScore) {
        bestScore = score;
        bestReason = `signature_partial:${overlap.join("+")}`;
      }
      continue;
    }

    const distinctive = overlap.find((token) => token.length >= 6);
    if (distinctive && 35 > bestScore) {
      bestScore = 35;
      bestReason = `signature_token:${distinctive}`;
    }
  }

  return { score: bestScore, reason: bestReason };
}

export function buildLocationFoodText(location: any) {
  return normalizeFoodText(
    [
      location?.name,
      location?.restaurant_name,
      location?.activity_name,
      location?.primary_category,
      location?.category,
      ...arr(location?.categories),
      location?.cuisine,
      location?.cuisine_type,
      location?.restaurant_type,
      location?.activity_type,
      location?.location_type,
      ...arr(location?.tags),
      ...arr(location?.vibe_tags),
      ...arr(location?.signature_items),
      location?.description,
      location?.search_document,
      location?.address,
      location?.neighborhood,
      location?.borough,
      location?.city,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function detect(query: string, map: Record<string, string[]>) {
  const q = normalizeFoodText(query);
  return Object.entries(map)
    .filter(([, synonyms]) => synonyms.some((synonym) => q.includes(normalizeFoodText(synonym))))
    .map(([key]) => key);
}

export function detectRequestedCuisines(query: string) {
  return detect(query, CUISINE_SYNONYMS).filter((key) => key !== "hookah");
}

export function detectRequestedRestaurantCategories(query: string) {
  return detect(query, RESTAURANT_CATEGORY_SYNONYMS);
}

export function locationMatchesCuisineOrCategory(location: any, requested: string[]) {
  const hay = buildLocationFoodText(location);
  return requested.some((key) =>
    (CUISINE_SYNONYMS[key] || [key]).some((synonym) => hay.includes(normalizeFoodText(synonym))),
  );
}

export function scoreCuisineCategoryMatch(location: any, query: string, forRestaurantSlot = true) {
  const requested = detectRequestedRestaurantCategories(query);
  const hay = buildLocationFoodText(location);
  let score = 0;
  const reasons: string[] = [];

  for (const key of requested) {
    const synonyms = CUISINE_SYNONYMS[key] || [key];
    if (
      synonyms.some(
        (synonym) =>
          normalizeFoodText(String(location?.primary_category || "")).includes(normalizeFoodText(synonym)) ||
          normalizeFoodText(String(location?.cuisine || "")).includes(normalizeFoodText(synonym)) ||
          normalizeFoodText(String(location?.cuisine_type || "")).includes(normalizeFoodText(synonym)) ||
          normalizeFoodText(String(location?.restaurant_type || "")).includes(normalizeFoodText(synonym)),
      )
    ) {
      score += 100;
      reasons.push(`exact:${key}`);
    } else if (
      synonyms.some((synonym) =>
        normalizeFoodText(String(location?.name || location?.restaurant_name || "")).includes(normalizeFoodText(synonym)),
      )
    ) {
      score += 85;
      reasons.push(`name:${key}`);
    } else if (synonyms.some((synonym) => hay.includes(normalizeFoodText(synonym)))) {
      score += 70;
      reasons.push(`doc:${key}`);
    }
  }

  const signatureMatch = scoreSignatureItemMatch(location, query);
  if (signatureMatch.score > 0) {
    score += signatureMatch.score;
    if (signatureMatch.reason) reasons.push(signatureMatch.reason);
  }

  const isActivity = hay.includes("activity") || hay.includes("event") || hay.includes("entertainment");
  const isHookahOnly =
    (hay.includes("hookah") || hay.includes("shisha") || hay.includes("lounge")) &&
    !FOOD_SIGNALS.some((signal) => hay.includes(signal));

  if (forRestaurantSlot && isActivity) score -= 60;
  if (forRestaurantSlot && isHookahOnly && requested.some((request) => request !== "hookah")) score -= 80;
  if (
    forRestaurantSlot &&
    requested.some((request) => ["steak", "seafood"].includes(request)) &&
    ["bakery", "dessert", "cafe", "coffee"].some((token) => hay.includes(token)) &&
    !requested.some((request) =>
      CUISINE_SYNONYMS[request]?.some((synonym) => hay.includes(normalizeFoodText(synonym))),
    )
  ) {
    score -= 70;
  }
  if (forRestaurantSlot && !FOOD_SIGNALS.some((signal) => hay.includes(signal))) score -= 40;

  return { score, reasons, requested };
}
