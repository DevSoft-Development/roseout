import type { GeoMatchTier } from "../geo/geoPolicy";
import type { ScoredCandidate } from "../scoring/scoringTypes";

export type SearchPair = {
  restaurant: ScoredCandidate;
  activity: ScoredCandidate;
  distanceMiles: number | null;
  walkingMinutes: number | null;
  walkingMinutesSource: "google" | "estimated" | "unavailable";
  geoTier: Exclude<GeoMatchTier, "outside_scope">;
  isFallbackPair: boolean;
  scores: {
    restaurant: number;
    activity: number;
    distance: number;
    combinedQuality: number;
    sequence: number;
    mlPairBoost: number;
    total: number;
  };
  reasons: string[];
};
