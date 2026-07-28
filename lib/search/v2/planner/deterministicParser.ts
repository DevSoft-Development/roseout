import { activities, cuisines, features, foods, matchTaxonomy } from "../taxonomy";
import type { SearchPlannerInput } from "./searchPlanTypes";

const places = [
  ["flushing", "Flushing", "Queens", "NYC", null], ["harlem", "Harlem", "Manhattan", "NYC", null], ["astoria", "Astoria", "Queens", "NYC", null], ["long island city", "Long Island City", "Queens", "NYC", null], ["jamaica queens", "Jamaica", "Queens", "NYC", null], ["garden city", "Garden City", null, "LONG_ISLAND", "Nassau"], ["williamsburg", "Williamsburg", "Brooklyn", "NYC", null], ["midtown", "Midtown", "Manhattan", "NYC", null], ["times square", "Times Square", "Manhattan", "NYC", null], ["manhattan", null, "Manhattan", "NYC", null], ["brooklyn", null, "Brooklyn", "NYC", null], ["queens", null, "Queens", "NYC", null], ["nassau county", null, null, "LONG_ISLAND", "Nassau"],
] as const;

export function deterministicParse(input: SearchPlannerInput) {
  const q = input.query.toLowerCase().replace(/[!?.,]+/g, " ").replace(/\s+/g, " ").trim();
  const activityCategories = matchTaxonomy(q, activities);
  const cuisineMatches = matchTaxonomy(q, cuisines);
  const foodMatches = matchTaxonomy(q, foods);
  const featureMatches = matchTaxonomy(q, features);
  const drinksSignal = /\b(drinks?|cocktails?|cocktail bar|wine|beer|happy hour)\b/.test(q);
  const groupSignal = /\b(group|friends|crew|party of|birthday group|large party)\b/.test(q);
  if (drinksSignal && !featureMatches.includes("cocktails")) featureMatches.push("cocktails");
  const restaurantSignal = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|cuisine|steak|sushi|seafood|italian|mexican|halal|vegan|chicken)\b/.test(q);
  const activityConnector = /\b(after|then|nearby|near|before)\b/.test(q) || (activityCategories.length > 0 && /\b(with|and)\b/.test(q));
  const explicitActivitySignal = activityCategories.length > 0 || /\b(activity|things to do|fun|show|game|bowling|karaoke|arcade|museum|gallery|theater|theatre|comedy|mini golf|live music|hookah lounge)\b/.test(q);
  // Drinks paired with a meal are a restaurant feature unless a distinct activity category is explicitly requested.
  const activitySignal = explicitActivitySignal && !(drinksSignal && restaurantSignal && !activityCategories.length && !activityConnector);
  const sequence: "restaurant_first" | "activity_first" | "any" = /\b(after|then)\b/.test(q) ? (q.search(/restaurant|dinner|lunch|brunch|food|sushi|steak/) < q.search(/after|then/) ? "restaurant_first" : "activity_first") : "any";
  const sameVenueRequired = /\b(same (venue|place)|one (venue|place)|under one roof)\b/.test(q);
  const sameVenuePreferred = sameVenueRequired || (restaurantSignal && activitySignal && !activityConnector);
  const anchorMatch = input.query.match(/\bnear\s+(.+?)(?:\s+in\s+([a-z ]+))?$/i);
  const explicitPlace = places.find(([alias]) => q.includes(alias));
  const walk = q.match(/(?:within\s+)?(\d+)\s*[- ]?minute\s+walk/);
  const family = /\b(family[- ]friendly|with (?:my )?(?:teenage |teen |young )?(?:son|daughter|child|kids?))\b/.test(q);
  return { q, activityCategories, cuisineMatches, foodMatches, featureMatches, restaurantSignal, activitySignal, drinksSignal, groupSignal, sequence, sameVenueRequired, sameVenuePreferred, anchorName: anchorMatch?.[1]?.replace(/\s+in\s+.*$/i, "").trim() ?? null, place: explicitPlace, walkMinutes: walk ? Number(walk[1]) : null, family };
}
