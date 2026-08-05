import { detectExplicitDomainSignals } from "../v2/planner/explicitDomainSignals";

export type LiveSearchHealthInput = {
  rawQuery: string;
  restaurantCount: number;
  activityCount: number;
  pairCount: number;
  outcome?: string | null;
  inventoryGapConfirmed?: boolean;
};

const ACCEPTED_NO_PAIR_OUTCOMES = new Set([
  "known_inventory_gap",
  "unsupported_market",
  "anchor_not_found",
  "clarification_required",
  "expected_constraint_no_pair",
]);

export function classifyLiveSearchHealth(input: LiveSearchHealthInput) {
  const explicit = detectExplicitDomainSignals(input.rawQuery);
  const acceptedOutcome =
    input.inventoryGapConfirmed === true ||
    ACCEPTED_NO_PAIR_OUTCOMES.has(String(input.outcome ?? ""));
  const missingRestaurant = explicit.restaurant && input.restaurantCount === 0;
  const missingActivity = explicit.activity && input.activityCount === 0;
  const missingPair = explicit.restaurant && explicit.activity && input.pairCount === 0;
  const missingRequiredDomain = missingRestaurant || missingActivity;
  const healthy = !missingRequiredDomain && (!missingPair || acceptedOutcome || (input.restaurantCount > 0 && input.activityCount > 0));

  return {
    healthy,
    explicit,
    missingRestaurant,
    missingActivity,
    missingPair,
    acceptedOutcome,
    issueType: healthy
      ? null
      : missingActivity
        ? "missing_required_activity"
        : missingRestaurant
          ? "missing_required_restaurant"
          : "missing_required_pair",
  } as const;
}
