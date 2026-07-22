export type PublicSearchStatus =
  | "success"
  | "empty"
  | "limited"
  | "invalid_request"
  | "temporarily_unavailable"
  | "timeout"
  | "failed";

export type PublicSearchErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
};

export type PublicSearchCounts = {
  restaurants: number;
  activities: number;
  pairs: number;
  cards: number;
};

export type PublicSearchResponse = {
  success: boolean;
  status: PublicSearchStatus;
  requestId: string;
  restaurants: unknown[];
  activities: unknown[];
  pairs: unknown[];
  cards: unknown[];
  counts: PublicSearchCounts;
  error: PublicSearchErrorBody | null;
  debug?: Record<string, unknown>;
  [legacyField: string]: unknown;
};

export type PublicSearchRequest = {
  rawBody: Record<string, unknown>;
  query: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number | null;
  useCurrentLocation: boolean;
  debug: boolean;
  anonymousId: string | null;
  betaAssignmentId: string | null;
  betaTesterId: string | null;
};
