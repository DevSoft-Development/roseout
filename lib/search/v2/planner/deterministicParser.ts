import { activities, cuisines, features, foods, matchTaxonomy } from "../taxonomy";
import { detectDomainNegation } from "./domainNegation";
import type { AnchorEntityType, SearchPlannerInput } from "./searchPlanTypes";

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

const EXPLICIT_ACTIVITY_PATTERN = /\b(bowling|billiards|pool hall|karaoke|arcade|museum|art gallery|gallery|escape room|escape game|theater|theatre|comedy|mini golf|live music|jazz|music venue|concert|live band|hookah|shisha|lounge|dancing|dance club|nightclub|scenic walk|waterfront walk|pottery|axe throwing)\b/;
const GENERIC_ANCHOR_PATTERN = /\b(skating rink|ice rink|museum|arcade|theater|theatre|bowling alley|park|arena|stadium|zoo|aquarium)\b/;
const INTERACTIVE_ACTIVITY_PATTERN = /\b(interactive activity|hands[- ]on activity|something interactive|interactive experience)\b/;
const STREET_PATTERN = /\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|highway|hwy|parkway|pkwy|lane|ln|drive|dr|court|ct|place|pl)\b/i;
const INTERSECTION_PATTERN = /\b(?:at|near)\s+[^,]+\s+(?:and|&)\s+[^,]+\b/i;
const TRANSIT_PATTERN = /\b(?:station|subway|train station|lirr|terminal|transit center)\b/i;
const SAME_VENUE_PATTERN = /\b(same (venue|place)|one (venue|place)|under one roof)\b/;
const SAME_VENUE_ALTERNATIVE_PATTERN = /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof)\b[\s\S]{0,120}\b(?:or|otherwise|alternatively|but)\b[\s\S]{0,120}\b(?:nearby|close|paired|pair|another (?:venue|place)|separate (?:venue|place))\b|\b(?:either|preferably)\b[\s\S]{0,80}\b(?:same (?:venue|place)|one (?:venue|place))\b[\s\S]{0,120}\b(?:or|otherwise|alternatively|but)\b/;

function normalizeQuery(value: string) { return value.toLowerCase().replace(/[!?.,]+/g, " ").replace(/\s+/g, " ").trim(); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function splitOutingClauses(query: string) {
  const matches = [...query.matchAll(/\b(followed by|and then|then|afterward|afterwards|after|before)\b/g)];
  const match = matches.find((item) => item.index != null);
  if (!match || match.index == null) return { restaurantClause: query, activityClause: query, separated: false };
  const end = match.index + match[0].length;
  const restaurantClause = query.slice(0, match.index).trim();
  const activityClause = query.slice(end).trim();
  if (!activityClause) {
    return { restaurantClause: query, activityClause: query, separated: false };
  }
  return { restaurantClause, activityClause, separated: true };
}
function classifyAnchorEntity(rawTail: string, genericAnchor: boolean): AnchorEntityType {
  if (genericAnchor) return "generic_category";
  if (INTERSECTION_PATTERN.test(rawTail)) return "intersection";
  if (TRANSIT_PATTERN.test(rawTail)) return "transit_stop";
  if (STREET_PATTERN.test(rawTail)) return "street";
  return "named_venue";
}
function extractAnchorContext(query: string) {
  const normalized = normalizeQuery(query);
  const exactNameRequired = /\b(exact|exactly|exact named place|exact named location|do not guess|don't guess)\b/i.test(query);
  const called = normalized.match(/\b(?:location|place|venue)\s+(?:called|named)\s+(.+?)(?=\s+(?:in|near|within|for|and|but|if)\b|$)/i);
  if (called?.[1]) return { anchorName: called[1].trim(), genericAnchor: false, anchorEntityType: "named_venue" as AnchorEntityType, exactNameRequired };
  const near = normalized.match(/\b(?:near|close to|around)\s+(?:an?\s+|the\s+)?(.+?)(?=\s+(?:in|for|where|that|which|before|after|but|and)\b|$)/i);
  const rawTail = near?.[1]?.trim() ?? null;
  if (!rawTail) return { anchorName: null, genericAnchor: false, anchorEntityType: "none" as AnchorEntityType, exactNameRequired };
  const knownPlace = places.some(([alias]) => rawTail === alias || rawTail.endsWith(` ${alias}`));
  if (knownPlace) return { anchorName: null, genericAnchor: false, anchorEntityType: "none" as AnchorEntityType, exactNameRequired };
  const genericAnchor = GENERIC_ANCHOR_PATTERN.test(rawTail);
  return { anchorName: rawTail, genericAnchor, anchorEntityType: classifyAnchorEntity(rawTail, genericAnchor), exactNameRequired };
}
function removeExactPhrase(query: string, phrase: string | null) { if (!phrase) return query; return query.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), " ").replace(/\s+/g, " ").trim(); }
function secondStopEvidence(query: string) {
  const q = normalizeQuery(query);
  const connector = q.match(/\b(followed by|and then|then|afterward|afterwards|after|before)\b/);
  if (!connector || connector.index == null) return "";
  return q.slice(connector.index + connector[0].length);
}

export function deterministicParse(input: SearchPlannerInput) {
  const q = normalizeQuery(input.query);
  const domainNegation = detectDomainNegation(input.query);
  const { anchorName, genericAnchor, anchorEntityType, exactNameRequired } = extractAnchorContext(input.query);
  const taxonomyQuery = removeExactPhrase(q, anchorName);
  const clauses = splitOutingClauses(taxonomyQuery);
  const restaurantQuery = clauses.restaurantClause;
  const activityQuery = clauses.activityClause;
  const secondStopQuery = secondStopEvidence(taxonomyQuery);
  const activityEvidenceQuery = [activityQuery, secondStopQuery].filter(Boolean).join(" ");
  const cuisineMatches = matchTaxonomy(restaurantQuery, cuisines);
  const foodMatches = matchTaxonomy(restaurantQuery, foods);
  const restaurantFeatures = matchTaxonomy(restaurantQuery, features);
  const activityFeatures = matchTaxonomy(activityEvidenceQuery, features);
  const activityCategories = matchTaxonomy(activityEvidenceQuery, activities);

  const explicitTheater = /\b(theater|theatre|movie theater|cinema|stage show)\b/.test(activityEvidenceQuery);
  for (let i = activityCategories.length - 1; i >= 0; i -= 1) if (activityCategories[i] === "theater" && !explicitTheater) activityCategories.splice(i, 1);
  const explicitActivityAliases: Array<[RegExp, string]> = [
    [/\bbowling\b/, "bowling"], [/\b(?:billiards|pool hall)\b/, "billiards"], [/\b(?:art gallery|gallery)\b/, "art_gallery"], [/\b(?:escape room|escape game)\b/, "escape_room"],
    [/\bkaraoke\b/, "karaoke"], [/\b(?:live music|jazz|music venue|concert|live band)\b/, "live_music"], [/\b(?:movie theater|cinema|theater|theatre)\b/, "theater"],
    [/\b(?:dancing|dance club|nightclub)\b/, "nightlife"], [/\b(?:scenic walk|waterfront walk)\b/, "scenic_walk"],
  ];
  for (const [pattern, category] of explicitActivityAliases) if (pattern.test(activityEvidenceQuery) && !activityCategories.includes(category)) activityCategories.push(category);
  if (INTERACTIVE_ACTIVITY_PATTERN.test(activityEvidenceQuery)) for (const category of ["escape_room", "arcade", "bowling", "mini_golf", "pottery", "axe_throwing"]) if (!activityCategories.includes(category)) activityCategories.push(category);

  const drinksSignal = /\b(drinks?|cocktails?|cocktail bar|wine|beer|happy hour)\b/.test(taxonomyQuery);
  const groupSignal = /\b(group|friends|crew|party of|birthday group|large party|people|adults)\b/.test(q);
  if (/\b(cocktails?|cocktail bar)\b/.test(restaurantQuery) && !restaurantFeatures.includes("cocktails")) restaurantFeatures.push("cocktails");
  if (/\b(cocktails?|cocktail bar)\b/.test(activityEvidenceQuery) && !activityFeatures.includes("cocktails")) activityFeatures.push("cocktails");
  const hookahSignal = /\b(hookah|hookah lounge|hookah bar|shisha|shisha lounge)\b/.test(activityEvidenceQuery);
  const loungeSignal = /\b(lounge|cocktail lounge|hookah lounge|rooftop lounge|rooftop bar)\b/.test(activityEvidenceQuery);
  if (hookahSignal && !activityCategories.includes("hookah")) activityCategories.push("hookah"); else if (loungeSignal && !activityCategories.includes("lounge")) activityCategories.push("lounge");

  const explicitMealSignal = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|cuisine|steak|sushi|seafood|italian|mexican|halal|vegan|chicken|burgers?|wings?|ramen|japanese|caribbean|dominican|puerto rican|korean|bbq)\b/.test(restaurantQuery);
  const barWithFoodSignal = /\bbar\b/.test(restaurantQuery) && foodMatches.length > 0;
  const restaurantSignal = !domainNegation.restaurant && (explicitMealSignal || cuisineMatches.length > 0 || foodMatches.length > 0 || barWithFoodSignal);
  const genericActivitySignal = /\b(activity|activities|things to do|something fun|fun activity|show|game|somewhere close by)\b/.test(activityEvidenceQuery) || INTERACTIVE_ACTIVITY_PATTERN.test(activityEvidenceQuery);
  const sequenceRelationship = /\b(after|afterward|afterwards|then|followed by|before)\b/.test(q);
  const relationshipSignal = sequenceRelationship || /\b(nearby|near|with|and|within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const rooftopDrinksSignal = /\b(rooftop drinks?|rooftop bar|rooftop lounge)\b/.test(activityEvidenceQuery);
  const mealAndSeparateDrinks = restaurantSignal && drinksSignal && relationshipSignal && /\b(cocktails?|drinks?|rooftop drinks?|bar|lounge)\b/.test(activityEvidenceQuery) && !barWithFoodSignal;
  if ((rooftopDrinksSignal || mealAndSeparateDrinks) && !activityCategories.includes("lounge")) activityCategories.push("lounge");
  if (rooftopDrinksSignal && !activityFeatures.includes("rooftop")) activityFeatures.push("rooftop");

  const explicitActivitySignal = activityCategories.length > 0 || genericActivitySignal || EXPLICIT_ACTIVITY_PATTERN.test(activityEvidenceQuery);
  const anchorOnlyActivity = genericAnchor && restaurantSignal && !sequenceRelationship;
  const activitySignal = !domainNegation.activity && (anchorOnlyActivity ? false : explicitActivitySignal || rooftopDrinksSignal || mealAndSeparateDrinks);
  const sequenceToken = taxonomyQuery.search(/\b(after|afterward|afterwards|then|followed by|before)\b/);
  const mealToken = taxonomyQuery.search(/\b(restaurant|dinner|lunch|brunch|breakfast|food|sushi|steak|seafood|italian|halal|bar|wings?)\b/);
  const activityToken = taxonomyQuery.search(/\b(activity|activities|bowling|karaoke|arcade|museum|art gallery|gallery|escape room|theater|theatre|comedy|mini golf|live music|hookah|shisha|lounge|rooftop|cocktails?|drinks?|dancing)\b/);
  const sequence: "restaurant_first" | "activity_first" | "any" = sequenceToken >= 0 ? mealToken >= 0 && mealToken < sequenceToken ? "restaurant_first" : activityToken >= 0 && activityToken < sequenceToken ? "activity_first" : "any" : "any";
  const sameVenueMentioned = SAME_VENUE_PATTERN.test(taxonomyQuery);
  const sameVenueHasAlternative = sameVenueMentioned && SAME_VENUE_ALTERNATIVE_PATTERN.test(taxonomyQuery);
  const sameVenueRequired = sameVenueMentioned && !sameVenueHasAlternative;
  const separateVenueRelationship = sequenceRelationship || /\b(within walking distance of|walking distance from|walk(?:ing)? distance to|nearby)\b/.test(q);
  const sameVenuePreferred = sameVenueMentioned || (restaurantSignal && activitySignal && !separateVenueRelationship);
  const explicitPlace = places.find(([alias]) => q.includes(alias));
  const walk = q.match(/(?:within\s+|under\s+|no more than\s+|longer than\s+)?(\d+)\s*[- ]?minute(?:s)?\s+(?:walk|walking)/);
  const qualitativeWalk = /\b(within walking distance of|walking distance from|walk(?:ing)? distance to)\b/.test(q);
  const family = /\b(family[- ]friendly|with (?:my )?(?:teenage |teen |young )?(?:son|daughter|child|kids?))\b/.test(q);
  return { q, activityCategories, cuisineMatches, foodMatches, restaurantFeatures, activityFeatures, restaurantSignal, activitySignal, domainNegation, drinksSignal, groupSignal, sequence, sameVenueRequired, sameVenuePreferred, sameVenueHasAlternative, anchorName, genericAnchor, anchorEntityType, exactNameRequired, place: explicitPlace, walkMinutes: walk ? Number(walk[1]) : qualitativeWalk ? 30 : null, family };
}
