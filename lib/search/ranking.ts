import {
  scoreCuisineCategoryMatch,
  detectRequestedCuisines,
} from "./cuisine-matching";
import { scoreGeoMatch } from "./geo-matching";
import type { CanonicalSearchIntent } from "./types";
import { evaluateSoftHours } from "./hours";
import { calculateIntentReviewFit } from "../ml/reviewIntelligence";

function scoreRecord(record: any, terms: string[]) {
  const text = [
    record.name,
    record.restaurant_name,
    record.activity_name,
    record.description,
    record.primary_category,
    record.cuisine,
    record.cuisine_type,
    record.food_type,
    record.activity_type,
    record.primary_tag,
    record.borough,
    record.city,
    record.neighborhood,
    record.search_document,
    record.semantic_search_text,
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(record.search_keywords) ? record.search_keywords : []),
    ...(Array.isArray(record.intent_tags) ? record.intent_tags : []),
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  return terms.reduce((acc, term) => {
    const t = String(term ?? "")
      .toLowerCase()
      .replaceAll("_", " ");
    return acc + (text.includes(t) ? 10 : 0);
  }, 0);
}

function sameVenueScore(record: any, intent: CanonicalSearchIntent) {
  if (!intent.normalizedIntent?.sameVenuePreferred) return 0;

  const primaryTerms = [
    ...(intent.normalizedIntent.restaurantTerms ?? []),
    ...(intent.normalizedIntent.cuisineTerms ?? []),
    ...(intent.normalizedIntent.mealTerms ?? []),
  ].filter((term) => !(intent.normalizedIntent?.attributeTerms ?? []).includes(term));

  const attributeTerms = intent.normalizedIntent.attributeTerms ?? [];

  const nameText = [record.name, record.restaurant_name, record.activity_name]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  const allText = [
    nameText,
    record.description,
    record.short_description,
    record.primary_category,
    record.category,
    record.subcategory,
    record.cuisine,
    record.cuisine_type,
    record.location_type,
    record.search_document,
    record.semantic_search_text,
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(record.vibe_tags) ? record.vibe_tags : []),
    ...(Array.isArray(record.amenities) ? record.amenities : []),
    ...(Array.isArray(record.search_keywords) ? record.search_keywords : []),
    ...(Array.isArray(record.intent_tags) ? record.intent_tags : []),
  ]
    .map((v) => String(v ?? "").toLowerCase().replaceAll("_", " "))
    .join(" ");

  const primaryMatch = primaryTerms.some((term) =>
    allText.includes(String(term).replaceAll("_", " ")),
  );
  const secondaryMatch = attributeTerms.some((term) =>
    allText.includes(String(term).replaceAll("_", " ")),
  );
  const namePrimary = primaryTerms.some((term) =>
    nameText.includes(String(term).replaceAll("_", " ")),
  );
  const nameSecondary = attributeTerms.some((term) =>
    nameText.includes(String(term).replaceAll("_", " ")),
  );

  return (
    (primaryMatch && secondaryMatch ? 150 : 0) +
    (namePrimary && nameSecondary ? 150 : 0) +
    (primaryMatch ? 25 : 0) +
    (secondaryMatch ? 50 : 0)
  );
}

function reviewKeywordScore(record: any, intent: CanonicalSearchIntent) {
  const query = [
    intent.rawQuery,
    intent.normalizedQuery,
    ...(intent.vibes ?? []),
    ...(intent.normalizedIntent?.vibeTerms ?? []),
    ...(intent.normalizedIntent?.activityTerms ?? []),
    ...(intent.normalizedIntent?.restaurantTerms ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const keywords = (Array.isArray(record?.review_keywords)
    ? record.review_keywords
    : []
  ).map((v: unknown) => String(v).toLowerCase());

  const hay = keywords.join(" ");
  let score = Math.min(20, Math.max(0, Number(record?.review_score || 0)) / 5);

  const wantsQuiet = /quiet|conversation|chill|low key|no club/.test(query);
  const wantsSports = /sports|watch|game|tv/.test(query);
  const wantsRooftop = /rooftop|terrace|skyline|views/.test(query);
  const wantsHookah = /hookah|shisha/.test(query);
  const wantsRomantic = /romantic|date/.test(query);

  if (wantsQuiet && /quiet|conversation|low key|chill/.test(hay)) score += 18;
  if (wantsQuiet && /loud|club|dance floor|dj/.test(hay)) score -= 20;
  if (wantsSports && /tv|big screen|watch party|sports bar|game day|sports/.test(hay)) score += 18;
  if (wantsRooftop && /rooftop|terrace|skyline|views/.test(hay)) score += 16;
  if (wantsHookah && /hookah|shisha/.test(hay)) score += 16;
  if (wantsRomantic && /romantic|date night|cozy|intimate/.test(hay)) score += 16;

  return score;
}

function isRestaurantLike(record: any) {
  const hay = [
    record?.source_table,
    record?.location_type,
    record?.primary_category,
    record?.cuisine,
    record?.cuisine_type,
    record?.restaurant_name,
    record?.search_document,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  return Boolean(
    record?.restaurant_name ||
      record?.cuisine ||
      record?.cuisine_type ||
      [
        "restaurant",
        "food",
        "dining",
        "steakhouse",
        "seafood",
        "italian",
        "sushi",
        "caribbean",
        "brunch",
        "cafe",
      ].some((t) => hay.includes(t)),
  );
}

const CURATED_CHAIN_TERMS = [
  "romantic",
  "date night",
  "anniversary",
  "birthday",
  "upscale",
  "rooftop",
  "steak",
  "seafood",
  "cocktails",
  "lounge",
  "fine dining",
  "group night",
  "dinner date",
  "experience",
];

const UTILITY_CHAIN_TERMS = [
  "coffee",
  "quick bite",
  "fast food",
  "cheap eats",
  "casual",
  "near me",
  "open now",
  "breakfast",
  "grab and go",
];

function isCuratedChainIntent(intent: CanonicalSearchIntent) {
  const hay = [
    intent.rawQuery,
    intent.normalizedQuery,
    intent.restaurantSearchInput,
    ...(intent.vibes ?? []),
    ...(intent.mealFoodIntents ?? []),
    ...(intent.cuisines ?? []),
    ...(intent.normalizedIntent?.vibeTerms ?? []),
    ...(intent.normalizedIntent?.restaurantTerms ?? []),
    ...(intent.normalizedIntent?.cuisineTerms ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");

  return (
    CURATED_CHAIN_TERMS.some((term) => hay.includes(term)) &&
    !UTILITY_CHAIN_TERMS.some((term) => hay.includes(term))
  );
}

function chainRankPenalty(record: any, intent: CanonicalSearchIntent) {
  if (!isCuratedChainIntent(intent)) return 0;

  const isChain =
    record?.is_chain === true ||
    String(record?.brand_type || "").toLowerCase() === "chain" ||
    String(record?.curation_tier || "").toLowerCase() === "utility";

  return isChain ? 500 : 0;
}

function scoreRooftopRestaurantMatch(
  record: any,
  intent: CanonicalSearchIntent,
) {
  const wantsRooftop =
    intent.vibes?.includes("rooftop") ||
    String(intent.normalizedQuery ?? "").toLowerCase().includes("rooftop") ||
    String(intent.rawQuery ?? "").toLowerCase().includes("rooftop");

  if (!wantsRooftop) return 0;

  const hay = [
    record.name,
    record.restaurant_name,
    record.description,
    record.primary_category,
    record.cuisine,
    record.cuisine_type,
    record.food_type,
    record.activity_type,
    record.primary_tag,
    record.borough,
    record.city,
    record.neighborhood,
    record.search_document,
    record.semantic_search_text,
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(record.vibe_tags) ? record.vibe_tags : []),
    ...(Array.isArray(record.best_for_tags) ? record.best_for_tags : []),
    ...(Array.isArray(record.search_keywords) ? record.search_keywords : []),
    ...(Array.isArray(record.intent_tags) ? record.intent_tags : []),
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  let score = 0;

  if (hay.includes("rooftop") || hay.includes("roof top")) score += 120;
  if (hay.includes("terrace")) score += 75;
  if (hay.includes("outdoor dining")) score += 65;
  if (hay.includes("skyline")) score += 65;
  if (hay.includes("patio")) score += 45;
  if (hay.includes("views") || hay.includes("view")) score += 45;
  if (hay.includes("romantic")) score += 35;
  if (hay.includes("date night")) score += 30;
  if (hay.includes("scenic")) score += 25;

  return score;
}

function foodForwardRestaurantIntent(intent: CanonicalSearchIntent) {
  const hay = [
    intent.rawQuery,
    intent.normalizedQuery,
    intent.restaurantSearchInput,
    ...(intent.mealFoodIntents ?? []),
    ...(intent.specificMealFoodIntents ?? []),
    ...(intent.cuisines ?? []),
    ...(intent.normalizedIntent?.restaurantTerms ?? []),
    ...(intent.normalizedIntent?.cuisineTerms ?? []),
    ...(intent.normalizedIntent?.mealTerms ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");

  return /\b(lunch|dinner|brunch|breakfast|food|restaurant|dining|eat|chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|steak|pasta|ramen|bbq|barbecue)\b/.test(
    hay,
  );
}

function foodRestaurantStrength(record: any) {
  const hay = [
    record?.restaurant_name,
    record?.business_name,
    record?.name,
    record?.description,
    record?.short_description,
    record?.primary_category,
    record?.category,
    record?.cuisine,
    record?.cuisine_type,
    record?.food_type,
    record?.primary_tag,
    record?.search_document,
    record?.semantic_search_text,
    ...(Array.isArray(record?.tags) ? record.tags : []),
    ...(Array.isArray(record?.search_keywords) ? record.search_keywords : []),
    ...(Array.isArray(record?.intent_tags) ? record.intent_tags : []),
  ]
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");

  let score = 0;

  if (record?.restaurant_name) score += 80;
  if (record?.food_type) score += 55;
  if (record?.menu_url) score += 35;

  if (
    /\b(restaurant|dining|food|kitchen|menu|grill|bar and grill|bar & grill|gastropub|pub|tavern)\b/.test(
      hay,
    )
  ) {
    score += 35;
  }

  if (
    /\b(chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|steak|pasta|ramen|bbq|barbecue|brunch|lunch|dinner)\b/.test(
      hay,
    )
  ) {
    score += 45;
  }

  return score;
}

function weakNightlifeRestaurantFallbackPenalty(
  record: any,
  intent: CanonicalSearchIntent,
) {
  if (!foodForwardRestaurantIntent(intent)) return 0;

  const hay = [
    record?.location_type,
    record?.source_table,
    record?.type,
    record?.primary_category,
    record?.category,
    record?.activity_type,
    record?.primary_tag,
    record?.cuisine,
    record?.cuisine_type,
    record?.search_document,
    record?.semantic_search_text,
    ...(Array.isArray(record?.tags) ? record.tags : []),
    ...(Array.isArray(record?.search_keywords) ? record.search_keywords : []),
    ...(Array.isArray(record?.intent_tags) ? record.intent_tags : []),
  ]
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");

  const isActivityRecord =
    /\b(activity|activities)\b/.test(
      String(record?.location_type ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String(record?.source_table ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String(record?.type ?? "").toLowerCase(),
    );

  const isNightlifeTyped =
    /\b(nightlife|hookah|shisha|lounge|club|nightclub|night club|cigar|karaoke|speakeasy)\b/.test(
      hay,
    );

  if (!isActivityRecord && !isNightlifeTyped) return 0;

  const hasRealRestaurantIdentity = Boolean(
    record?.restaurant_name ||
      record?.food_type ||
      record?.menu_url ||
      String(record?.primary_category ?? "").toLowerCase().includes("restaurant"),
  );

  const hasSpecificFoodMatch =
    /\b(chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|steak|pasta|ramen|bbq|barbecue)\b/.test(
      hay,
    );

  if (hasRealRestaurantIdentity && hasSpecificFoodMatch) return -25;
  if (hasRealRestaurantIdentity) return -75;

  if (isActivityRecord && isNightlifeTyped) return -260;
  if (isActivityRecord) return -180;
  if (isNightlifeTyped) return -140;

  return 0;
}

export function rankRestaurants(records: any[], intent: CanonicalSearchIntent) {
  const query =
    intent.restaurantSearchInput ||
    [
      ...(intent.normalizedIntent?.restaurantTerms ?? []),
      ...(intent.normalizedIntent?.cuisineTerms ?? []),
      ...(intent.normalizedIntent?.mealTerms ?? []),
      ...intent.cuisines,
      ...intent.mealFoodIntents,
    ].join(" ") ||
    intent.normalizedQuery ||
    intent.rawQuery ||
    "";

  const requested = detectRequestedCuisines(query);

  const explicitGeo = Boolean(
    intent.geoIntent || intent.borough || intent.neighborhood || intent.city,
  );

  const geoWeight = explicitGeo ? 4 : 1;
  const foodForwardIntent = foodForwardRestaurantIntent(intent);

  return [...records].sort((a, b) => {
    const strictTerms = [
      ...(intent.normalizedIntent?.cuisineTerms ?? []),
      ...(intent.specificMealFoodIntents?.length
        ? intent.specificMealFoodIntents
        : intent.mealFoodIntents),
    ]
      .filter((term, index, arr) => arr.indexOf(term) === index)
      .filter(
        (term) =>
          ![
            "dinner",
            "lunch",
            "breakfast",
            "brunch",
            "restaurant",
            "food",
            "eat",
            "dining",
          ].includes(term),
      );

    const restaurantVibes = (
      intent.normalizedIntent?.vibeTerms ?? intent.vibes
    ).filter((term) => term !== "nightlife");

    let as =
      scoreRecord(a, strictTerms) +
      scoreRecord(a, intent.cuisines) +
      scoreRecord(a, intent.boroughs) +
      scoreRecord(a, restaurantVibes);

    let bs =
      scoreRecord(b, strictTerms) +
      scoreRecord(b, intent.cuisines) +
      scoreRecord(b, intent.boroughs) +
      scoreRecord(b, restaurantVibes);

    if (strictTerms.length > 0) {
      if (`${a.category ?? ""}`.toLowerCase().includes("hookah")) as -= 10;
      if (`${b.category ?? ""}`.toLowerCase().includes("hookah")) bs -= 10;
    }

    const steakStrict =
      strictTerms.includes("steak") || strictTerms.includes("steakhouse");

    if (steakStrict) {
      const ah = [
        a.name,
        a.restaurant_name,
        a.activity_name,
        a.description,
        a.primary_category,
        a.cuisine,
        a.cuisine_type,
        a.food_type,
        a.activity_type,
        a.primary_tag,
        a.search_document,
        a.semantic_search_text,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      const bh = [
        b.name,
        b.restaurant_name,
        b.activity_name,
        b.description,
        b.primary_category,
        b.cuisine,
        b.cuisine_type,
        b.food_type,
        b.activity_type,
        b.primary_tag,
        b.search_document,
        b.semantic_search_text,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");

      if (!ah.includes("steak") && !ah.includes("steakhouse")) as -= 100;
      if (!bh.includes("steak") && !bh.includes("steakhouse")) bs -= 100;

      if (ah.includes("churrasco") || ah.includes("brazilian steakhouse"))
        as += 25;
      if (bh.includes("churrasco") || bh.includes("brazilian steakhouse"))
        bs += 25;

      if (
        ["bakery", "cafe", "coffee", "dessert", "bar"].some((t) =>
          ah.includes(t),
        )
      )
        as -= 50;

      if (
        ["bakery", "cafe", "coffee", "dessert", "bar"].some((t) =>
          bh.includes(t),
        )
      )
        bs -= 50;

      if (
        ["activity", "nightlife", "event", "hookah lounge", "lounge only"].some(
          (t) => ah.includes(t),
        )
      )
        as -= 120;

      if (
        ["activity", "nightlife", "event", "hookah lounge", "lounge only"].some(
          (t) => bh.includes(t),
        )
      )
        bs -= 120;
    }

    const ad = scoreCuisineCategoryMatch(a, query, true);
    const bd = scoreCuisineCategoryMatch(b, query, true);

    const aGeo = scoreGeoMatch(a, intent.geoIntent);
    const bGeo = scoreGeoMatch(b, intent.geoIntent);

    const aType = isRestaurantLike(a) ? 25 : -25;
    const bType = isRestaurantLike(b) ? 25 : -25;

    as = ad.score * 3 + aType * 2 + aGeo * geoWeight + as;
    bs = bd.score * 3 + bType * 2 + bGeo * geoWeight + bs;

    const aRooftop = scoreRooftopRestaurantMatch(a, intent);
    const bRooftop = scoreRooftopRestaurantMatch(b, intent);

    as += aRooftop;
    bs += bRooftop;

    as -= chainRankPenalty(a, intent);
    bs -= chainRankPenalty(b, intent);

    as +=
      reviewKeywordScore(a, intent) +
      calculateIntentReviewFit(
        intent,
        a.review_ml_features ||
          a.reviewMlFeatures ||
          a.location_review_ml_features,
      );

    bs +=
      reviewKeywordScore(b, intent) +
      calculateIntentReviewFit(
        intent,
        b.review_ml_features ||
          b.reviewMlFeatures ||
          b.location_review_ml_features,
      );

    as += sameVenueScore(a, intent);
    bs += sameVenueScore(b, intent);

    const aHours = evaluateSoftHours(a, intent);
    const bHours = evaluateSoftHours(b, intent);

    as += aHours.boost;
    bs += bHours.boost;

    as += Number(a.search_boost ?? 0);
    bs += Number(b.search_boost ?? 0);

    if (foodForwardIntent) {
      as += foodRestaurantStrength(a);
      bs += foodRestaurantStrength(b);

      as += weakNightlifeRestaurantFallbackPenalty(a, intent);
      bs += weakNightlifeRestaurantFallbackPenalty(b, intent);
    }

    const ah = JSON.stringify(a).toLowerCase();
    const bh = JSON.stringify(b).toLowerCase();

    if (requested.length > 0) {
      if (ah.includes("activity") || ah.includes("event")) as -= 100;
      if (bh.includes("activity") || bh.includes("event")) bs -= 100;
    }

    return bs - as;
  });
}

export function rankActivities(records: any[], intent: CanonicalSearchIntent) {
  const explicitGeo = Boolean(
    intent.geoIntent || intent.borough || intent.neighborhood || intent.city,
  );

  const geoWeight = explicitGeo ? 4 : 1;

  return [...records].sort((a, b) => {
    const activityTerms =
      intent.normalizedIntent?.activityTerms ?? intent.activityIntents;

    const aHours = evaluateSoftHours(a, intent);
    const bHours = evaluateSoftHours(b, intent);

    const aScore =
      scoreRecord(a, activityTerms) +
      scoreGeoMatch(a, intent.geoIntent) * geoWeight +
      reviewKeywordScore(a, intent) +
      calculateIntentReviewFit(
        intent,
        a.review_ml_features ||
          a.reviewMlFeatures ||
          a.location_review_ml_features,
      ) +
      aHours.boost;

    const bScore =
      scoreRecord(b, activityTerms) +
      scoreGeoMatch(b, intent.geoIntent) * geoWeight +
      reviewKeywordScore(b, intent) +
      calculateIntentReviewFit(
        intent,
        b.review_ml_features ||
          b.reviewMlFeatures ||
          b.location_review_ml_features,
      ) +
      bHours.boost;

    return bScore - aScore;
  });
}