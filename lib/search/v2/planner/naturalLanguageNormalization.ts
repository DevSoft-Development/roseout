const OPEN_ACTIVITY_DESCRIPTOR = String.raw`(?:fun|interesting|different|active|creative|entertaining|social|new|unique|relaxing|relaxed|chill|low[- ]key)`;
const OPEN_SOMEWHERE_ACTIVITY = String.raw`(?:somewhere|someplace)\s+${OPEN_ACTIVITY_DESCRIPTOR}(?:\s+(?:and|or)\s+${OPEN_ACTIVITY_DESCRIPTOR})*(?:\s+to\s+(?:go|hang\s+out))?`;

const OPEN_ENDED_ACTIVITY_PATTERNS = [
  /\b(?:something|anything)\s+(?:fun|interesting|different|active|creative|entertaining|social|new|unique|relaxing|relaxed|chill|low[- ]key)(?:\s+to\s+do)?\b/i,
  /\b(?:something|anything)\s+to\s+do\b/i,
  /\b(?:things?|stuff)\s+to\s+do\b/i,
  new RegExp(`\\b${OPEN_SOMEWHERE_ACTIVITY}\\b`, "i"),
  /\b(?:live\s+)?entertainment\b/i,
  /\b(?:live\s+)?performances?\b/i,
];

const POSTPOSED_SEQUENCE_PATTERN = new RegExp(
  `\\b(?:(?:and|then)\\s+)?((?:something|anything)\\s+(?:fun|interesting|different|active|creative|entertaining|social|new|unique|relaxing|relaxed|chill|low[- ]key)(?:\\s+to\\s+do)?|(?:something|anything)\\s+to\\s+do|(?:things?|stuff)\\s+to\\s+do|${OPEN_SOMEWHERE_ACTIVITY})\\s+(?:nearby\\s+)?(?:afterward|afterwards|after\\s+that|next)\\b`,
  "i",
);
const BEVERAGE_PATTERN = /\b(?:cocktails?|drinks?|happy\s+hour|wine|beer)\b/i;
const MEAL_PATTERN = /\b(?:restaurant|restaurants|breakfast|brunch|lunch|dinner|supper|meal|food|eat|eating|dining|cuisine|steakhouse|sushi|seafood|italian|mexican|halal|vegan)\b/i;
const SEQUENCE_PATTERN = /\b(?:then|and\s+then|followed\s+by|afterward|afterwards|after\s+that|next\s+stop|before)\b/i;
const EXPLICIT_ACTIVITY_PATTERN = /\b(?:activity|activities|bowling|karaoke|arcade|museum|gallery|escape\s+room|theater|theatre|comedy|mini\s+golf|live\s+music|jazz|hookah|shisha|lounge|nightclub|dancing|dance\s+club|pottery|axe\s+throwing|spa|movie|cinema|paint\s+and\s+sip|(?:live\s+)?entertainment|(?:live\s+)?performance)\b/i;

export function hasOpenEndedActivityRequest(query: string) {
  return OPEN_ENDED_ACTIVITY_PATTERNS.some((pattern) => pattern.test(query));
}

function normalizePostposedSequence(query: string) {
  return query.replace(POSTPOSED_SEQUENCE_PATTERN, (_match, activityPhrase: string) => `then ${activityPhrase} activity`);
}

function annotateOpenEndedActivity(query: string) {
  let out = query;
  const replacements: RegExp[] = [
    /\b(?:something|anything)\s+(?:fun|interesting|different|active|creative|entertaining|social|new|unique|relaxing|relaxed|chill|low[- ]key)(?:\s+to\s+do)?\b(?!\s+activity\b)/gi,
    /\b(?:something|anything)\s+to\s+do\b(?!\s+activity\b)/gi,
    /\b(?:things?|stuff)\s+to\s+do\b(?!\s+activity\b)/gi,
    new RegExp(`\\b${OPEN_SOMEWHERE_ACTIVITY}\\b(?!\\s+activity\\b)`, "gi"),
    /\b(?:live\s+)?entertainment\b(?!\s+activity\b)/gi,
    /\b(?:live\s+)?performances?\b(?!\s+activity\b)/gi,
  ];
  for (const pattern of replacements) out = out.replace(pattern, (match) => `${match} activity`);
  return out;
}

function beverageFirstNeedsServiceLane(query: string) {
  if (MEAL_PATTERN.test(query) || !BEVERAGE_PATTERN.test(query)) return false;
  const beverage = query.search(BEVERAGE_PATTERN);
  if (beverage < 0) return false;

  const sequence = query.search(SEQUENCE_PATTERN);
  if (sequence >= 0 && beverage < sequence) {
    const tail = query.slice(sequence);
    if (EXPLICIT_ACTIVITY_PATTERN.test(tail) || hasOpenEndedActivityRequest(tail)) return true;
  }

  const afterBeverage = query.slice(beverage);
  if (/\b(?:and|with)\b/i.test(afterBeverage) && hasOpenEndedActivityRequest(afterBeverage)) {
    return true;
  }

  return new RegExp(`${BEVERAGE_PATTERN.source}[\\s\\S]{0,120}${POSTPOSED_SEQUENCE_PATTERN.source}`, "i").test(query);
}

function annotateBeverageServiceLane(query: string) {
  if (!beverageFirstNeedsServiceLane(query)) return query;
  return query.replace(BEVERAGE_PATTERN, (match) => `${match} restaurant`);
}

/**
 * Converts broad conversational phrasing into deterministic planner evidence.
 * This intentionally adds generic lane markers rather than mapping individual
 * user phrases to venue categories, so the rule applies across the search
 * system without special-casing a QA prompt.
 */
export function normalizeNaturalLanguageForPlanner(query: string) {
  const sequenced = normalizePostposedSequence(query);
  const activityAnnotated = annotateOpenEndedActivity(sequenced);
  return annotateBeverageServiceLane(activityAnnotated);
}