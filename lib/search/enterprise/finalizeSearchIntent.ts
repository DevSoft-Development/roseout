import type { SearchIntent } from "./types";
import { reconcileExplicitActivityIntent } from "./activityIntentContract";

export type FinalizeSearchIntentInput = Readonly<{
  query: string;
  intent: SearchIntent;
  selectedLane: "auto" | "restaurant" | "activity" | "mixed";
}>;

function applySelectedLane(intent: SearchIntent, lane: FinalizeSearchIntentInput["selectedLane"]): SearchIntent {
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
      pairingPreference: {
        ...intent.pairingPreference,
        requiresPairing: false,
      },
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
      pairingPreference: {
        ...intent.pairingPreference,
        requiresPairing: false,
      },
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
      pairingPreference: {
        ...intent.pairingPreference,
        requiresPairing: true,
      },
    };
  }

  return intent;
}

/**
 * The only allowed finalization step for enterprise/public search intent.
 * Parser sources may propose an intent, but none may return directly.
 */
export function finalizeSearchIntent(input: FinalizeSearchIntentInput): SearchIntent {
  const laneAdjusted = applySelectedLane(input.intent, input.selectedLane);
  if (input.selectedLane !== "auto") return laneAdjusted;
  return reconcileExplicitActivityIntent(input.query, laneAdjusted);
}
