import type { LocationIntelligenceProfile } from "./locationIntelligence";

export type SearchDomain = "restaurant" | "activity" | "nightlife";
export type ConstraintStrength = "hard" | "strong" | "soft";
export type TravelMode = "walking" | "driving" | "transit" | "unspecified";

export interface SearchConstraint<T = unknown> {
  key: string;
  value: T;
  strength: ConstraintStrength;
  source: "explicit" | "inferred" | "system";
  confidence: number;
}

export interface SearchAnchor {
  entityId: string | null;
  label: string;
  entityType: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
}

export interface SearchIntentGraph {
  contractVersion: "search-intent-v3-alpha.1";
  rawQuery: string;
  domains: readonly SearchDomain[];
  primaryDomain: SearchDomain | null;
  constraints: readonly SearchConstraint[];
  anchor: SearchAnchor | null;
  travelMode: TravelMode;
  maxTravelMinutes: number | null;
  occasion: string | null;
  partySize: number | null;
  sequencing: "single" | "before" | "after" | "then" | "same_venue" | null;
  ambiguity: {
    requiresClarification: boolean;
    unresolved: readonly string[];
  };
  metadata: Readonly<Record<string, unknown>>;
}

export interface SearchV3Request {
  requestId: string;
  query: string;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  selectedMarketId?: string | null;
  limit?: number;
  context?: Readonly<Record<string, unknown>>;
}

export interface RetrievalCandidate {
  locationId: string;
  lane: string;
  rank: number;
  score?: number | null;
  evidence?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface RetrievalLaneResult {
  lane: string;
  candidates: readonly RetrievalCandidate[];
  elapsedMs: number;
  truncated?: boolean;
}

export interface SearchEligibilityRejection {
  locationId: string;
  reasons: readonly string[];
}

export interface SearchEligibilityResult {
  eligibleLocationIds: readonly string[];
  rejected: readonly SearchEligibilityRejection[];
}

export interface SearchCandidate {
  locationId: string;
  intelligence: LocationIntelligenceProfile;
  retrieval: readonly RetrievalCandidate[];
  frameworkScore: number | null;
  finalRank: number | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface SearchRoutePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export type SearchRouteConfidence = "verified" | "estimated" | "unknown";

export interface SearchRouteMatrixEntry {
  originId: string;
  destinationId: string;
  distanceMiles: number | null;
  durationMinutes: number | null;
  source: string;
  confidence: SearchRouteConfidence;
}

export interface SearchRouteMatrixResult {
  providerId: string;
  mode: TravelMode;
  entries: readonly SearchRouteMatrixEntry[];
}

export type SearchOutingSequence =
  | "restaurant_then_activity"
  | "activity_then_restaurant"
  | "same_venue";

export interface SearchOuting {
  outingId: string;
  restaurant: SearchCandidate;
  activity: SearchCandidate;
  score: number;
  distanceMiles: number | null;
  travelMinutes: number | null;
  travelMode: TravelMode;
  sequence: SearchOutingSequence;
  reasons: readonly string[];
  metadata: Readonly<{
    pairingProvider: string;
    scoreComponents: Readonly<{
      relevance: number;
      proximity: number;
      intent: number;
      quality: number;
      diversity: number;
    }>;
    scoreWeights: Readonly<{
      relevance: number;
      proximity: number;
      intent: number;
      quality: number;
      diversity: number;
    }>;
    withinTravelLimit: boolean | null;
    routeSource: string;
    routeConfidence: SearchRouteConfidence;
    straightLineMiles: number | null;
    routeDistanceMiles: number | null;
  } & Record<string, unknown>>;
}

export interface SearchV3TraceEvent {
  stage: string;
  status: "started" | "completed" | "skipped" | "failed";
  elapsedMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchV3Execution {
  contractVersion: "search-execution-v3-alpha.1";
  requestId: string;
  query: string;
  intent: SearchIntentGraph;
  retrieval: readonly RetrievalLaneResult[];
  candidates: readonly SearchCandidate[];
  outings: readonly SearchOuting[];
  trace: readonly SearchV3TraceEvent[];
  metadata: {
    candidateCount: number;
    eligibleCount: number;
    rejectedCount: number;
    hydratedCount: number;
    outingCount: number;
    retrievalFailureCount?: number;
    orchestrationVersion: string;
  };
}
