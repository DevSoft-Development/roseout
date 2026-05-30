import type { PairingPreference, SearchIntent } from "./types";
import { detectGeoIntent } from "./geo-taxonomy";
import { ACTIVITY_TERMS, createEmptyActivityIntent, createEmptyRestaurantIntent, detectActivityTerms, detectCuisineTerms, detectFoodTerms, detectMealTerms, expandActivitySynonyms, expandFoodSynonyms, FOOD_TERMS, MEAL_TERMS } from "./taxonomy";

const uniq = (items: string[]) => Array.from(new Set(items.map((x)=>x.toLowerCase().trim()).filter(Boolean)));
const phrase = (query: string, text: string) => new RegExp(`(^|[^a-z0-9])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(query);
const DISTANCE_CONSTRAINT_TERMS = ["walking distance", "walkable", "walking", "short walk", "quick walk", "around the corner", "nearby", "close by", "close together", "near each other", "same block", "same area", "same neighborhood", "in the area", "within walking distance", "can walk to", "no driving", "without driving"];
function stripCrossTerms(terms: string[], forbidden: string[]) { const f = new Set(forbidden.map((x)=>x.toLowerCase())); return terms.filter((t)=>!f.has(t.toLowerCase())); }
function stripDistanceTerms(terms: string[]) { const blocked = new Set(DISTANCE_CONSTRAINT_TERMS); return terms.filter((t)=>!blocked.has(t.toLowerCase())); }

export function detectPairingPreference(query: string, wantsPairing: boolean): PairingPreference {
  const sameArea = ["same neighborhood", "same area", "in the area"].some((p)=>phrase(query,p));
  const walking = ["walking distance", "walkable", "short walk", "quick walk", "within walking distance", "can walk to", "no driving", "without driving", "same block", "around the corner"].some((p)=>phrase(query,p)) || /\bwalking\b/i.test(query);
  const nearby = ["nearby", "close by", "close together", "near each other"].some((p)=>phrase(query,p));
  if (walking) return { requiresPairing: true, distanceMode: "walking", maxPairDistanceMiles: 0.75, maxPairWalkingMinutes: 15, requireWalkablePair: true };
  if (nearby) return { requiresPairing: true, distanceMode: "nearby", maxPairDistanceMiles: 1.5, maxPairWalkingMinutes: 30, requireWalkablePair: true };
  if (sameArea) return { requiresPairing: true, distanceMode: "same_area", maxPairDistanceMiles: 3, maxPairWalkingMinutes: null, requireWalkablePair: false };
  return { requiresPairing: wantsPairing, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false };
}

export function deterministicIntentFromQuery(query: string): SearchIntent {
  const food = detectFoodTerms(query); const cuisine = detectCuisineTerms(query); const meals = detectMealTerms(query); const acts = stripDistanceTerms(detectActivityTerms(query)); const geo = detectGeoIntent(query);
  const restaurantFood = food.filter((t) => t !== "rooftop" && t !== "lounge");
  const restaurantContext = meals.length>0 || restaurantFood.length>0 || /restaurant|dinner|brunch|lunch|breakfast|cuisine|eat|dining|steakhouse/i.test(query);
  const activityContext = acts.length>0 || /things to do|fun things|activity|then|with/i.test(query) || (/date night/i.test(query) && /walkable|walking distance|everything|outing|plan/i.test(query));
  const hookahOnly = acts.includes("hookah") && !/dinner|restaurant|food|eat|dining/i.test(query);
  const needsRestaurant = restaurantContext && !hookahOnly;
  const needsActivity = activityContext || hookahOnly;
  const mixed = needsRestaurant && needsActivity;
  return { rawQuery: query, searchType: mixed ? "mixed_outing" : needsRestaurant ? "restaurant" : needsActivity ? "activity" : "any", primaryDomain: mixed ? "mixed" : needsRestaurant ? "restaurant" : needsActivity ? "activity" : "any", needsRestaurant, needsActivity, wantsPairing: mixed, pairingPreference: detectPairingPreference(query, mixed), restaurantIntent: { ...createEmptyRestaurantIntent(), mealTerms: meals, foodTerms: food, cuisineTerms: cuisine, categoryTerms: /restaurant|dining/i.test(query)?["restaurant"]:[], featureTerms: food.includes("rooftop")||/rooftop|terrace|skyline|view/i.test(query)?["rooftop"]:[] }, activityIntent: { ...createEmptyActivityIntent(), activityTerms: acts, categoryTerms: /things to do/i.test(query)?["things to do"]:[], featureTerms: [] }, geo, occasion: /date night|romantic/i.test(query)?"date night":null, partySize: null, timeContext: meals[0]??null, budget: null, vibe: uniq([/romantic/i.test(query)?"romantic":"", /best/i.test(query)?"best":""]), strictness: "high" };
}
export function normalizeIntent(query: string, llmIntent?: Partial<SearchIntent> | null): SearchIntent {
  const base = deterministicIntentFromQuery(query);
  const merged: SearchIntent = { ...base, ...(llmIntent ?? {}), rawQuery: query, restaurantIntent: { ...base.restaurantIntent, ...(llmIntent?.restaurantIntent ?? {}) }, activityIntent: { ...base.activityIntent, ...(llmIntent?.activityIntent ?? {}) } };
  const redetectedGeo = detectGeoIntent(query);
  merged.geo = redetectedGeo.raw ? redetectedGeo : base.geo;
  const food = uniq([...detectFoodTerms(query), ...(merged.restaurantIntent.foodTerms ?? [])]);
  const cuisine = uniq([...detectCuisineTerms(query), ...(merged.restaurantIntent.cuisineTerms ?? [])]);
  const meals = uniq([...detectMealTerms(query), ...(merged.restaurantIntent.mealTerms ?? [])]);
  const acts = stripDistanceTerms(uniq([...detectActivityTerms(query), ...(merged.activityIntent.activityTerms ?? [])]));
  const foodExpanded = expandFoodSynonyms(food); const actExpanded = stripDistanceTerms(expandActivitySynonyms(acts));
  merged.restaurantIntent = { ...merged.restaurantIntent, mealTerms: stripCrossTerms(uniq([...meals, ...expandFoodSynonyms(meals)]), ACTIVITY_TERMS), foodTerms: stripCrossTerms(foodExpanded, ACTIVITY_TERMS), cuisineTerms: stripCrossTerms(cuisine, ACTIVITY_TERMS), categoryTerms: stripCrossTerms(uniq(merged.restaurantIntent.categoryTerms ?? []), ACTIVITY_TERMS), featureTerms: stripCrossTerms(uniq([...(merged.restaurantIntent.featureTerms??[]), ...(food.includes("rooftop")?["rooftop","terrace","skyline","view"]:[])]), ACTIVITY_TERMS), negativeTerms: uniq(merged.restaurantIntent.negativeTerms ?? []) };
  merged.activityIntent = { ...merged.activityIntent, activityTerms: stripDistanceTerms(stripCrossTerms(actExpanded, [...FOOD_TERMS, ...MEAL_TERMS])), categoryTerms: stripDistanceTerms(stripCrossTerms(uniq(merged.activityIntent.categoryTerms ?? []), [...FOOD_TERMS, ...MEAL_TERMS])), vibeTerms: uniq(merged.activityIntent.vibeTerms ?? []), featureTerms: stripDistanceTerms(uniq(merged.activityIntent.featureTerms ?? [])), negativeTerms: uniq(merged.activityIntent.negativeTerms ?? []) };
  const featureOnlyFood = new Set(["rooftop","roof top","terrace","patio","outdoor dining","skyline","city views","scenic views","view","roof deck","lounge"]);
  const hasRestaurant = merged.restaurantIntent.mealTerms.length>0 || merged.restaurantIntent.foodTerms.some((t)=>!featureOnlyFood.has(t)) || merged.restaurantIntent.cuisineTerms.some((t)=>!featureOnlyFood.has(t)) || /restaurant|dinner|brunch|lunch|breakfast|dining|date night|romantic/i.test(query);
  const hasActivity = merged.activityIntent.activityTerms.length>0 || /things to do|fun things|\bactivity\b/i.test(query) || (/date night/i.test(query) && /walkable|walking distance|everything|outing|plan/i.test(query));
  merged.needsRestaurant = hasRestaurant && !(/^\s*hookah\s+(in|near)/i.test(query));
  merged.needsActivity = hasActivity;
  merged.wantsPairing = merged.needsRestaurant && merged.needsActivity;
  merged.searchType = merged.wantsPairing ? "mixed_outing" : merged.needsRestaurant ? "restaurant" : merged.needsActivity ? "activity" : "any";
  merged.primaryDomain = merged.wantsPairing ? "mixed" : merged.needsRestaurant ? "restaurant" : merged.needsActivity ? "activity" : "any";
  const detectedPreference = detectPairingPreference(query, merged.wantsPairing);
  const llmPreference = llmIntent?.pairingPreference;
  merged.pairingPreference = detectedPreference.distanceMode !== "any" ? detectedPreference : { ...detectedPreference, ...(llmPreference ?? {}), requiresPairing: merged.wantsPairing || Boolean(llmPreference?.requiresPairing) };
  if (!merged.wantsPairing && merged.pairingPreference.distanceMode === "any") merged.pairingPreference.requiresPairing = false;
  return merged;
}
export function restaurantSearchTerms(intent: SearchIntent) { return uniq([...intent.restaurantIntent.mealTerms, ...intent.restaurantIntent.foodTerms, ...intent.restaurantIntent.cuisineTerms, ...intent.restaurantIntent.categoryTerms, ...intent.restaurantIntent.featureTerms]); }
export function activitySearchTerms(intent: SearchIntent) { return uniq([...intent.activityIntent.activityTerms, ...intent.activityIntent.categoryTerms, ...intent.activityIntent.featureTerms]); }
