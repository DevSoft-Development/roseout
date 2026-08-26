import type { SearchPlan, VenueRelationshipType } from "./searchPlanTypes";
import { findTaxonomyMatches } from "../taxonomy";
import { rewriteSpecificTaxonomyPhrases } from "./taxonomySpecificity";

const uniq = (items: string[]) => [...new Set(items.filter(Boolean))];
const q = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const TAXONOMY_NEGATION_PREFIX = String.raw`(?:no|not|without|anything\s+but|except|is(?:n't|\s+not)|are(?:n't|\s+not)|was(?:n't|\s+not)|were(?:n't|\s+not))`;

export function detectVenueRelationship(query: string) {
  const text = q(query);
  const evidence: string[] = [];
  let type: VenueRelationshipType = "any";

  const sequential = /\b(?:then|and then|followed by|afterward|afterwards|after|before)\b/.test(text);
  const stayPut = /\b(?:without\s+(?:ever\s+)?leaving|never\s+leave|do\s+not\s+leave|don't\s+leave|stay(?:ing)?\s+(?:at|in))\s+(?:the\s+)?(?:same\s+)?(?:venue|place|spot|restaurant|bar)\b/.test(text);
  const sameVenueRequired = /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place)\b/.test(text) || stayPut;
  const singlePlaceFrame = /\b(?:somewhere|place|spot|venue|restaurant|bar|lounge|cafe)\b.{0,100}\b(?:where|that|with|having|has|offers?|serves?|to)\b/.test(text);
  const mealCapability = /\b(?:eat|dine|dining|food|dinner|brunch|lunch|breakfast|meal|restaurant|kitchen)\b/.test(text);
  const activityCapability = /\b(?:live music|jazz|karaoke|hookah|shisha|dancing|dance|dj|rooftop|cocktails?|drinks?|arcade|bowling|comedy|show|entertainment|performance)\b/.test(text);
  const sameVenueFeature = !sequential && (
    /\b(?:restaurant|dinner|brunch|lunch|food|dining)\b.{0,45}\b(?:with|has|having|serves?|offering|that has)\b.{0,30}\b(?:hookah|shisha|rooftop|live music|cocktails?|dj|karaoke|dancing)\b/.test(text)
    || /\b(?:hookah|shisha|rooftop)\s+(?:restaurant|cafe)\b/.test(text)
    || /\b(?:somewhere|place|spot|venue)\b.{0,35}\b(?:where|that)\b.{0,40}\b(?:we|you|i)?\s*(?:can\s+)?(?:eat|dine|have (?:dinner|brunch|lunch|food|drinks?))\b.{0,70}\b(?:live music|jazz|hookah|shisha|karaoke|cocktails?|drinks?|dancing|show|entertainment|performance)\b/.test(text)
    || (singlePlaceFrame && mealCapability && activityCapability)
  );
  const proximity = /\b(?:nearby|near|close to|within walking distance|walking distance)\b/.test(text);
  const separate = /\b(?:separate venues?|different places?|another place|somewhere else)\b/.test(text);

  if (sameVenueRequired) { type = "same_venue_required"; evidence.push(stayPut ? "stay_in_one_venue" : "explicit_same_venue"); }
  else if (sameVenueFeature) { type = "same_venue_required"; evidence.push("feature_bound_to_restaurant"); }
  else if (sequential) { type = "sequential"; evidence.push("sequence_connector"); }
  else if (separate) { type = "separate_venues"; evidence.push("explicit_separate_venues"); }
  else if (proximity) { type = "proximity"; evidence.push("proximity_connector"); }
  else if (/\b(?:preferably|ideally)\b.{0,40}\b(?:same place|same venue|one place)\b/.test(text)) { type = "same_venue_preferred"; evidence.push("preferred_same_venue"); }

  return { type, evidence, sameVenueFeature };
}

function singularizeLoosePhrase(value: string) {
  return value
    .replace(/\b([a-z]{3,})ies\b/g, "$1y")
    .replace(/\b([a-z]{4,})s\b/g, "$1");
}

function taxonomyNegativeTerms(query: string) {
  const restaurant: string[] = [];
  const activity: string[] = [];
  const text = q(query);
  const negativeClauses = [...text.matchAll(new RegExp(`\\b${TAXONOMY_NEGATION_PREFIX}\\s+(?:a\\s+|an\\s+|the\\s+)?([^.;!?]+?)(?=\\s+\\b(?:but|then|after|before|near|around|in|at)\\b|[.;!?]|$)`, "g"))];

  for (const match of negativeClauses) {
    const rawPhrase = String(match[1] ?? "").trim();
    if (!rawPhrase) continue;
    const variants = uniq([rawPhrase, singularizeLoosePhrase(rawPhrase)]);
    const matches = variants.flatMap((variant) => findTaxonomyMatches(rewriteSpecificTaxonomyPhrases(variant)));
    const specificLoungePhrase = /\b(?:hookah|shisha)\s+lounges?\b/i.test(rawPhrase);
    const phraseWithoutSpecificLounge = rawPhrase.replace(/\b(?:hookah|shisha)\s+lounges?\b/gi, " ");
    const loungeAlsoExplicit = /\blounges?\b/i.test(phraseWithoutSpecificLounge);
    const modifierScopedBar = /\b(?:loud|noisy|rowdy|clubby|party)\s+bars?\b/i.test(rawPhrase);
    const phraseWithoutScopedBar = rawPhrase.replace(/\b(?:loud|noisy|rowdy|clubby|party)\s+bars?\b/gi, " ");
    const barAlsoExplicit = /\bbars?\b/i.test(phraseWithoutScopedBar);

    for (const entry of matches) {
      if (entry.id === "lounge" && specificLoungePhrase && !loungeAlsoExplicit) continue;
      if (entry.id === "bar" && modifierScopedBar && !barAlsoExplicit) continue;
      if (["activity", "nightlife"].includes(entry.domain)) activity.push(entry.id);
      if (["restaurant_category", "cuisine", "food"].includes(entry.domain)) restaurant.push(entry.id);
    }
  }
  return { restaurant: uniq(restaurant), activity: uniq(activity) };
}

export function extractNegativeConstraints(query: string) {
  const text = q(query);
  const taxonomyNegatives = taxonomyNegativeTerms(query);
  const restaurant: string[] = [...taxonomyNegatives.restaurant];
  const activity: string[] = [...taxonomyNegatives.activity];
  const vibes: string[] = [];
  const geo: string[] = [];

  if (/\b(?:no|not|nothing|without|isn't|is not|aren't|are not)\s+(?:anything\s+)?(?:outdoors?|outside|outdoor)\b|\bindoor(?:s)?\s+only\b/.test(text)) activity.push("outdoor");
  if (/\b(?:no|without)\s+(?:night\s*)?clubs?\b/.test(text)) activity.push("nightclub");
  if (/\b(?:no|not|nothing|without|somewhere not|don't want|do not want|isn't|is not|aren't|are not).{0,24}\b(?:loud|too loud|noisy|rowdy|clubby|party)\b/.test(text) || /\bquiet enough to talk\b/.test(text)) vibes.push("loud", "party");
  if (/\b(?:no|not|nothing|without|somewhere not|isn't|is not|aren't|are not).{0,15}\b(?:formal|stuffy|pretentious)\b/.test(text)) vibes.push("formal", "stuffy", "pretentious");
  for (const place of ["manhattan", "brooklyn", "queens", "bronx", "staten island", "long island"]) {
    if (new RegExp(`\\b(?:not|except|outside of)\\s+${place}\\b`).test(text)) geo.push(place);
  }

  return { restaurant: uniq(restaurant), activity: uniq(activity), vibes: uniq(vibes), geo: uniq(geo) };
}

export function extractSubjectivePreferences(query: string) {
  const text = q(query);
  const vibes: string[] = [];
  const subjectiveTerms: string[] = [];
  let budget: "budget" | "moderate" | "premium" | null = null;
  let noise: "quiet" | "moderate" | "lively" | null = null;

  const patterns: Array<[RegExp, string]> = [
    [/\bromantic|intimate|date[- ]night vibe\b/, "romantic"],
    [/\bchill|laid back|laid-back|low key|low-key|relaxed\b/, "relaxed"],
    [/\bupscale|nice|classy|elegant\b/, "upscale"],
    [/\blively|energetic|good energy|fun vibe\b/, "lively"],
    [/\bcozy|cozy vibe\b/, "cozy"],
    [/\btrendy|cool|instagrammable\b/, "trendy"],
    [/\bquiet|conversation friendly|conversation-friendly|hear each other|actually talk|can talk\b/, "conversation_friendly"],
  ];
  for (const [pattern, label] of patterns) if (pattern.test(text)) { vibes.push(label); subjectiveTerms.push(label); }

  if (/\b(?:not|nothing)\s+(?:too|crazy|that|very)\s+expensive\b|\bmoderate\b|\bmid[- ]range\b|\breasonably priced\b/.test(text)) budget = "moderate";
  else if (/\bcheap|affordable|budget|inexpensive|not expensive\b/.test(text)) budget = "budget";
  else if (/\bluxury|premium|high end|high-end|splurge\b/.test(text)) budget = "premium";

  if (/\bquiet|hear each other|actually talk|conversation friendly|quiet enough to talk\b/.test(text)) noise = "quiet";
  else if (/\blively|energetic|dj|dancing\b/.test(text)) noise = "lively";

  return { vibes: uniq(vibes), subjectiveTerms: uniq(subjectiveTerms), budget, noise };
}

export function ambiguityReasons(query: string, relationship: ReturnType<typeof detectVenueRelationship>, restaurantSignal: boolean, activitySignal: boolean) {
  const text = q(query);
  const reasons: string[] = [];
  if (restaurantSignal && activitySignal && relationship.type === "any" && /\band\b/.test(text)) reasons.push("mixed_domains_joined_by_ambiguous_and");
  if (/\b(?:something|somewhere|someplace|anything)\b/.test(text) && /\b(?:nice|fun|good|different|interesting|social|active|creative|vibe)\b/.test(text)) reasons.push("subjective_open_ended_request");
  if (/\bmaybe\b|\bpreferably\b|\bideally\b/.test(text)) reasons.push("soft_relationship_language");
  return reasons;
}

export function applyConversationalRefinement(previous: SearchPlan | null | undefined, query: string) {
  if (!previous) return null;
  const text = q(query);
  const looksLikeRefinement = text.split(" ").length <= 14 && /\b(?:cheaper|closer|quieter|livelier|no |not |without |walking|walkable|same place|different place|instead)\b/.test(text);
  if (!looksLikeRefinement) return null;
  return { previous, query: text };
}
