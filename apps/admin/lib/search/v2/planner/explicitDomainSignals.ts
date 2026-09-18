import { detectDomainNegation } from "./domainNegation";

export type ExplicitDomainSignals = Readonly<{
  restaurant: boolean;
  activity: boolean;
  restaurantEvidence: readonly string[];
  activityEvidence: readonly string[];
}>;

const RESTAURANT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["restaurant", /\brestaurants?\b/i],
  ["meal", /\b(?:breakfast|brunch|lunch|dinner|supper)\b/i],
  ["food", /\b(?:food|eat|eating|meal|takeout|take-away|fast casual|quick bite)\b/i],
  ["cuisine", /\b(?:sushi|italian|mexican|chinese|japanese|thai|indian|halal|steak|seafood|pizza|tacos?|burgers?)\b/i],
  ["dish", /\bpasta\b/i],
];

const ACTIVITY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["activity", /\b(?:activity|activities|things? to do)\b/i],
  ["open_ended_activity", /\b(?:something|somewhere|anything)\s+(?:fun|interesting|different|active|creative)?\s*(?:nearby\s+|close by\s+)?to\s+do\b|\bsomething\s+(?:fun|interesting|different|active|creative)\b/i],
  ["second_stop", /\b(?:and|then|afterward|afterwards|after)\s+(?:something|somewhere|anything)\b.{0,35}\b(?:do|activity|fun)\b/i],
  ["event", /\bevents?\b/i],
  ["escape_room", /\bescape rooms?\b/i],
  ["karaoke", /\bkaraoke\b/i],
  ["live_music", /\b(?:live music|live jazz|jazz music|jazz performance|jazz club|jazz show)\b/i],
  ["show", /\b(?:comedy show|broadway show|theater|theatre|concert)\b/i],
  ["game_activity", /\b(?:bowling|mini golf|pottery class|paint and sip|arcade|museum|gallery|dancing|dance club)\b/i],
];

function evidenceFor(query: string, patterns: ReadonlyArray<readonly [string, RegExp]>) {
  return patterns.filter(([, pattern]) => pattern.test(query)).map(([label]) => label);
}

export function detectExplicitDomainSignals(query: string): ExplicitDomainSignals {
  const normalized = String(query ?? "").trim();
  const negation = detectDomainNegation(normalized);
  const restaurantEvidence = negation.restaurant ? [] : evidenceFor(normalized, RESTAURANT_PATTERNS);
  const activityEvidence = negation.activity ? [] : evidenceFor(normalized, ACTIVITY_PATTERNS);
  return {
    restaurant: restaurantEvidence.length > 0,
    activity: activityEvidence.length > 0,
    restaurantEvidence,
    activityEvidence,
  };
}

export function detectPlannerDomainLoss(query: string, plan: { restaurant?: { required?: boolean }; activity?: { required?: boolean } }) {
  const explicit = detectExplicitDomainSignals(query);
  const lostRestaurant = explicit.restaurant && plan.restaurant?.required !== true;
  const lostActivity = explicit.activity && plan.activity?.required !== true;
  return {
    explicit,
    lostRestaurant,
    lostActivity,
    valid: !lostRestaurant && !lostActivity,
  };
}
