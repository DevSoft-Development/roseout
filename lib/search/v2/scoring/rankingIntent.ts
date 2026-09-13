import type { SearchPlan } from "../planner/searchPlanTypes";

export type QualityIntent = {
  overall: boolean;
  rating: boolean;
  popularity: boolean;
};

export function userAuthoredQuery(rawQuery: string) {
  return String(rawQuery ?? "")
    .split(/\blocation\s*:/i)[0]
    .replace(/^\s*plan\s+(?:a|an)\s+(?:restaurant\s+only|activity\s+only|restaurant\s+and\s+activity\s+outing)\s*[.:\-]?\s*/i, "")
    .replace(/\breturn\s+the\s+best\s+options(?:,)?\s+ranked\s+by\s+fit\.?\s*$/i, "")
    .trim();
}

export function detectQualityIntent(rawQuery: string): QualityIntent {
  const query = userAuthoredQuery(rawQuery).toLowerCase();
  const rating = /\b(highly rated|top rated|best rated|highest rated|great reviews?|excellent reviews?|well reviewed|strong reviews?|rating|ratings)\b/.test(query);
  const popularity = /\b(most popular|very popular|popular|lots? of reviews?|many reviews?|thousands? of reviews?|hundreds? of reviews?|well known|well-known)\b/.test(query);
  const overall = rating || popularity || /\b(best|top|highly recommended|most recommended|recommended|greatest)\b/.test(query);
  return { overall, rating, popularity };
}

export function detectDistanceIntent(plan: SearchPlan) {
  if (plan.travel.explicit || plan.travel.constraint !== "none") return true;
  const query = userAuthoredQuery(plan.rawQuery).toLowerCase();
  return /\b(near me|nearby|nearest|closest|close by|close to|walking distance|walkable|walk to|walking|within\s+\d+(?:\.\d+)?\s*(?:miles?|mi|minutes?|mins?)|distance|not far|short walk|short drive)\b/.test(query);
}

export function detectBookingIntent(rawQuery: string) {
  const query = userAuthoredQuery(rawQuery).toLowerCase();
  return /\b(book|booking|reserve|reservation|reservations)\b/.test(query);
}
