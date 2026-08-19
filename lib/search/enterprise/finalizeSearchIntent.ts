import type { SearchIntent } from "./types";
import { reconcileExplicitActivityIntent } from "./activityIntentContract";

export type FinalizeSearchIntentInput = Readonly<{
  query: string;
  intent: SearchIntent;
  selectedLane: "auto" | "restaurant" | "activity" | "mixed";
}>;

function completePairingPreference(
  intent: SearchIntent,
  requiresPairing: boolean,
): SearchIntent["pairingPreference"] {
  return {
    requiresPairing,
    distanceMode: intent.pairingPreference?.distanceMode ?? "any",
    maxPairDistanceMiles:
      intent.pairingPreference?.maxPairDistanceMiles ?? null,
    maxPairWalkingMinutes:
      intent.pairingPreference?.maxPairWalkingMinutes ?? null,
    requireWalkablePair:
      intent.pairingPreference?.requireWalkablePair ?? false,
  };
}

function applySelectedLane(
  intent: SearchIntent,
  lane: FinalizeSearchIntentInput["selectedLane"],
): SearchIntent {
  if (lane === "restaurant") {
    return {
      ...intent,
      searchType: "restaurant",
      primaryDomain: "restaurant",
      needsRestaurant: true,
      needsActivity: false,
      wantsPairing: false,
      pairRequested: false,
      sameLocationRequired: false,
      fallbackPairAllowed: false,
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (lane === "activity") {
    return {
      ...intent,
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      pairRequested: false,
      sameLocationRequired: false,
      fallbackPairAllowed: false,
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (lane === "mixed") {
    return {
      ...intent,
      searchType: "mixed_outing",
      primaryDomain: "mixed",
      needsRestaurant: true,
      needsActivity: true,
      wantsPairing: true,
      pairRequested: true,
      sameLocationRequired: false,
      fallbackPairAllowed: true,
      pairingPreference: completePairingPreference(intent, true),
    };
  }

  return intent;
}

function normalizeQuery(query: string) {
  return String(query || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasExplicitRestaurantOnlyLanguage(query: string) {
  const q = normalizeQuery(query);
  return /\b(restaurant|restaurants|dinner|brunch|lunch|breakfast|food|eat|dining|steakhouse|sushi|pizza|tacos?|italian|mexican|seafood)\b/.test(q);
}

function hasExplicitActivityOnlyLanguage(query: string) {
  const q = normalizeQuery(query);
  return /\b(activity|activities|things? to do|date ideas?|date activities|bowling|karaoke|museum|arcade|comedy|escape room|mini golf|paint and sip|spa|theater|theatre)\b/.test(q);
}

function hasNaturalBroadDateLanguage(query: string) {
  const q = normalizeQuery(query);
  return (
    /\b(?:go|going|went|want|wants|wanted|plan|planning|planned|take|taking|took|looking|find|finding|need|needs|book|booking)\b[^.?!]{0,45}\b(?:on )?(?:a |an )?(?:romantic )?date\b/.test(q) ||
    /\b(?:a |an )?(?:romantic )?date\s+(?:in|near|around|at|for)\b/.test(q) ||
    /\b(?:date night|first date|romantic date|anniversary date|couples night|double date)\b/.test(q)
  );
}

function applyBroadDateOutingFallback(query: string, intent: SearchIntent): SearchIntent {
  if (!hasNaturalBroadDateLanguage(query)) return intent;

  const explicitRestaurant = hasExplicitRestaurantOnlyLanguage(query);
  const explicitActivity = hasExplicitActivityOnlyLanguage(query);

  if (explicitRestaurant && !explicitActivity) {
    return {
      ...intent,
      searchType: "restaurant",
      primaryDomain: "restaurant",
      needsRestaurant: true,
      needsActivity: false,
      wantsPairing: false,
      pairRequested: false,
      sameLocationRequired: false,
      fallbackPairAllowed: false,
      normalizedIntent: "restaurant_only",
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (explicitActivity && !explicitRestaurant) {
    return {
      ...intent,
      searchType: "activity",
      primaryDomain: "activity",
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      pairRequested: false,
      sameLocationRequired: false,
      fallbackPairAllowed: false,
      normalizedIntent: "activity_only",
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (explicitRestaurant && explicitActivity) return intent;

  return {
    ...intent,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    pairRequested: true,
    sameLocationRequired: false,
    fallbackPairAllowed: true,
    normalizedIntent: "paired_outing",
    pairingIntent: "nearby_pair",
    pairingPreference: completePairingPreference(intent, true),
  };
}

function enforceFinalLaneInvariants(intent: SearchIntent): SearchIntent {
  const searchType = String(intent.searchType ?? "").toLowerCase();
  const normalizedIntent = String(intent.normalizedIntent ?? "").toLowerCase();

  if (
    intent.primaryDomain === "restaurant" ||
    searchType === "restaurant" ||
    searchType === "restaurant_only" ||
    normalizedIntent === "restaurant_only"
  ) {
    return {
      ...intent,
      needsRestaurant: true,
      needsActivity: false,
      wantsPairing: false,
      pairRequested: false,
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (
    intent.primaryDomain === "activity" ||
    searchType === "activity" ||
    searchType === "activity_only" ||
    normalizedIntent === "activity_only"
  ) {
    return {
      ...intent,
      needsRestaurant: false,
      needsActivity: true,
      wantsPairing: false,
      pairRequested: false,
      pairingPreference: completePairingPreference(intent, false),
    };
  }

  if (
    intent.primaryDomain === "mixed" ||
    searchType === "mixed_outing" ||
    normalizedIntent === "paired_outing"
  ) {
    return {
      ...intent,
      needsRestaurant: true,
      needsActivity: true,
      wantsPairing: true,
      pairRequested: true,
      pairingPreference: completePairingPreference(intent, true),
    };
  }

  return intent;
}

/**
 * The only allowed finalization step for enterprise/public search intent.
 * Parser sources may propose an intent, but none may return directly.
 *
 * Important: a provisional same_location_combo created from the word "with"
 * is not authoritative when the query contains explicit activity evidence.
 * In that case reconciliation preserves both domains, keeps same venue as a
 * preference, clears sameLocationRequired, and allows nearby fallback pairing.
 *
 * Broad natural date requests are also normalized here so wording such as
 * "go on a date in Queens" or "plan a date near me" cannot collapse into an
 * empty restaurant-only lane. This rule is geo-agnostic and applies globally.
 */
export function finalizeSearchIntent(
  input: FinalizeSearchIntentInput,
): SearchIntent {
  const laneAdjusted = applySelectedLane(input.intent, input.selectedLane);
  if (input.selectedLane !== "auto") {
    return enforceFinalLaneInvariants(laneAdjusted);
  }

  const reconciled = reconcileExplicitActivityIntent(input.query, laneAdjusted);
  const broadDateAdjusted = applyBroadDateOutingFallback(input.query, reconciled);
  return enforceFinalLaneInvariants(broadDateAdjusted);
}
