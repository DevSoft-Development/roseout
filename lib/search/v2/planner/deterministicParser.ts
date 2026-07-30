import { activities, cuisines, features, foods, matchTaxonomy } from "../taxonomy";
import type { SearchPlannerInput } from "./searchPlanTypes";

const places = [
  ["flushing", "Flushing", "Queens", "NYC", null],
  ["harlem", "Harlem", "Manhattan", "NYC", null],
  ["astoria", "Astoria", "Queens", "NYC", null],
  ["long island city", "Long Island City", "Queens", "NYC", null],
  ["jamaica queens", "Jamaica", "Queens", "NYC", null],
  ["forest hills", "Forest Hills", "Queens", "NYC", null],
  ["bayside", "Bayside", "Queens", "NYC", null],
  ["soho", "Soho", "Manhattan", "NYC", null],
  ["garden city", "Garden City", null, "LONG_ISLAND", "Nassau"],
  ["williamsburg", "Williamsburg", "Brooklyn", "NYC", null],
  ["midtown", "Midtown", "Manhattan", "NYC", null],
  ["times square", "Times Square", "Manhattan", "NYC", null],
  ["new york city", null, null, "NYC", null],
  ["nyc", null, null, "NYC", null],
  ["long island", null, null, "LONG_ISLAND", null],
  ["manhattan", null, "Manhattan", "NYC", null],
  ["brooklyn", null, "Brooklyn", "NYC", null],
  ["queens", null, "Queens", "NYC", null],
  ["nassau county", null, null, "LONG_ISLAND", "Nassau"],
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

  const hookahSignal = /\b(hookah|hookah lounge|hookah bar|shisha|shisha lounge)\b/.test(q);
  const loungeSignal = /\b(lounge|cocktail lounge|hookah lounge|rooftop lounge)\b/.test(q);
  const liveMusicSignal = /\b(live music|jazz|music venue|concert|live band)\b/.test(q);
  if (hookahSignal && !activityCategories.includes("hookah")) activityCategories.push("hookah");
  else if (loungeSignal && !activityCategories.includes("lounge")) activityCategories.push("lounge");
  if (liveMusicSignal && !activityCategories.includes("live_music")) activityCategories.push("live_music");

  const explicitMealSignal = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|cuisine|steak|sushi|seafood|italian|mexican|halal|vegan|chicken)\b/.test(q);
  const barWithFoodSignal = /\bbar\b/.test(q) && foodMatches.length > 0;
  const restaurantSignal = explicitMealSignal || cuisineMatches.length > 0 || foodMatches.length > 0 || barWithFoodSignal;
  const genericActivitySignal = /\b(activity|activities|things to do|fun|show|game)\b/.test(q);
  const relationshipSignal = /\b(after|afterward|afterwards|then|nearby|near|before|with|and|within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const rooftopDrinksSignal = /\b(rooftop drinks?|rooftop bar|rooftop lounge)\b/.test(q);
  const mealAndSeparateDrinks = restaurantSignal && drinksSignal && relationshipSignal && /\b(cocktails?|drinks?|rooftop drinks?|bar|lounge)\b/.test(q) && !barWithFoodSignal;
  if ((rooftopDrinksSignal || mealAndSeparateDrinks) && !activityCategories.includes("lounge")) activityCategories.push("lounge");

  const explicitActivitySignal = activityCategories.length > 0 || genericActivitySignal || /\b(bowling|karaoke|arcade|museum|gallery|theater|theatre|comedy|mini golf|live music|hookah|shisha|lounge)\b/.test(q);
  const activityConnector = explicitActivitySignal && relationshipSignal;
  const activitySignal = explicitActivitySignal || rooftopDrinksSignal || mealAndSeparateDrinks;
  const sequenceToken = q.search(/\b(after|afterward|afterwards|then)\b/);
  const mealToken = q.search(/\b(restaurant|dinner|lunch|brunch|breakfast|food|sushi|steak|seafood|italian|halal|bar|wings?)\b/);
  const activityToken = q.search(/\b(activity|activities|bowling|karaoke|arcade|museum|gallery|theater|theatre|comedy|mini golf|live music|hookah|shisha|lounge|rooftop|cocktails?|drinks?)\b/);
  const sequence: "restaurant_first" | "activity_first" | "any" = sequenceToken >= 0
    ? mealToken >= 0 && mealToken < sequenceToken
      ? "restaurant_first"
      : activityToken >= 0 && activityToken < sequenceToken
        ? "activity_first"
        : "any"
    : "any";
  const sameVenueRequired = /\b(same (venue|place)|one (venue|place)|under one roof)\b/.test(q);
  const separateVenueRelationship = /\b(within walking distance of|walking distance from|walk(?:ing)? distance to|after|afterward|afterwards|then|before|nearby)\b/.test(q);
  const sameVenuePreferred = sameVenueRequired || (restaurantSignal && activitySignal && !activityConnector && !separateVenueRelationship);
  const anchorMatch = input.query.match(/\bnear\s+(.+?)(?:\s+in\s+([a-z ]+))?$/i);
  const explicitPlace = places.find(([alias]) => q.includes(alias));
  const walk = q.match(/(?:within\s+)?(\d+)\s*[- ]?minute\s+walk/);
  const qualitativeWalk = /\b(within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const family = /\b(family[- ]friendly|with (?:my )?(?:teenage |teen |young )?(?:son|daughter|child|kids?))\b/.test(q);
  return { q, activityCategories, cuisineMatches, foodMatches, featureMatches, restaurantSignal, activitySignal, drinksSignal, groupSignal, sequence, sameVenueRequired, sameVenuePreferred, anchorName: anchorMatch?.[1]?.replace(/\s+in\s+.*$/i, "").trim() ?? null, place: explicitPlace, walkMinutes: walk ? Number(walk[1]) : qualitativeWalk ? 30 : null, family };
}
