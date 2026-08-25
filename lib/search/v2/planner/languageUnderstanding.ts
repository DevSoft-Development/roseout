import type { SearchPlan, VenueRelationshipType } from "./searchPlanTypes";

const uniq = (items: string[]) => [...new Set(items.filter(Boolean))];
const q = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

export function detectVenueRelationship(query: string) {
  const text = q(query);
  const evidence: string[] = [];
  let type: VenueRelationshipType = "any";

  const sameVenueRequired = /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place)\b/.test(text);
  const sameVenueFeature = /\b(?:restaurant|dinner|brunch|lunch|food|dining)\b.{0,45}\b(?:with|has|having|serves?|offering|that has)\b.{0,30}\b(?:hookah|shisha|rooftop|live music|cocktails?|dj)\b/.test(text)
    || /\b(?:hookah|shisha|rooftop)\s+(?:restaurant|cafe)\b/.test(text);
  const sequential = /\b(?:then|and then|followed by|afterward|afterwards|after|before)\b/.test(text);
  const proximity = /\b(?:nearby|near|close to|within walking distance|walking distance)\b/.test(text);
  const separate = /\b(?:separate venues?|different places?|another place|somewhere else)\b/.test(text);

  if (sameVenueRequired) { type = "same_venue_required"; evidence.push("explicit_same_venue"); }
  else if (sameVenueFeature) { type = "same_venue_required"; evidence.push("feature_bound_to_restaurant"); }
  else if (sequential) { type = "sequential"; evidence.push("sequence_connector"); }
  else if (separate) { type = "separate_venues"; evidence.push("explicit_separate_venues"); }
  else if (proximity) { type = "proximity"; evidence.push("proximity_connector"); }
  else if (/\b(?:preferably|ideally)\b.{0,40}\b(?:same place|same venue|one place)\b/.test(text)) { type = "same_venue_preferred"; evidence.push("preferred_same_venue"); }

  return { type, evidence, sameVenueFeature };
}

export function extractNegativeConstraints(query: string) {
  const text = q(query);
  const restaurant: string[] = [];
  const activity: string[] = [];
  const vibes: string[] = [];
  const geo: string[] = [];

  const activityTerms = ["bowling", "karaoke", "arcade", "museum", "comedy", "mini golf", "hookah", "nightclub", "club", "bar", "lounge", "theater", "movie"];
  for (const term of activityTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:no|not|without|anything but|except)\\s+(?:a\\s+|an\\s+)?${escaped}\\b`).test(text)) activity.push(term.replace(/ /g, "_"));
  }

  const foodTerms = ["seafood", "sushi", "steak", "italian", "mexican", "halal", "vegan", "wings", "chicken"];
  for (const term of foodTerms) {
    if (new RegExp(`\\b(?:no|not|without|anything but|except)\\s+${term}\\b`).test(text)) restaurant.push(term);
  }

  if (/\b(?:not|nothing|somewhere not|don't want|do not want).{0,15}\b(?:loud|too loud|clubby)\b/.test(text) || /\bquiet enough to talk\b/.test(text)) vibes.push("loud", "party");
  if (/\b(?:not|nothing|somewhere not).{0,15}\b(?:formal|stuffy|pretentious)\b/.test(text)) vibes.push("formal", "stuffy", "pretentious");
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

  if (/\bcheap|affordable|budget|inexpensive|not expensive\b/.test(text)) budget = "budget";
  else if (/\bnot too expensive|moderate|mid[- ]range|reasonably priced\b/.test(text)) budget = "moderate";
  else if (/\bluxury|premium|high end|high-end|splurge\b/.test(text)) budget = "premium";

  if (/\bquiet|hear each other|actually talk|conversation friendly\b/.test(text)) noise = "quiet";
  else if (/\blively|energetic|dj|dancing\b/.test(text)) noise = "lively";

  return { vibes: uniq(vibes), subjectiveTerms: uniq(subjectiveTerms), budget, noise };
}

export function ambiguityReasons(query: string, relationship: ReturnType<typeof detectVenueRelationship>, restaurantSignal: boolean, activitySignal: boolean) {
  const text = q(query);
  const reasons: string[] = [];
  if (restaurantSignal && activitySignal && relationship.type === "any" && /\band\b/.test(text)) reasons.push("mixed_domains_joined_by_ambiguous_and");
  if (/\b(?:something|somewhere|anything)\b/.test(text) && /\b(?:nice|fun|good|different|interesting|vibe)\b/.test(text)) reasons.push("subjective_open_ended_request");
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
