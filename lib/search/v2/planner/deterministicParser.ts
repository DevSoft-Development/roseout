import { activities, cuisines, features, foods, matchTaxonomy } from "../taxonomy";
import type { SearchPlannerInput } from "./searchPlanTypes";

const places = [
  ["flushing", "Flushing", "Queens", "NYC", null], ["harlem", "Harlem", "Manhattan", "NYC", null],
  ["astoria", "Astoria", "Queens", "NYC", null], ["long island city", "Long Island City", "Queens", "NYC", null],
  ["jamaica queens", "Jamaica", "Queens", "NYC", null], ["forest hills", "Forest Hills", "Queens", "NYC", null],
  ["bayside", "Bayside", "Queens", "NYC", null], ["soho", "Soho", "Manhattan", "NYC", null],
  ["garden city", "Garden City", null, "LONG_ISLAND", "Nassau"], ["rockville centre", "Rockville Centre", null, "LONG_ISLAND", "Nassau"],
  ["williamsburg", "Williamsburg", "Brooklyn", "NYC", null], ["midtown", "Midtown", "Manhattan", "NYC", null],
  ["times square", "Times Square", "Manhattan", "NYC", null], ["new york city", null, null, "NYC", null],
  ["nyc", null, null, "NYC", null], ["long island", null, null, "LONG_ISLAND", null],
  ["manhattan", null, "Manhattan", "NYC", null], ["brooklyn", null, "Brooklyn", "NYC", null], ["queens", null, "Queens", "NYC", null],
  ["nassau county", null, null, "LONG_ISLAND", "Nassau"],
] as const;

const EXPLICIT_ACTIVITY_PATTERN = /\b(bowling|karaoke|arcade|museum|art gallery|gallery|escape room|escape game|theater|theatre|comedy|mini golf|live music|jazz|music venue|concert|live band|hookah|shisha|lounge)\b/;
const GENERIC_ANCHOR_PATTERN = /\b(skating rink|ice rink|museum|arcade|theater|theatre|bowling alley|park|arena|stadium|zoo|aquarium)\b/;
const INTERACTIVE_ACTIVITY_PATTERN = /\b(interactive activity|hands[- ]on activity|something interactive|interactive experience)\b/;

function normalizeQuery(value: string) { return value.toLowerCase().replace(/[!?.,]+/g, " ").replace(/\s+/g, " ").trim(); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function splitOutingClauses(query: string) {
  const match = query.match(/\b(followed by|and then|then|afterward|afterwards|after)\b/);
  if (!match || match.index == null) return { restaurantClause: query, activityClause: query, separated: false };
  const end = match.index + match[0].length;
  return { restaurantClause: query.slice(0, match.index).trim(), activityClause: query.slice(end).trim(), separated: true };
}
function extractAnchorContext(query: string) {
  const normalized = normalizeQuery(query);
  const called = normalized.match(/\b(?:location|place|venue)\s+(?:called|named)\s+(.+?)(?=\s+(?:in|near|within|for|and|but|if)\b|$)/i);
  if (called?.[1]) return { anchorName: called[1].trim(), genericAnchor: false };
  const near = normalized.match(/\b(?:near|close to|around)\s+(?:an?\s+|the\s+)?(.+?)(?=\s+(?:in|for|where|that|which|before|after|but|and)\b|$)/i);
  const rawTail = near?.[1]?.trim() ?? null;
  if (!rawTail) return { anchorName: null, genericAnchor: false };
  const knownPlace = places.some(([alias]) => rawTail === alias || rawTail.endsWith(` ${alias}`));
  if (knownPlace) return { anchorName: null, genericAnchor: false };
  return { anchorName: rawTail, genericAnchor: GENERIC_ANCHOR_PATTERN.test(rawTail) };
}
function removeExactPhrase(query: string, phrase: string | null) { if (!phrase) return query; return query.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), " ").replace(/\s+/g, " ").trim(); }

export function deterministicParse(input: SearchPlannerInput) {
  const q = normalizeQuery(input.query);
  const { anchorName, genericAnchor } = extractAnchorContext(input.query);
  const taxonomyQuery = removeExactPhrase(q, anchorName);
  const clauses = splitOutingClauses(taxonomyQuery);
  const restaurantQuery = clauses.restaurantClause;
  const activityQuery = clauses.activityClause;
  const cuisineMatches = matchTaxonomy(restaurantQuery, cuisines);
  const foodMatches = matchTaxonomy(restaurantQuery, foods);
  const restaurantFeatures = matchTaxonomy(restaurantQuery, features);
  const activityFeatures = matchTaxonomy(activityQuery, features);
  const activityCategories = matchTaxonomy(activityQuery, activities);

  const explicitTheater = /\b(theater|theatre|movie theater|cinema|stage show)\b/.test(activityQuery);
  for (let i = activityCategories.length - 1; i >= 0; i -= 1) if (activityCategories[i] === "theater" && !explicitTheater) activityCategories.splice(i, 1);
  const explicitActivityAliases: Array<[RegExp, string]> = [
    [/\bbowling\b/, "bowling"], [/\b(?:art gallery|gallery)\b/, "art_gallery"], [/\b(?:escape room|escape game)\b/, "escape_room"],
    [/\bkaraoke\b/, "karaoke"], [/\b(?:live music|jazz|music venue|concert|live band)\b/, "live_music"], [/\b(?:movie theater|cinema|theater|theatre)\b/, "theater"],
  ];
  for (const [pattern, category] of explicitActivityAliases) if (pattern.test(activityQuery) && !activityCategories.includes(category)) activityCategories.push(category);
  if (INTERACTIVE_ACTIVITY_PATTERN.test(activityQuery)) for (const category of ["escape_room", "arcade", "bowling", "mini_golf", "pottery", "axe_throwing"]) if (!activityCategories.includes(category)) activityCategories.push(category);

  const drinksSignal = /\b(drinks?|cocktails?|cocktail bar|wine|beer|happy hour)\b/.test(taxonomyQuery);
  const groupSignal = /\b(group|friends|crew|party of|birthday group|large party)\b/.test(q);
  if (/\b(cocktails?|cocktail bar)\b/.test(restaurantQuery) && !restaurantFeatures.includes("cocktails")) restaurantFeatures.push("cocktails");
  if (/\b(cocktails?|cocktail bar)\b/.test(activityQuery) && !activityFeatures.includes("cocktails")) activityFeatures.push("cocktails");
  const hookahSignal = /\b(hookah|hookah lounge|hookah bar|shisha|shisha lounge)\b/.test(activityQuery);
  const loungeSignal = /\b(lounge|cocktail lounge|hookah lounge|rooftop lounge|rooftop bar)\b/.test(activityQuery);
  if (hookahSignal && !activityCategories.includes("hookah")) activityCategories.push("hookah"); else if (loungeSignal && !activityCategories.includes("lounge")) activityCategories.push("lounge");

  const explicitMealSignal = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|cuisine|steak|sushi|seafood|italian|mexican|halal|vegan|chicken)\b/.test(restaurantQuery);
  const barWithFoodSignal = /\bbar\b/.test(restaurantQuery) && foodMatches.length > 0;
  const restaurantSignal = explicitMealSignal || cuisineMatches.length > 0 || foodMatches.length > 0 || barWithFoodSignal;
  const genericActivitySignal = /\b(activity|activities|things to do|fun|show|game)\b/.test(activityQuery) || INTERACTIVE_ACTIVITY_PATTERN.test(activityQuery);
  const relationshipSignal = /\b(after|afterward|afterwards|then|followed by|nearby|near|before|with|and|within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const rooftopDrinksSignal = /\b(rooftop drinks?|rooftop bar|rooftop lounge)\b/.test(activityQuery);
  const mealAndSeparateDrinks = restaurantSignal && drinksSignal && relationshipSignal && /\b(cocktails?|drinks?|rooftop drinks?|bar|lounge)\b/.test(activityQuery) && !barWithFoodSignal;
  if ((rooftopDrinksSignal || mealAndSeparateDrinks) && !activityCategories.includes("lounge")) activityCategories.push("lounge");
  if (rooftopDrinksSignal && !activityFeatures.includes("rooftop")) activityFeatures.push("rooftop");

  const explicitActivitySignal = activityCategories.length > 0 || genericActivitySignal || EXPLICIT_ACTIVITY_PATTERN.test(activityQuery);
  const activityConnector = explicitActivitySignal && relationshipSignal;
  const anchorOnlyActivity = genericAnchor && restaurantSignal && !/\b(after|afterward|afterwards|then|followed by)\b/.test(q);
  const activitySignal = anchorOnlyActivity ? false : explicitActivitySignal || rooftopDrinksSignal || mealAndSeparateDrinks;
  const sequenceToken = taxonomyQuery.search(/\b(after|afterward|afterwards|then|followed by)\b/);
  const mealToken = taxonomyQuery.search(/\b(restaurant|dinner|lunch|brunch|breakfast|food|sushi|steak|seafood|italian|halal|bar|wings?)\b/);
  const activityToken = taxonomyQuery.search(/\b(activity|activities|bowling|karaoke|arcade|museum|art gallery|gallery|escape room|theater|theatre|comedy|mini golf|live music|hookah|shisha|lounge|rooftop|cocktails?|drinks?)\b/);
  const sequence: "restaurant_first" | "activity_first" | "any" = sequenceToken >= 0 ? mealToken >= 0 && mealToken < sequenceToken ? "restaurant_first" : activityToken >= 0 && activityToken < sequenceToken ? "activity_first" : "any" : "any";
  const sameVenueRequired = /\b(same (venue|place)|one (venue|place)|under one roof)\b/.test(taxonomyQuery);
  const separateVenueRelationship = /\b(within walking distance of|walking distance from|walk(?:ing)? distance to|after|afterward|afterwards|then|followed by|before|nearby)\b/.test(q);
  const sameVenuePreferred = sameVenueRequired || (restaurantSignal && activitySignal && !activityConnector && !separateVenueRelationship);
  const explicitPlace = places.find(([alias]) => q.includes(alias));
  const walk = q.match(/(?:within\s+|under\s+|no more than\s+|longer than\s+)?(\d+)\s*[- ]?minute(?:s)?\s+(?:walk|walking)/);
  const qualitativeWalk = /\b(within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const family = /\b(family[- ]friendly|with (?:my )?(?:teenage |teen |young )?(?:son|daughter|child|kids?))\b/.test(q);
  return { q, activityCategories, cuisineMatches, foodMatches, restaurantFeatures, activityFeatures, restaurantSignal, activitySignal, drinksSignal, groupSignal, sequence, sameVenueRequired, sameVenuePreferred, anchorName, genericAnchor, place: explicitPlace, walkMinutes: walk ? Number(walk[1]) : qualitativeWalk ? 30 : null, family };
}
