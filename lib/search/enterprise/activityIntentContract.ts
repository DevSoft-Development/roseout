import type { SearchIntent } from "./types";
import {
  detectCanonicalActivityEvidence,
} from "./activityIntentContract-core";

export * from "./activityIntentContract-core";

function unique(values: readonly string[]) {
  return Array.from(
    new Set(values.map((value) => value.toLowerCase().trim()).filter(Boolean)),
  );
}

/**
 * Reconcile explicit restaurant + activity intent without broadening a parser
 * result that already contains specific activity terms.
 *
 * Canonical expansion is a recovery path: it fills an activity lane that an
 * intermediate parser result lost. If the parser already preserved explicit
 * terms (for example hookah/shisha), those exact terms remain authoritative.
 */
export function reconcileExplicitActivityIntent(
  query: string,
  intent: SearchIntent,
): SearchIntent {
  const activity = detectCanonicalActivityEvidence(query);
  if (!activity.matched || intent.needsRestaurant !== true) return intent;

  const existingActivityTerms = intent.activityIntent?.activityTerms ?? [];
  const activityTerms = existingActivityTerms.length
    ? existingActivityTerms
    : activity.terms;
  const sameVenuePreferred =
    /\b(?:restaurant|dinner|brunch|lunch|breakfast|dining)\b[^.?!]{0,80}\bwith\b/i.test(
      query,
    ) || intent.sameVenuePreferred === true;

  return {
    ...intent,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    pairRequested: true,
    normalizedIntent: "paired_outing",
    sameVenuePreferred,
    sameLocationRequired: false,
    fallbackPairAllowed: true,
    activityIntent: {
      ...intent.activityIntent,
      activityTerms: unique(activityTerms),
      categoryTerms: unique([
        ...(intent.activityIntent?.categoryTerms ?? []),
        ...activity.categories,
      ]),
    },
    pairingPreference: {
      requiresPairing: true,
      distanceMode: intent.pairingPreference?.distanceMode ?? "any",
      maxPairDistanceMiles:
        intent.pairingPreference?.maxPairDistanceMiles ?? null,
      maxPairWalkingMinutes:
        intent.pairingPreference?.maxPairWalkingMinutes ?? null,
      requireWalkablePair:
        intent.pairingPreference?.requireWalkablePair ?? false,
    },
  };
}
