export type LocationFoodTermPatch = {
  foodTerms: string[];
  cuisineTerms: string[];
  categoryTerms: string[];
  featureTerms: string[];
  searchKeywords: string[];
  semanticTags: string[];
  intentTags: string[];
};

type CanonicalLocationFoodTermConfig = {
  match: string[];
  foodTerms: string[];
  cuisineTerms: string[];
  categoryTerms: string[];
  featureTerms: string[];
};

export const CANONICAL_LOCATION_FOOD_TERMS: Record<
  string,
  CanonicalLocationFoodTermConfig
> = {
  wings: {
    match: [
      "wing",
      "wings",
      "chicken wing",
      "chicken wings",
      "hot chicken",
      "fried chicken",
    ],
    foodTerms: ["wings", "chicken wings", "fried chicken", "hot chicken", "chicken"],
    cuisineTerms: ["american"],
    categoryTerms: ["wings", "fried chicken"],
    featureTerms: ["bar food"],
  },
  burger: {
    match: ["burger", "burgers", "cheeseburger", "hamburger", "sliders"],
    foodTerms: ["burger", "burgers", "cheeseburger", "sliders"],
    cuisineTerms: ["american"],
    categoryTerms: ["burger spot"],
    featureTerms: ["bar food"],
  },
  tacos: {
    match: ["taco", "tacos", "taqueria", "tex mex", "mexican"],
    foodTerms: ["taco", "tacos", "tex mex"],
    cuisineTerms: ["mexican"],
    categoryTerms: ["taqueria", "mexican restaurant"],
    featureTerms: ["margaritas"],
  },
  seafood: {
    match: ["seafood", "lobster", "crab", "shrimp", "oyster", "oysters", "raw bar"],
    foodTerms: ["seafood", "lobster", "crab", "shrimp", "oyster", "oysters", "raw bar"],
    cuisineTerms: ["seafood"],
    categoryTerms: ["seafood restaurant"],
    featureTerms: [],
  },
  steak: {
    match: ["steak", "steakhouse", "steak house", "filet mignon", "prime rib", "brazilian steakhouse"],
    foodTerms: ["steak", "steakhouse", "steak house", "filet mignon", "prime rib"],
    cuisineTerms: ["steakhouse", "american"],
    categoryTerms: ["steakhouse"],
    featureTerms: ["wine", "cocktails"],
  },
  sushi: {
    match: ["sushi", "japanese sushi", "omakase"],
    foodTerms: ["sushi", "omakase"],
    cuisineTerms: ["japanese"],
    categoryTerms: ["sushi spot", "sushi restaurant"],
    featureTerms: [],
  },
  ramen: {
    match: ["ramen", "japanese ramen"],
    foodTerms: ["ramen"],
    cuisineTerms: ["japanese"],
    categoryTerms: ["ramen spot"],
    featureTerms: [],
  },
  pizza: {
    match: ["pizza", "pizzeria"],
    foodTerms: ["pizza"],
    cuisineTerms: ["italian"],
    categoryTerms: ["pizza place", "pizzeria"],
    featureTerms: [],
  },
  pasta: {
    match: ["pasta", "italian"],
    foodTerms: ["pasta"],
    cuisineTerms: ["italian"],
    categoryTerms: ["italian restaurant"],
    featureTerms: ["wine"],
  },
  brunch: {
    match: ["brunch", "mimosas", "breakfast"],
    foodTerms: ["brunch", "breakfast"],
    cuisineTerms: [],
    categoryTerms: ["brunch spot"],
    featureTerms: ["mimosas", "bottomless mimosas"],
  },
  vegan: {
    match: ["vegan", "plant based", "plant-based"],
    foodTerms: ["vegan", "plant based"],
    cuisineTerms: ["vegan"],
    categoryTerms: ["vegan restaurant"],
    featureTerms: [],
  },
  vegetarian: {
    match: ["vegetarian"],
    foodTerms: ["vegetarian"],
    cuisineTerms: ["vegetarian"],
    categoryTerms: ["vegetarian restaurant"],
    featureTerms: [],
  },
  halal: {
    match: ["halal", "halal food", "halal restaurant"],
    foodTerms: ["halal", "halal food"],
    cuisineTerms: ["halal"],
    categoryTerms: ["halal restaurant"],
    featureTerms: [],
  },
  cafe: {
    match: ["cafe", "coffee shop", "coffee", "pastry", "pastries", "dessert", "desserts"],
    foodTerms: ["coffee", "pastries", "dessert", "desserts"],
    cuisineTerms: [],
    categoryTerms: ["cafe", "coffee shop", "bakery"],
    featureTerms: ["coffee", "dessert", "pastries"],
  },
  bakery: {
    match: ["bakery", "pastry", "pastries", "cake", "dessert", "desserts", "coffee"],
    foodTerms: ["pastry", "pastries", "dessert", "desserts", "cake", "coffee"],
    cuisineTerms: [],
    categoryTerms: ["bakery", "cafe"],
    featureTerms: ["coffee", "dessert"],
  },
  hookah_food: {
    match: ["hookah", "shisha"],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: ["hookah restaurant", "hookah lounge"],
    featureTerms: ["hookah", "shisha"],
  },
  drinks: {
    match: ["drinks", "cocktails", "cocktail", "beer", "wine", "margarita", "margaritas", "mimosa", "mimosas", "happy hour"],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: ["bar", "lounge"],
    featureTerms: ["drinks", "cocktails", "beer", "wine", "margaritas", "mimosas", "happy hour"],
  },
  games_food: {
    match: ["games", "arcade", "pool", "billiards", "karaoke", "live music"],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: [],
    featureTerms: ["games", "arcade", "pool", "billiards", "karaoke", "live music"],
  },
};

const BLOCKED_WEAK_TERMS = new Set([
  "plant",
  "based",
  "tex",
  "mex",
  "raw",
  "bar",
  "house",
  "filet",
  "mignon",
  "prime",
  "rib",
  "brazilian",
  "late",
  "night",
  "happy",
  "hour",
  "shop",
  "big",
  "screen",
  "watch",
  "party",
  "game",
  "day",
  "live",
  "viewing",
  "and",
  "with",
  "grill",
]);

export function escapeRegex(term: string) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanTerms(terms: string[]) {
  return Array.from(
    new Set(
      terms
        .map((term) => String(term || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((term) => !BLOCKED_WEAK_TERMS.has(term)),
    ),
  );
}

function isBlank(value: unknown) {
  return typeof value !== "string" || !value.trim();
}

export function mergeTextArrayTerms(
  existing: unknown,
  additions: string[],
): { merged: string[]; added: string[] } {
  const existingTerms = cleanTerms(Array.isArray(existing) ? existing : []);
  const existingSet = new Set(existingTerms);
  const added = cleanTerms(additions).filter((term) => !existingSet.has(term));

  return {
    merged: [...existingTerms, ...added],
    added,
  };
}

export function appendMissingTermsToText(existing: unknown, additions: string[]) {
  const text = typeof existing === "string" ? existing.trim() : "";
  const lowerText = ` ${text.toLowerCase()} `;
  const missing = cleanTerms(additions).filter(
    (term) => !new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(lowerText),
  );
  const nextText = [text, missing.join(" ")].filter(Boolean).join(" ").trim();

  return { text: nextText, added: missing };
}

export function buildLocationFoodTermPatch(location: any): LocationFoodTermPatch {
  const haystack = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.address,
    location.city,
    location.neighborhood,
    location.borough,
    location.cuisine,
    location.cuisine_type,
    location.primary_category,
    location.description,
    ...(Array.isArray(location.tags) ? location.tags : []),
    ...(Array.isArray(location.vibe_tags) ? location.vibe_tags : []),
    ...(Array.isArray(location.best_for_tags) ? location.best_for_tags : []),
    ...(Array.isArray(location.date_style_tags) ? location.date_style_tags : []),
    ...(Array.isArray(location.search_keywords) ? location.search_keywords : []),
    ...(Array.isArray(location.semantic_tags) ? location.semantic_tags : []),
    ...(Array.isArray(location.intent_tags) ? location.intent_tags : []),
    location.search_document,
    location.semantic_search_text,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const patch: LocationFoodTermPatch = {
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: [],
    featureTerms: [],
    searchKeywords: [],
    semanticTags: [],
    intentTags: [],
  };

  for (const config of Object.values(CANONICAL_LOCATION_FOOD_TERMS)) {
    const matched = config.match.some((term) =>
      new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(haystack),
    );

    if (!matched) continue;

    patch.foodTerms.push(...config.foodTerms);
    patch.cuisineTerms.push(...config.cuisineTerms);
    patch.categoryTerms.push(...config.categoryTerms);
    patch.featureTerms.push(...config.featureTerms);
  }

  patch.foodTerms = cleanTerms(patch.foodTerms);
  patch.cuisineTerms = cleanTerms(patch.cuisineTerms);
  patch.categoryTerms = cleanTerms(patch.categoryTerms);
  patch.featureTerms = cleanTerms(patch.featureTerms);

  patch.searchKeywords = cleanTerms([
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
    ...patch.featureTerms,
  ]);

  patch.semanticTags = cleanTerms([
    "restaurant",
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
    ...patch.featureTerms,
  ]);

  patch.intentTags = cleanTerms([
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
    ...patch.featureTerms,
  ]);

  return patch;
}

export function buildFoodTermUpdate(location: any, availableColumns: Set<string>) {
  const patch = buildLocationFoodTermPatch(location);
  const allPatchTerms = cleanTerms([
    ...patch.searchKeywords,
    ...patch.semanticTags,
    ...patch.intentTags,
  ]);

  const update: Record<string, unknown> = {};
  const addedSearchKeywords = availableColumns.has("search_keywords")
    ? mergeTextArrayTerms(location.search_keywords, patch.searchKeywords).added
    : [];
  const addedSemanticTags = availableColumns.has("semantic_tags")
    ? mergeTextArrayTerms(location.semantic_tags, patch.semanticTags).added
    : [];
  const addedIntentTags = availableColumns.has("intent_tags")
    ? mergeTextArrayTerms(location.intent_tags, patch.intentTags).added
    : [];

  if (availableColumns.has("search_keywords")) {
    update.search_keywords = mergeTextArrayTerms(
      location.search_keywords,
      patch.searchKeywords,
    ).merged;
  }
  if (availableColumns.has("semantic_tags")) {
    update.semantic_tags = mergeTextArrayTerms(location.semantic_tags, patch.semanticTags).merged;
  }
  if (availableColumns.has("intent_tags")) {
    update.intent_tags = mergeTextArrayTerms(location.intent_tags, patch.intentTags).merged;
  }
  if (availableColumns.has("search_document")) {
    update.search_document = appendMissingTermsToText(
      location.search_document,
      allPatchTerms,
    ).text;
  }
  if (availableColumns.has("semantic_search_text")) {
    update.semantic_search_text = appendMissingTermsToText(
      location.semantic_search_text,
      allPatchTerms,
    ).text;
  }

  const strongCuisineTerms = patch.cuisineTerms.filter((term) => term !== "american");
  const cuisineCandidates = strongCuisineTerms.length ? strongCuisineTerms : patch.cuisineTerms;
  if (cuisineCandidates.length === 1) {
    const cuisine = cuisineCandidates[0];
    if (availableColumns.has("cuisine") && isBlank(location.cuisine)) update.cuisine = cuisine;
    if (availableColumns.has("cuisine_type") && isBlank(location.cuisine_type)) update.cuisine_type = cuisine;
  }

  if (
    availableColumns.has("primary_category") &&
    isBlank(location.primary_category) &&
    patch.categoryTerms.length > 0
  ) {
    update.primary_category = patch.categoryTerms[0];
  }

  const changed = Object.entries(update).some(([key, value]) => {
    if (Array.isArray(value)) {
      return JSON.stringify(value) !== JSON.stringify(Array.isArray(location[key]) ? cleanTerms(location[key]) : []);
    }
    return value !== location[key];
  });

  return {
    patch,
    update,
    changed,
    addedSearchKeywords,
    addedSemanticTags,
    addedIntentTags,
    newSearchDocumentPreview:
      typeof update.search_document === "string"
        ? update.search_document.slice(0, 800)
        : typeof location.search_document === "string"
          ? location.search_document.slice(0, 800)
          : "",
  };
}
