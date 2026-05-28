import { scoreCuisineCategoryMatch, detectRequestedCuisines } from "@/lib/search/cuisine-matching";
import type { CanonicalSearchIntent } from "@/lib/search/types";

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

export function rankRestaurants(records: any[], intent: CanonicalSearchIntent) {
  const query = intent.normalizedQuery || intent.rawQuery || "";
  const requested = detectRequestedCuisines(query);
  return [...records].sort((a, b) => {
    const strictTerms = intent.specificMealFoodIntents?.length
      ? intent.specificMealFoodIntents
      : intent.mealFoodIntents.filter((term) => !["dinner", "lunch", "breakfast", "brunch", "restaurant", "food", "eat", "dining"].includes(term));
    let as = scoreRecord(a, strictTerms) + scoreRecord(a, intent.cuisines) + scoreRecord(a, intent.boroughs);
    let bs = scoreRecord(b, strictTerms) + scoreRecord(b, intent.cuisines) + scoreRecord(b, intent.boroughs);
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
    as += ad.score; bs += bd.score;
    const ah = JSON.stringify(a).toLowerCase(); const bh = JSON.stringify(b).toLowerCase();
    if (requested.length>0) { if (ah.includes("activity") || ah.includes("event")) as -= 100; if (bh.includes("activity")||bh.includes("event")) bs -= 100; }
    return bs - as;
  });
}

export function rankActivities(records: any[], intent: CanonicalSearchIntent) {
  return [...records].sort((a, b) => scoreRecord(b, intent.activityIntents) - scoreRecord(a, intent.activityIntents));
}
