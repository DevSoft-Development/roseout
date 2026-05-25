import type { CanonicalSearchIntent } from "@/lib/search/types";

function scoreRecord(record: any, terms: string[]) {
  const text = `${record.name ?? ""} ${record.description ?? ""} ${record.cuisine ?? ""} ${record.category ?? ""}`.toLowerCase();
  return terms.reduce((acc, term) => acc + (text.includes(term) ? 5 : 0), 0);
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
