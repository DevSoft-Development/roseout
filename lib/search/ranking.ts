import { scoreCuisineCategoryMatch, detectRequestedCuisines } from "./cuisine-matching";
import { scoreGeoMatch } from "./geo-matching";
import type { CanonicalSearchIntent } from "./types";

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
    const t = String(term ?? "").toLowerCase().replaceAll("_", " ");
    return acc + (text.includes(t) ? 10 : 0);
  }, 0);
}

function isRestaurantLike(record: any) {
  const hay = [record?.source_table, record?.location_type, record?.primary_category, record?.cuisine, record?.cuisine_type, record?.restaurant_name, record?.search_document].map((v) => String(v ?? "").toLowerCase()).join(" ");
  return Boolean(record?.restaurant_name || record?.cuisine || record?.cuisine_type || ["restaurant", "food", "dining", "steakhouse", "seafood", "italian", "sushi", "caribbean", "brunch", "cafe"].some((t) => hay.includes(t)));
}

function scoreRooftopRestaurantMatch(record: any, intent: CanonicalSearchIntent) {
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

export function rankRestaurants(records: any[], intent: CanonicalSearchIntent) {
  const query = intent.normalizedQuery || intent.rawQuery || "";
  const requested = detectRequestedCuisines(query);
  const explicitGeo = Boolean(intent.geoIntent || intent.borough || intent.neighborhood || intent.city);
  const geoWeight = explicitGeo ? 4 : 1;
  return [...records].sort((a, b) => {
    const strictTerms = intent.specificMealFoodIntents?.length
      ? intent.specificMealFoodIntents
      : intent.mealFoodIntents.filter((term) => !["dinner", "lunch", "breakfast", "brunch", "restaurant", "food", "eat", "dining"].includes(term));
    let as = scoreRecord(a, strictTerms) + scoreRecord(a, intent.cuisines) + scoreRecord(a, intent.boroughs) + scoreRecord(a, intent.vibes);
    let bs = scoreRecord(b, strictTerms) + scoreRecord(b, intent.cuisines) + scoreRecord(b, intent.boroughs) + scoreRecord(b, intent.vibes);
    if (strictTerms.length > 0) {
      if (`${a.category ?? ""}`.toLowerCase().includes("hookah")) as -= 10;
      if (`${b.category ?? ""}`.toLowerCase().includes("hookah")) bs -= 10;
    }

    const steakStrict = strictTerms.includes("steak") || strictTerms.includes("steakhouse");
    if (steakStrict) {
      const ah = [a.name, a.restaurant_name, a.activity_name, a.description, a.primary_category, a.cuisine, a.cuisine_type, a.food_type, a.activity_type, a.primary_tag, a.search_document, a.semantic_search_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
      const bh = [b.name, b.restaurant_name, b.activity_name, b.description, b.primary_category, b.cuisine, b.cuisine_type, b.food_type, b.activity_type, b.primary_tag, b.search_document, b.semantic_search_text].map((v) => String(v ?? "").toLowerCase()).join(" ");
      if (!ah.includes("steak") && !ah.includes("steakhouse")) as -= 100;
      if (!bh.includes("steak") && !bh.includes("steakhouse")) bs -= 100;
      if (ah.includes("churrasco") || ah.includes("brazilian steakhouse")) as += 25;
      if (bh.includes("churrasco") || bh.includes("brazilian steakhouse")) bs += 25;
      if (["bakery", "cafe", "coffee", "dessert", "bar"].some((t) => ah.includes(t))) as -= 50;
      if (["bakery", "cafe", "coffee", "dessert", "bar"].some((t) => bh.includes(t))) bs -= 50;
      if (["activity", "nightlife", "event", "hookah lounge", "lounge only"].some((t) => ah.includes(t))) as -= 120;
      if (["activity", "nightlife", "event", "hookah lounge", "lounge only"].some((t) => bh.includes(t))) bs -= 120;
    }

    const ad = scoreCuisineCategoryMatch(a, query, true);
    const bd = scoreCuisineCategoryMatch(b, query, true);
    const aGeo = scoreGeoMatch(a, intent.geoIntent);
    const bGeo = scoreGeoMatch(b, intent.geoIntent);
    const aType = isRestaurantLike(a) ? 25 : -25;
    const bType = isRestaurantLike(b) ? 25 : -25;
    as = (ad.score * 3) + (aType * 2) + (aGeo * geoWeight) + as;
    bs = (bd.score * 3) + (bType * 2) + (bGeo * geoWeight) + bs;
    const aRooftop = scoreRooftopRestaurantMatch(a, intent);
    const bRooftop = scoreRooftopRestaurantMatch(b, intent);
    as += aRooftop;
    bs += bRooftop;
    const ah = JSON.stringify(a).toLowerCase(); const bh = JSON.stringify(b).toLowerCase();
    if (requested.length>0) { if (ah.includes("activity") || ah.includes("event")) as -= 100; if (bh.includes("activity")||bh.includes("event")) bs -= 100; }
    return bs - as;
  });
}

export function rankActivities(records: any[], intent: CanonicalSearchIntent) {
  const explicitGeo = Boolean(intent.geoIntent || intent.borough || intent.neighborhood || intent.city);
  const geoWeight = explicitGeo ? 4 : 1;

  return [...records].sort((a, b) => {
    const aScore = scoreRecord(a, intent.activityIntents) + scoreGeoMatch(a, intent.geoIntent) * geoWeight;
    const bScore = scoreRecord(b, intent.activityIntents) + scoreGeoMatch(b, intent.geoIntent) * geoWeight;
    return bScore - aScore;
  });
}
