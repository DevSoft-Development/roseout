import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);
const TEXT_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri";
const DETAILS_MASK =
  "id,displayName,formattedAddress,location,primaryType,types,rating,userRatingCount,googleMapsUri,websiteUri,nationalPhoneNumber,currentOpeningHours,regularOpeningHours,editorialSummary,priceLevel";
const MAX_FOOD_PROBES_PER_ROW = 3;

const TYPE_TERMS: Record<string, any> = {
  restaurant: { categoryTerms: ["restaurant"], semanticTags: ["restaurant"] },
  meal_takeaway: { categoryTerms: ["takeout"], featureTerms: ["takeout"] },
  cafe: {
    foodTerms: ["coffee", "pastries", "dessert"],
    categoryTerms: ["cafe", "coffee shop"],
    featureTerms: ["coffee", "dessert", "pastries"],
  },
  bakery: {
    foodTerms: ["pastries", "dessert", "desserts", "cake", "coffee"],
    categoryTerms: ["bakery", "cafe"],
    featureTerms: ["coffee", "dessert", "pastries"],
  },
  bar: {
    categoryTerms: ["bar"],
    featureTerms: ["drinks", "cocktails", "beer", "wine"],
  },
  pub: {
    categoryTerms: ["pub", "bar"],
    featureTerms: ["drinks", "beer", "bar food"],
  },
  night_club: {
    categoryTerms: ["nightlife", "lounge"],
    featureTerms: ["dj", "dancing", "drinks"],
  },
};

const CANONICAL: Record<string, any> = {
  wings: {
    match: [
      "wing",
      "wings",
      "chicken wing",
      "chicken wings",
      "hot chicken",
      "fried chicken",
    ],
    foodTerms: [
      "wings",
      "chicken wings",
      "fried chicken",
      "hot chicken",
      "chicken",
    ],
    cuisineTerms: ["american"],
    categoryTerms: ["wings", "fried chicken"],
    featureTerms: ["bar food"],
  },
  burger: {
    match: ["burger", "burgers", "sliders"],
    foodTerms: ["burger", "burgers", "sliders"],
    cuisineTerms: ["american"],
    categoryTerms: ["burger spot"],
    featureTerms: ["bar food"],
  },
  tacos: {
    match: ["tacos", "taqueria", "mexican", "tex mex"],
    foodTerms: ["tacos", "tex mex"],
    cuisineTerms: ["mexican"],
    categoryTerms: ["taqueria", "mexican restaurant"],
    featureTerms: ["margaritas"],
  },
  seafood: {
    match: ["seafood", "lobster", "crab", "shrimp", "oyster", "raw bar"],
    foodTerms: ["seafood", "lobster", "crab", "shrimp", "oyster", "raw bar"],
    cuisineTerms: ["seafood"],
    categoryTerms: ["seafood restaurant"],
    featureTerms: [],
  },
  steak: {
    match: ["steak", "steakhouse", "steak house", "filet mignon", "prime rib"],
    foodTerms: [
      "steak",
      "steakhouse",
      "steak house",
      "filet mignon",
      "prime rib",
    ],
    cuisineTerms: ["steakhouse"],
    categoryTerms: ["steakhouse"],
    featureTerms: ["wine", "cocktails"],
  },
  sushi: {
    match: ["sushi", "omakase", "japanese"],
    foodTerms: ["sushi", "omakase"],
    cuisineTerms: ["japanese"],
    categoryTerms: ["sushi restaurant"],
    featureTerms: [],
  },
  ramen: {
    match: ["ramen"],
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
    featureTerms: ["mimosas"],
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
    match: ["cafe", "coffee shop", "coffee", "pastries", "dessert"],
    foodTerms: ["coffee", "pastries", "dessert"],
    cuisineTerms: [],
    categoryTerms: ["cafe", "coffee shop"],
    featureTerms: ["coffee", "dessert", "pastries"],
  },
  bakery: {
    match: ["bakery", "pastries", "cake", "dessert", "coffee"],
    foodTerms: ["pastries", "dessert", "cake", "coffee"],
    cuisineTerms: [],
    categoryTerms: ["bakery", "cafe"],
    featureTerms: ["coffee", "dessert", "pastries"],
  },
  hookah: {
    match: ["hookah", "shisha"],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: ["hookah restaurant", "hookah lounge"],
    featureTerms: ["hookah", "shisha"],
  },
  drinks: {
    match: [
      "drinks",
      "cocktails",
      "beer",
      "wine",
      "margaritas",
      "mimosas",
      "happy hour",
    ],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: ["bar", "lounge"],
    featureTerms: [
      "drinks",
      "cocktails",
      "beer",
      "wine",
      "margaritas",
      "mimosas",
      "happy hour",
    ],
  },
  games: {
    match: ["games", "arcade", "pool", "billiards", "karaoke", "live music"],
    foodTerms: [],
    cuisineTerms: [],
    categoryTerms: [],
    featureTerms: [
      "games",
      "arcade",
      "pool",
      "billiards",
      "karaoke",
      "live music",
    ],
  },
};

const BLOCKED = new Set([
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
const ACTIVITY_ONLY_TERMS = [
  "comedy club",
  "claw arcade",
  "cooking class",
  "event venue",
  "museum",
  "bowling",
  "bowling alley",
  "mini golf",
  "minigolf",
  "axe throwing",
  "escape room",
  "paintball",
  "laser tag",
  "arcade",
];
const ACTIVITY_ONLY_TYPES = new Set([
  "amusement_center",
  "bowling_alley",
  "casino",
  "comedy_club",
  "convention_center",
  "event_venue",
  "golf_course",
  "museum",
  "performing_arts_theater",
  "tourist_attraction",
]);
const FOOD_LIKELY_TYPES = new Set([
  "restaurant",
  "meal_takeaway",
  "meal_delivery",
  "cafe",
  "bakery",
  "bar",
  "pub",
  "night_club",
  "coffee_shop",
]);
const FOOD_LIKELY_TERMS = [
  "restaurant",
  "bar",
  "pub",
  "cafe",
  "coffee",
  "bakery",
  "lounge",
  "pizzeria",
  "pizza",
  "tavern",
  "bistro",
  "eatery",
  "diner",
  "kitchen",
  "brunch",
];
const GENERIC_PROBE_TERMS = new Set([
  "restaurant",
  "bar",
  "pub",
  "cafe",
  "coffee shop",
  "bakery",
  "lounge",
  "nightlife",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const nameOf = (row: any) =>
  row.name || row.restaurant_name || row.activity_name || "";
const addrOf = (row: any) => row.address || row.street_address || "";
const norm = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const clean = (terms: string[]) =>
  Array.from(
    new Set(
      terms
        .map((t) =>
          String(t || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .filter((t) => !BLOCKED.has(t)),
    ),
  );
const has = (haystack: string, term: string) =>
  new RegExp(
    `(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, " ")}(\\W|$)`,
    "i",
  ).test(haystack.replace(/-/g, " "));
const emptyPatch = () => ({
  foodTerms: [],
  cuisineTerms: [],
  categoryTerms: [],
  featureTerms: [],
  searchKeywords: [],
  semanticTags: [],
  intentTags: [],
});

function finalizePatch(patch: any) {
  patch.foodTerms = clean(patch.foodTerms);
  patch.cuisineTerms = clean(patch.cuisineTerms);
  patch.categoryTerms = clean(patch.categoryTerms);
  patch.featureTerms = clean(patch.featureTerms);
  patch.searchKeywords = clean([
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
    ...patch.featureTerms,
  ]);
  patch.semanticTags = clean([
    ...patch.searchKeywords,
    ...(patch.categoryTerms.includes("restaurant") ? ["restaurant"] : []),
  ]);
  patch.intentTags = clean(patch.searchKeywords);
  return patch;
}

function mergePatch(target: any, add: any) {
  target.foodTerms.push(...(add.foodTerms || []));
  target.cuisineTerms.push(...(add.cuisineTerms || []));
  target.categoryTerms.push(...(add.categoryTerms || []));
  target.featureTerms.push(...(add.featureTerms || []));
  return finalizePatch(target);
}

function similarity(a: string, b: string) {
  const left = new Set(norm(a).split(" ").filter(Boolean));
  const right = new Set(norm(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.max(left.size, right.size);
}

function confidence(row: any, place: any) {
  let score = 0;
  const sim = similarity(nameOf(row), place.displayName?.text || "");
  if (sim >= 0.7) score += 35;
  else if (sim >= 0.45) score += 20;
  else score -= 30;
  const localNum = norm(addrOf(row)).match(/\b\d{1,6}\b/)?.[0];
  const googleNum = norm(place.formattedAddress).match(/\b\d{1,6}\b/)?.[0];
  if (localNum && googleNum && localNum === googleNum) score += 25;
  else if (localNum && googleNum) score -= 30;
  if (
    [row.city, row.borough, row.neighborhood]
      .filter(Boolean)
      .some((x) => norm(place.formattedAddress).includes(norm(x)))
  )
    score += 15;
  return Math.max(0, Math.min(100, score));
}

function nameAddressConfidence(row: any, place: any) {
  let score = 0;
  const sim = similarity(nameOf(row), place.displayName?.text || "");
  if (sim >= 0.8) score += 50;
  else if (sim >= 0.6) score += 40;
  else if (sim >= 0.45) score += 25;
  else score -= 40;

  const localAddress = norm(addrOf(row));
  const googleAddress = norm(place.formattedAddress);
  const localNum = localAddress.match(/\b\d{1,6}\b/)?.[0];
  const googleNum = googleAddress.match(/\b\d{1,6}\b/)?.[0];
  if (localNum && googleNum && localNum === googleNum) score += 35;
  else if (localNum && googleNum) score -= 40;

  const localStreetTokens = localAddress
    .split(" ")
    .filter((token) => token.length > 2 && !/^\d+$/.test(token));
  if (localStreetTokens.some((token) => googleAddress.includes(token)))
    score += 15;
  if (
    [row.city, row.borough, row.neighborhood]
      .filter(Boolean)
      .some((x) => googleAddress.includes(norm(x)))
  )
    score += 15;
  return Math.max(0, Math.min(100, score));
}

async function textSearchQuery(
  textQuery: string,
  key: string,
  maxResultCount = 5,
) {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": TEXT_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function textSearch(row: any, key: string) {
  const data = await textSearchQuery(
    `${nameOf(row)} ${addrOf(row)} ${row.city || ""} ${row.state || ""}`.trim(),
    key,
  );
  return (data.places || [])
    .map((place: any) => ({ place, confidence: confidence(row, place) }))
    .sort((a: any, b: any) => b.confidence - a.confidence)[0];
}

async function details(placeId: string, key: string) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_MASK } },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function infer(place: any, row: any) {
  const patch: any = emptyPatch();
  for (const type of [place.primaryType, ...(place.types || [])].filter(
    Boolean,
  )) {
    const terms = TYPE_TERMS[type] || {};
    for (const key of Object.keys(patch))
      patch[key].push(...(terms[key] || []));
  }
  const local = [
    nameOf(row),
    row.cuisine,
    row.primary_category,
    row.search_document,
    ...(row.search_keywords || []),
    ...(row.semantic_tags || []),
    ...(row.intent_tags || []),
  ]
    .filter(Boolean)
    .join(" ");
  const strict = norm(
    `${local} ${place.displayName?.text || ""} ${place.editorialSummary?.text || ""}`,
  );
  const haystack = norm(
    `${strict} ${place.primaryType || ""} ${(place.types || []).join(" ")}`,
  );
  for (const [key, config] of Object.entries(CANONICAL)) {
    if (!(config as any).match.some((term: string) => has(haystack, term)))
      continue;
    if (
      ["wings", "burger", "tacos", "vegan", "halal", "hookah"].includes(key) &&
      !(config as any).match.some((term: string) => has(strict, term))
    )
      continue;
    patch.foodTerms.push(...(config as any).foodTerms);
    patch.cuisineTerms.push(...(config as any).cuisineTerms);
    patch.categoryTerms.push(...(config as any).categoryTerms);
    patch.featureTerms.push(...(config as any).featureTerms);
  }
  return finalizePatch(patch);
}

function hasUsefulFoodSuggestion(suggested: any) {
  return Boolean(
    (suggested.foodTerms || []).length || (suggested.cuisineTerms || []).length,
  );
}

function likelyFoodProbeCandidate(row: any, place: any) {
  const haystack = norm(
    [
      nameOf(row),
      row.primary_category,
      row.search_document,
      ...(row.search_keywords || []),
      ...(row.semantic_tags || []),
      ...(row.intent_tags || []),
      place.displayName?.text,
      place.primaryType,
      ...(place.types || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (ACTIVITY_ONLY_TERMS.some((term) => has(haystack, term))) return false;
  if (
    [place.primaryType, ...(place.types || [])]
      .filter(Boolean)
      .some((type) => ACTIVITY_ONLY_TYPES.has(type)) &&
    !has(haystack, "restaurant") &&
    !has(haystack, "bar") &&
    !has(haystack, "cafe")
  )
    return false;
  if (row.restaurant_name || row.cuisine) return true;
  if (
    [place.primaryType, ...(place.types || [])]
      .filter(Boolean)
      .some((type) => FOOD_LIKELY_TYPES.has(type))
  )
    return true;
  return FOOD_LIKELY_TERMS.some((term) => has(haystack, term));
}

function buildFoodProbeQueries(
  row: any,
  place: any,
  maxFoodProbesPerRow: number,
) {
  const name = nameOf(row) || place.displayName?.text || "";
  const city = row.city || row.borough || row.neighborhood || "";
  const address = addrOf(row) || place.formattedAddress || "";
  const haystack = norm(
    [
      name,
      row.primary_category,
      row.cuisine,
      place.displayName?.text,
      place.primaryType,
      ...(place.types || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  let queries: string[];

  if (has(haystack, "pizza") || has(haystack, "pizzeria")) {
    queries = [
      `${name} ${city} pizza`,
      `${name} ${address} pizzeria`,
      `${name} menu`,
    ];
  } else if (
    has(haystack, "bar") ||
    has(haystack, "pub") ||
    has(haystack, "lounge") ||
    has(haystack, "tavern") ||
    has(haystack, "night club")
  ) {
    queries = [
      `${name} ${city} bar food`,
      `${name} ${city} wings`,
      `${name} ${city} happy hour`,
    ];
  } else if (
    has(haystack, "cafe") ||
    has(haystack, "coffee") ||
    has(haystack, "bakery")
  ) {
    queries = [
      `${name} ${city} coffee`,
      `${name} ${city} pastries`,
      `${name} ${city} dessert`,
    ];
  } else {
    queries = [
      `${name} ${city} cuisine`,
      `${name} ${city} menu`,
      `${name} ${city} restaurant`,
    ];
  }

  return clean(queries).slice(0, maxFoodProbesPerRow);
}

function queryBackedTerms(query: string, candidate: any) {
  const queryNorm = norm(query);
  const patch: any = emptyPatch();
  for (const config of Object.values(CANONICAL)) {
    if (!(config as any).match.some((term: string) => has(queryNorm, term)))
      continue;
    for (const key of [
      "foodTerms",
      "cuisineTerms",
      "categoryTerms",
      "featureTerms",
    ]) {
      patch[key].push(
        ...((config as any)[key] || []).filter((term: string) =>
          has(queryNorm, term),
        ),
      );
    }
  }
  for (const key of [
    "foodTerms",
    "cuisineTerms",
    "categoryTerms",
    "featureTerms",
  ]) {
    patch[key].push(
      ...(candidate[key] || []).filter((term: string) => has(queryNorm, term)),
    );
  }
  return finalizePatch(patch);
}

async function foodProbe(
  row: any,
  place: any,
  key: string,
  maxFoodProbesPerRow: number,
) {
  const debug: any = {
    foodProbeUsed: false,
    foodProbeQueries: [],
    foodProbeMatchedTerms: [],
    foodProbeApiCalls: 0,
    foodProbeSkippedReason: null,
    foodProbeHasStrongSuggestion: false,
  };
  const queries = buildFoodProbeQueries(row, place, maxFoodProbesPerRow);
  if (!queries.length) {
    debug.foodProbeSkippedReason = "no_probe_queries";
    return {
      patch: finalizePatch(emptyPatch()),
      debug,
      hasStrongSuggestion: false,
    };
  }

  const patch: any = emptyPatch();
  for (const query of queries) {
    debug.foodProbeQueries.push(query);
    debug.foodProbeApiCalls++;
    const data = await textSearchQuery(query, key, 3);
    const results = (data.places || []).map((probePlace: any) => ({
      place: probePlace,
      confidence: nameAddressConfidence(row, probePlace),
    }));
    const accepted =
      results.find((result: any) => result.place.id === place.id) ||
      results.find((result: any) => result.confidence >= 85);
    if (!accepted) continue;
    const candidate = infer(accepted.place, row);
    mergePatch(patch, queryBackedTerms(query, candidate));
  }

  debug.foodProbeMatchedTerms = clean([
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
    ...patch.featureTerms,
  ]);
  debug.foodProbeUsed = debug.foodProbeApiCalls > 0;
  if (!debug.foodProbeMatchedTerms.length)
    debug.foodProbeSkippedReason = "no_probe_terms_accepted";
  const strongProbeTerms = clean([
    ...patch.foodTerms,
    ...patch.cuisineTerms,
    ...patch.categoryTerms,
  ]).filter((term) => !GENERIC_PROBE_TERMS.has(term));
  const hasStrongSuggestion = Boolean(strongProbeTerms.length);
  debug.foodProbeHasStrongSuggestion = hasStrongSuggestion;
  return { patch: finalizePatch(patch), debug, hasStrongSuggestion };
}

function merge(existing: unknown, add: string[]) {
  const current = clean(Array.isArray(existing) ? (existing as string[]) : []);
  const set = new Set(current);
  return [...current, ...clean(add).filter((term) => !set.has(term))];
}

function appendDoc(existing: unknown, add: string[]) {
  const text = typeof existing === "string" ? existing : "";
  const lower = ` ${text.toLowerCase()} `;
  return [text, ...clean(add).filter((term) => !lower.includes(term))]
    .join(" ")
    .trim();
}

function weak(row: any) {
  return (
    !Array.isArray(row.search_keywords) ||
    !row.search_keywords.length ||
    !Array.isArray(row.semantic_tags) ||
    !row.semantic_tags.length ||
    !Array.isArray(row.intent_tags) ||
    !row.intent_tags.length
  );
}

serve(async (req) => {
  if (
    req.headers.get("x-cron-secret") !==
      Deno.env.get("GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET") &&
    req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")
  )
    return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const sourceTable = String(body.sourceTable || "locations");
  if (!VALID_TABLES.has(sourceTable))
    return json({ error: "Invalid sourceTable" }, 400);
  const limit = Math.min(100, Math.max(1, Number(body.limit || 25)));
  const dryRun = body.dryRun !== false;
  const applyHigh = Boolean(body.applyHighConfidence);
  const enableFoodProbe = body.enableFoodProbe === true;
  const maxFoodProbesPerRow = Math.min(
    MAX_FOOD_PROBES_PER_ROW,
    Math.max(0, Number(body.maxFoodProbesPerRow ?? MAX_FOOD_PROBES_PER_ROW)),
  );
  const foodProbeAllowedByBatch = dryRun || limit <= 25;
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || !url || !service)
    return json({ error: "Missing environment" }, 500);
  const supabase = createClient(url, service);
  const counters: any = {
    scanned: 0,
    matched: 0,
    no_match: 0,
    suggestions_created: 0,
    auto_applied: 0,
    failed: 0,
    estimated_api_calls: 0,
    estimatedApiCalls: 0,
    food_probe_api_calls: 0,
  };
  const { data: rows, error } = await supabase
    .from(sourceTable)
    .select("*")
    .limit(limit * 3);
  if (error) return json({ error: error.message }, 400);
  const eligible = (rows || [])
    .filter((row: any) => !body.onlyMissingPlaceId || !row.google_place_id)
    .filter((row: any) => !body.onlyWeakSearchTerms || weak(row))
    .slice(0, limit);
  for (const row of eligible) {
    counters.scanned++;
    try {
      let placeId = row.google_place_id;
      if (!placeId) {
        counters.estimated_api_calls++;
        const match = await textSearch(row, key);
        if (!match || match.confidence < 55) {
          counters.no_match++;
          if (!dryRun)
            await supabase
              .from(sourceTable)
              .update({
                google_enrichment_status: "no_match",
                google_last_error: "No Google match above confidence threshold",
              })
              .eq("id", row.id);
          continue;
        }
        placeId = match.place.id;
      }
      counters.estimated_api_calls++;
      const place = await details(placeId, key);
      const matchConfidence = confidence(row, place);
      if (matchConfidence < 55) {
        counters.no_match++;
        continue;
      }
      counters.matched++;
      const suggested = infer(place, row);
      let probeDebug: any = {
        foodProbeUsed: false,
        foodProbeQueries: [],
        foodProbeMatchedTerms: [],
        foodProbeApiCalls: 0,
        foodProbeSkippedReason: null,
        foodProbeHasStrongSuggestion: false,
      };
      let probeContributedStrongSuggestion = false;

      if (!enableFoodProbe) probeDebug.foodProbeSkippedReason = "disabled";
      else if (!foodProbeAllowedByBatch)
        probeDebug.foodProbeSkippedReason =
          "batch_limit_over_25_without_dry_run";
      else if (!maxFoodProbesPerRow)
        probeDebug.foodProbeSkippedReason = "max_food_probes_per_row_zero";
      else if (hasUsefulFoodSuggestion(suggested))
        probeDebug.foodProbeSkippedReason =
          "normal_result_has_useful_food_terms";
      else if (!likelyFoodProbeCandidate(row, place))
        probeDebug.foodProbeSkippedReason = "not_likely_food_record";
      else {
        const probe = await foodProbe(row, place, key, maxFoodProbesPerRow);
        probeDebug = probe.debug;
        probeContributedStrongSuggestion = probe.hasStrongSuggestion;
        counters.estimated_api_calls += probeDebug.foodProbeApiCalls;
        counters.food_probe_api_calls += probeDebug.foodProbeApiCalls;
        mergePatch(suggested, probe.patch);
      }

      const canAutoApply =
        !dryRun &&
        applyHigh &&
        (probeDebug.foodProbeUsed
          ? matchConfidence >= 90 && probeContributedStrongSuggestion
          : matchConfidence >= 85);
      const suggestionStatus = canAutoApply
        ? "auto_applied"
        : probeDebug.foodProbeUsed
          ? "pending_review"
          : matchConfidence >= 85
            ? "pending"
            : "pending_review";
      const suggestion = {
        source_table: sourceTable,
        source_id: row.id,
        google_place_id: place.id,
        location_name: nameOf(row),
        google_display_name: place.displayName?.text || null,
        match_confidence: matchConfidence,
        suggested_food_terms: suggested.foodTerms,
        suggested_cuisine_terms: suggested.cuisineTerms,
        suggested_category_terms: suggested.categoryTerms,
        suggested_feature_terms: suggested.featureTerms,
        suggested_search_keywords: suggested.searchKeywords,
        suggested_semantic_tags: suggested.semanticTags,
        suggested_intent_tags: suggested.intentTags,
        google_types: place.types || [],
        google_primary_type: place.primaryType || null,
        evidence: {
          googleFormattedAddress: place.formattedAddress || null,
          googleTypes: place.types || [],
          ...probeDebug,
        },
        status: suggestionStatus,
      };
      const { data: inserted, error: insertError } = await supabase
        .from("location_google_food_term_suggestions")
        .insert(suggestion)
        .select("id")
        .single();
      if (insertError) throw insertError;
      counters.suggestions_created++;
      if (canAutoApply) {
        const all = clean([
          ...suggested.foodTerms,
          ...suggested.cuisineTerms,
          ...suggested.categoryTerms,
          ...suggested.featureTerms,
          ...suggested.searchKeywords,
        ]);
        await supabase
          .from(sourceTable)
          .update({
            search_keywords: merge(
              row.search_keywords,
              suggested.searchKeywords,
            ),
            semantic_tags: merge(row.semantic_tags, suggested.semanticTags),
            intent_tags: merge(row.intent_tags, suggested.intentTags),
            search_document: appendDoc(row.search_document, all),
            google_place_id: place.id,
            google_enrichment_status: "auto_applied",
            google_enriched_at: new Date().toISOString(),
            google_primary_type: place.primaryType || null,
            google_types: place.types || [],
            google_maps_uri: place.googleMapsUri || null,
            google_website_uri: place.websiteUri || null,
            google_rating: place.rating || null,
            google_user_rating_count: place.userRatingCount || null,
            google_last_error: null,
          })
          .eq("id", row.id);
        await supabase
          .from("location_google_food_term_suggestions")
          .update({ applied_at: new Date().toISOString() })
          .eq("id", inserted.id);
        counters.auto_applied++;
      }
    } catch (error) {
      counters.failed++;
      if (!dryRun)
        await supabase
          .from(sourceTable)
          .update({
            google_enrichment_status: "failed",
            google_last_error:
              error instanceof Error ? error.message : String(error),
          })
          .eq("id", row.id);
    }
  }
  counters.estimatedApiCalls = counters.estimated_api_calls;
  return json(counters);
});
