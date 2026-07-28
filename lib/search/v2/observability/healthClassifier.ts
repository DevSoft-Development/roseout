import type { PublicSearchResponseV2 } from "../response/responseTypes";

export type SearchHealthClassification = {
  fulfilled: boolean;
  restaurantFulfilled: boolean;
  activityFulfilled: boolean;
  fallbackOutcome: "not_used" | "successful" | "partial" | "failed";
  issueCodes: string[];
};

/** Canonical V2 health classification. Pair cards satisfy both role requirements. */
export function classifyV2Search(
  response: Pick<
    PublicSearchResponseV2,
    | "requestFulfilled"
    | "partialResults"
    | "requestedMode"
    | "counts"
    | "fallback"
  >,
): SearchHealthClassification {
  const pairFulfilled = response.counts.pairs > 0;
  const restaurantRequired = response.requestedMode !== "activity_only";
  const activityRequired = response.requestedMode !== "restaurant_only";
  const restaurantFulfilled =
    !restaurantRequired ||
    pairFulfilled ||
    response.counts.restaurantCards > 0 ||
    response.counts.sameVenueCards > 0;
  const activityFulfilled =
    !activityRequired ||
    pairFulfilled ||
    response.counts.activityCards > 0 ||
    response.counts.sameVenueCards > 0;
  const fulfilled =
    response.requestFulfilled || (restaurantFulfilled && activityFulfilled);
  const fallbackOutcome = !response.fallback.used
    ? "not_used"
    : fulfilled
      ? "successful"
      : response.partialResults
        ? "partial"
        : "failed";
  const issueCodes: string[] = [];
  if (!restaurantFulfilled) issueCodes.push("missing_restaurant_role");
  if (!activityFulfilled) issueCodes.push("missing_activity_role");
  if (!fulfilled && response.counts.displayedResults === 0)
    issueCodes.push("no_results");
  if (response.partialResults) issueCodes.push("partial_result");
  if (fallbackOutcome === "failed") issueCodes.push("fallback_failed");
  return {
    fulfilled,
    restaurantFulfilled,
    activityFulfilled,
    fallbackOutcome,
    issueCodes,
  };
}
