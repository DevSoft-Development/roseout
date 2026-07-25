import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./types";
import {
  buildSearchScoreBreakdown,
  detectSearchInterpretation,
  evaluateTemporalFeasibility,
  resolveRouteEvidence,
  type SearchScoreBreakdown,
} from "./phaseOneQuality";

export type RankedLocation<T extends EnterpriseLocation = EnterpriseLocation> = T & {
  searchScoreBreakdown: SearchScoreBreakdown;
  phaseTwoScore: number;
};

export function rankLocationsWithQualitySignals<T extends EnterpriseLocation>(
  locations: T[],
  intent: SearchIntent,
): RankedLocation<T>[] {
  return locations
    .map((location) => {
      const searchScoreBreakdown = buildSearchScoreBreakdown(location, intent);
      return {
        ...location,
        searchScoreBreakdown,
        phaseTwoScore: searchScoreBreakdown.final,
      };
    })
    .sort((a, b) => b.phaseTwoScore - a.phaseTwoScore);
}

export type RankedPair<T extends EnterprisePair = EnterprisePair> = T & {
  routeEvidence: ReturnType<typeof resolveRouteEvidence>;
  temporalFeasibility: ReturnType<typeof evaluateTemporalFeasibility>;
  interpretation: ReturnType<typeof detectSearchInterpretation>;
  phaseTwoScore: number;
};

export function rankPairsWithQualitySignals<T extends EnterprisePair>({
  pairs,
  intent,
  outingDateTimeISO,
}: {
  pairs: T[];
  intent: SearchIntent;
  outingDateTimeISO?: string | null;
}): RankedPair<T>[] {
  const interpretation = detectSearchInterpretation(intent);

  return pairs
    .map((pair) => {
      const routeEvidence = resolveRouteEvidence(pair);
      const temporalFeasibility = evaluateTemporalFeasibility({
        pair,
        outingDateTimeISO,
      });
      const restaurantScore = buildSearchScoreBreakdown(pair.restaurant, intent).final;
      const activityScore = buildSearchScoreBreakdown(pair.activity, intent).final;
      const routeBonus = routeEvidence.confidence === "verified" ? 15 : routeEvidence.confidence === "estimated" ? 5 : 0;
      const temporalPenalty = temporalFeasibility.status === "infeasible" ? -250 : 0;
      const interpretationBonus = interpretation.interpretation === "two_stop" ? 10 : 0;

      return {
        ...pair,
        routeEvidence,
        temporalFeasibility,
        interpretation,
        phaseTwoScore:
          restaurantScore +
          activityScore +
          routeBonus +
          temporalPenalty +
          interpretationBonus,
      };
    })
    .sort((a, b) => b.phaseTwoScore - a.phaseTwoScore);
}
