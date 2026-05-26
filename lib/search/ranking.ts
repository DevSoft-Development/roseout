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
    const t = String(term ?? "").toLowerCase();
    return acc + (text.includes(t) ? 5 : 0);
  }, 0);
}

export function rankRestaurants(records: any[], intent: CanonicalSearchIntent) {
  return [...records].sort((a, b) => {
    const mealTerms = intent.mealFoodIntents;
    let as = scoreRecord(a, mealTerms) + scoreRecord(a, intent.cuisines) + scoreRecord(a, intent.boroughs);
    let bs = scoreRecord(b, mealTerms) + scoreRecord(b, intent.cuisines) + scoreRecord(b, intent.boroughs);
    if (mealTerms.length > 0) {
      if (`${a.category ?? ""}`.toLowerCase().includes("hookah")) as -= 10;
      if (`${b.category ?? ""}`.toLowerCase().includes("hookah")) bs -= 10;
    }
    return bs - as;
  });
}

export function rankActivities(records: any[], intent: CanonicalSearchIntent) {
  return [...records].sort((a, b) => scoreRecord(b, intent.activityIntents) - scoreRecord(a, intent.activityIntents));
}
