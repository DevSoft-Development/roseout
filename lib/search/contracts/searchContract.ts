export const SEARCH_CONTRACT_VERSION = "search-contract-v2";

export const MIXED_RESULT_MODES = new Set([
  "paired_outing",
  "mixed_outing",
  "same_venue",
]);

export const GEOGRAPHIC_LANDMARKS = [
  "central park",
  "prospect park",
  "bryant park",
  "times square",
  "barclays center",
  "madison square garden",
  "yankee stadium",
  "citi field",
  "rockefeller center",
  "lincoln center",
  "world trade center",
  "grand central terminal",
];

const RESTAURANT_SIGNAL = /\b(restaurant|dinner|lunch|brunch|breakfast|food|eat|steakhouse|seafood|sushi|italian|mexican|caribbean|halal)\b/i;
const ACTIVITY_SIGNAL = /\b(activity|show|comedy|karaoke|bowling|arcade|museum|lounge|music|concert|escape room|mini golf|pottery|dancing|dance|jazz|broadway|rooftop bar|hookah)\b/i;
const SEQUENCE_SIGNAL = /\b(followed by|after(?:ward)?|then|before|first|second|next stop)\b/i;
const EXPLICIT_SAME_VENUE_SIGNAL = /\b(same (?:place|venue|location)|all in one|one venue|at the restaurant|restaurant with|dinner with)\b/i;
const RESTAURANT_EXCLUSION_SIGNALS = [
  /\b(?:i\s*(?:am|['’]m)\s*)?not\s+looking\s+for\s+(?:any\s+)?(?:food|restaurants?|dinner|lunch|brunch|breakfast)(?:\s+at\s+all)?\b/gi,
  /\b(?:do\s+not|don['’]?t|dont|not)\s+(?:want|need)\s+(?:any\s+)?(?:food|restaurants?|dinner|lunch|brunch|breakfast)\b/gi,
  /\b(?:no|without)\s+(?:any\s+)?(?:food|restaurants?|dinner|lunch|brunch|breakfast)\b/gi,
];

export type SearchModeContract = {
  valid: boolean;
  expectedMixed: boolean;
  sameVenueAllowed: boolean;
  reason: string;
};

function removeRestaurantExclusions(query: string) {
  return RESTAURANT_EXCLUSION_SIGNALS.reduce(
    (normalizedQuery, exclusionSignal) => normalizedQuery.replace(exclusionSignal, " "),
    query,
  );
}

export function queryRequiresRestaurant(query: string) {
  return RESTAURANT_SIGNAL.test(removeRestaurantExclusions(query));
}

export function queryRequiresActivity(query: string) {
  return ACTIVITY_SIGNAL.test(query);
}

export function queryRequiresMixedDomains(query: string) {
  return queryRequiresRestaurant(query) && queryRequiresActivity(query);
}

export function queryExplicitlySequencesStops(query: string) {
  return SEQUENCE_SIGNAL.test(query);
}

export function queryAllowsSameVenue(query: string) {
  return EXPLICIT_SAME_VENUE_SIGNAL.test(query) && !queryExplicitlySequencesStops(query);
}

export function validateModeAgainstQuery(args: {
  query: string;
  mode: string | null;
  needsRestaurant: boolean;
  needsActivity: boolean;
  sameVenueEvidence?: boolean;
  fallbackPairCount?: number;
}) : SearchModeContract {
  const expectedRestaurant = queryRequiresRestaurant(args.query);
  const expectedActivity = queryRequiresActivity(args.query);
  const expectedMixed = expectedRestaurant && expectedActivity;
  const normalizedMixed = args.needsRestaurant && args.needsActivity;
  const mode = args.mode ?? "unknown";

  if (expectedRestaurant && !args.needsRestaurant) {
    return { valid: false, expectedMixed, sameVenueAllowed: false, reason: "The query requires a restaurant, but normalized intent removed the restaurant domain." };
  }
  if (expectedActivity && !args.needsActivity) {
    return { valid: false, expectedMixed, sameVenueAllowed: false, reason: "The query requires an activity, but normalized intent removed the activity domain." };
  }
  if (expectedMixed && !normalizedMixed) {
    return { valid: false, expectedMixed, sameVenueAllowed: false, reason: "The query requires both domains, but normalized intent is single-domain." };
  }
  if (!normalizedMixed) {
    return { valid: true, expectedMixed, sameVenueAllowed: false, reason: "Normalized mode matches a single-domain request." };
  }
  if (!MIXED_RESULT_MODES.has(mode)) {
    return { valid: false, expectedMixed, sameVenueAllowed: false, reason: "Mixed intent must use a supported mixed-result mode." };
  }
  if (mode === "same_venue") {
    const allowedByLanguage = queryAllowsSameVenue(args.query);
    const allowedByEvidence = args.sameVenueEvidence === true;
    const allowedByFallback = Number(args.fallbackPairCount ?? 0) > 0;
    if (!allowedByLanguage && !allowedByEvidence && !allowedByFallback) {
      return { valid: false, expectedMixed, sameVenueAllowed: false, reason: "Same-venue mode lacks explicit language, verified dual-role evidence, or a valid fallback pair." };
    }
    return { valid: true, expectedMixed, sameVenueAllowed: true, reason: "Same-venue mode is supported by query language or verified result evidence." };
  }
  return { valid: true, expectedMixed, sameVenueAllowed: false, reason: "Mixed intent uses a supported paired result mode." };
}

export function isGeographicLandmark(value: unknown) {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return GEOGRAPHIC_LANDMARKS.some((landmark) => normalized === landmark || normalized.endsWith(` ${landmark}`));
}

export function deriveInventoryGapStatus(args: {
  required: boolean;
  eligibleCount: number;
  rawCandidateCount?: number | null;
  rejectedCount?: number | null;
  auditStatus?: string | null;
  failureReason?: string | null;
}) {
  if (!args.required || args.eligibleCount > 0) return "not_applicable" as const;
  if (args.auditStatus === "confirmed_gap") return "confirmed_gap" as const;
  if (Number(args.rawCandidateCount ?? 0) === 0 && args.failureReason === "insufficient_domain_candidates") {
    return "probable_inventory_gap" as const;
  }
  if (Number(args.rawCandidateCount ?? 0) > 0 || Number(args.rejectedCount ?? 0) > 0) {
    return "retrieval_or_eligibility_failure" as const;
  }
  return "inconclusive" as const;
}
