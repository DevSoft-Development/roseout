export type DomainNegation = Readonly<{
  restaurant: boolean;
  activity: boolean;
  restaurantEvidence: readonly string[];
  activityEvidence: readonly string[];
}>;

const RESTAURANT_NEGATIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ["not_looking_for_food", /\b(?:i(?:'m| am)?\s+)?not looking for (?:food|a restaurant|restaurants?|dinner|lunch|brunch|breakfast)\b/i],
  ["no_food", /\b(?:no|without)\s+(?:food|restaurants?|dinner|lunch|brunch|breakfast|meal)\b/i],
  ["activity_only", /\b(?:activities?|things? to do)\s+only\b|\bonly\s+(?:activities?|things? to do)\b/i],
];

const ACTIVITY_NEGATIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ["no_activity_pairing", /\bno\s+(?:activity|outing)\s+pairing\b/i],
  ["no_activity", /\b(?:no|without)\s+(?:an?\s+)?(?:activity|activities|second stop|outing)\b/i],
  ["restaurant_only", /\b(?:restaurant|dinner|lunch|brunch|breakfast|meal)\s+only\b|\bonly\s+(?:a\s+)?(?:restaurant|dinner|lunch|brunch|breakfast|meal)\b/i],
];

const FALSE_NEGATION_GUARDS = [
  /\bnot only\b/i,
  /\bnot just\b[\s\S]{0,80}\b(?:but also|also|and)\b/i,
];

function evidenceFor(query: string, patterns: ReadonlyArray<readonly [string, RegExp]>) {
  return patterns.filter(([, pattern]) => pattern.test(query)).map(([label]) => label);
}

export function detectDomainNegation(query: string): DomainNegation {
  const normalized = String(query ?? "").trim();
  if (FALSE_NEGATION_GUARDS.some((pattern) => pattern.test(normalized))) {
    return { restaurant: false, activity: false, restaurantEvidence: [], activityEvidence: [] };
  }
  const restaurantEvidence = evidenceFor(normalized, RESTAURANT_NEGATIONS);
  const activityEvidence = evidenceFor(normalized, ACTIVITY_NEGATIONS);
  return {
    restaurant: restaurantEvidence.length > 0,
    activity: activityEvidence.length > 0,
    restaurantEvidence,
    activityEvidence,
  };
}
