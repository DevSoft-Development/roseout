import type { SearchMode, SearchPlan } from "../planner/searchPlanTypes";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { resultCounts } from "./resultCounts";

export type PublicLocationCard = EnterpriseLocation & {
  searchRole?: string;
  searchScore?: number;
  whyMatched?: string;
  why_it_matched?: string;
  matchReasons?: string[];
};
export type PublicPairCard = {
  restaurant: PublicLocationCard;
  activity: PublicLocationCard;
  distanceMiles: number | null;
  walkingMinutes: number | null;
  score: number;
  whyMatched?: string;
  why_it_matched?: string;
  matchReasons?: string[];
};
export type PublicSearchResponseV2 = {
  version: "public-search-v2";
  success: boolean;
  requestFulfilled: boolean;
  partialResults: boolean;
  requestId: string;
  requestedMode: SearchMode;
  resolvedMode: SearchMode;
  displayMode: "restaurant_cards" | "activity_cards" | "same_venue_cards" | "pairs" | "partial_mixed" | "empty";
  searchPlan: SearchPlan;
  restaurants: PublicLocationCard[];
  activities: PublicLocationCard[];
  sameVenueResults: PublicLocationCard[];
  pairs: PublicPairCard[];
  counts: ReturnType<typeof resultCounts>;
  fallback: { used: boolean; reason: string | null };
  message: string;
  timing: Record<string, number>;
  ml: { enabled: boolean; modelVersion: string | null; rankingVariant: string | null; rolloutBucket: number | null };
  debug?: Record<string, unknown>;
};
