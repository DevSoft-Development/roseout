import type { GeoMatchTier } from "../geo/geoPolicy";
import type { SearchMode } from "../planner/searchPlanTypes";
import type { ScoredCandidate } from "../scoring/scoringTypes";
import type { SearchPair } from "../pairing/pairingTypes";

export type FallbackReason =
  | "no_strong_same_venue_match"
  | "missing_activity_role"
  | "missing_restaurant_role"
  | "no_pairs_within_distance"
  | "no_pairs_within_geography"
  | "no_candidates_retrieved"
  | "nearby_geo_used"
  | "broader_geo_used"
  | "partial_restaurants_only"
  | "partial_activities_only"
  | "no_valid_results";

export type GeoResolution = {
  servedTier: Exclude<GeoMatchTier, "outside_scope"> | null;
  exactCandidateCount: number;
  nearbyCandidateCount: number;
  broaderCandidateCount: number;
  fallbackUsed: boolean;
  nearbyFallbackUsed: boolean;
  broaderFallbackUsed: boolean;
};

export type ResolvedSearchResult = {
  requestedMode: SearchMode;
  resolvedMode: SearchMode;
  used: boolean;
  reason: FallbackReason | null;
  requestFulfilled: boolean;
  partialResults: boolean;
  restaurants: ScoredCandidate[];
  activities: ScoredCandidate[];
  builderRestaurants: ScoredCandidate[];
  builderActivities: ScoredCandidate[];
  sameVenueResults: ScoredCandidate[];
  pairs: SearchPair[];
  retrievedCandidates: number;
  geoResolution?: GeoResolution;
};
