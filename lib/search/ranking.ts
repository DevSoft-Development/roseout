import type { CanonicalSearchIntent } from "./types";

function scoreText(record: any, tokens: string[]) {
  const hay = `${record?.name || ""} ${record?.description || ""} ${record?.category || ""}`.toLowerCase();
  return tokens.reduce((a, t) => a + (hay.includes(t) ? 10 : 0), 0);
}

export function rankRestaurants(records: any[], intent: CanonicalSearchIntent) {
  return [...records].map((r) => {
    let s = scoreText(r, intent.mealFoodIntents.concat(intent.cuisines, intent.locations));
    if (intent.mealFoodIntents.length && /hookah|lounge/.test(`${r?.name} ${r?.description}`.toLowerCase())) s -= 20;
    return { ...r, _score: s };
  }).sort((a, b) => b._score - a._score);
}

export function rankActivities(records: any[], intent: CanonicalSearchIntent) {
  return [...records].map((r) => ({ ...r, _score: scoreText(r, intent.activityIntents.concat(intent.locations)) }))
    .filter((r) => !(intent.addOnFoodIntents.includes("dessert") && !intent.activityIntents.length))
    .sort((a, b) => b._score - a._score);
}
