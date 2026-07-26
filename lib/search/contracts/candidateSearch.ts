import type {
  EnterpriseLocation,
  GeoStrictness,
  SearchIntent,
  SearchType,
} from "@/lib/search/enterprise/types";

import {
  SEARCH_CANDIDATE_CONTRACT_VERSION,
  assertSearchCandidateContractVersion,
  type SearchCandidateContractVersion,
} from "./searchContractVersion";

export type CandidateSearchProvider = "app";

export type CandidateSearchDomain = "restaurant" | "activity";

export type CandidateCoordinates = {
  latitude: number;
  longitude: number;
};

export type CandidateMarket = {
  selectedMarketId: string | null;
  requestedMarket: string | null;
  resolvedMarket: string | null;
  state: string | null;
  city: string | null;
  borough: string | null;
  neighborhood: string | null;
  county: string | null;
  region: string | null;
  geoStrictness: GeoStrictness;
  radiusMiles: number | null;
};

export type CandidateSearchIntent = {
  rawQuery: string;
  searchType: SearchType;
  primaryDomain: SearchIntent["primaryDomain"];
  needsRestaurant: boolean;
  needsActivity: boolean;
  wantsPairing: boolean;
  strictness: SearchIntent["strictness"];

  restaurantIntent: SearchIntent["restaurantIntent"];
  activityIntent: SearchIntent["activityIntent"];
  activityPairIntent?: SearchIntent["activityPairIntent"];

  pairingPreference?: SearchIntent["pairingPreference"];

  occasion?: string | null;
  partySize?: number | null;
  budget?: string | null;
  vibe: string[];

  geo: SearchIntent["geo"];
};

export type CandidateSearchRequest = {
  contractVersion: SearchCandidateContractVersion;
  requestId: string;
  query: string;
  intent: CandidateSearchIntent;
  market: CandidateMarket;
  userLocation: CandidateCoordinates | null;
  restaurantLimit: number;
  activityLimit: number;
};

export type CandidateSearchTiming = {
  totalMs: number;
  restaurantQueryMs: number | null;
  activityQueryMs: number | null;
};

export type CandidateSearchMetadata = {
  provider: CandidateSearchProvider;
  truncated: boolean;
  restaurantTruncated: boolean;
  activityTruncated: boolean;
  candidateFallbackUsed: boolean;
};

export type CandidateSearchResponse = {
  contractVersion: SearchCandidateContractVersion;
  requestId: string;
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  timing: CandidateSearchTiming;
  metadata: CandidateSearchMetadata;
};

export type CreateCandidateSearchRequestInput = {
  requestId: string;
  query: string;
  intent: SearchIntent;
  selectedMarketId?: string | null;
  userLocation?: CandidateCoordinates | null;
  restaurantLimit?: number;
  activityLimit?: number;
};

const DEFAULT_RESTAURANT_LIMIT = 50;
const DEFAULT_ACTIVITY_LIMIT = 50;
const MAX_CANDIDATE_LIMIT = 100;

export function createCandidateSearchRequest(
  input: CreateCandidateSearchRequestInput,
): CandidateSearchRequest {
  const requestId = normalizeRequiredString(input.requestId, "requestId");
  const query = normalizeRequiredString(input.query, "query");
  const intent = input.intent;

  if (!intent || typeof intent !== "object") {
    throw new TypeError("Candidate search requires a normalized SearchIntent.");
  }

  const request: CandidateSearchRequest = {
    contractVersion: SEARCH_CANDIDATE_CONTRACT_VERSION,
    requestId,
    query,
    intent: {
      rawQuery: intent.rawQuery,
      searchType: intent.searchType,
      primaryDomain: intent.primaryDomain,
      needsRestaurant: intent.needsRestaurant,
      needsActivity: intent.needsActivity,
      wantsPairing: intent.wantsPairing,
      strictness: intent.strictness,

      restaurantIntent: intent.restaurantIntent,
      activityIntent: intent.activityIntent,
      activityPairIntent: intent.activityPairIntent,

      pairingPreference: intent.pairingPreference,

      occasion: intent.occasion ?? null,
      partySize: intent.partySize ?? null,
      budget: intent.budget ?? null,
      vibe: Array.isArray(intent.vibe) ? intent.vibe : [],

      geo: intent.geo,
    },
    market: {
      selectedMarketId: normalizeOptionalString(input.selectedMarketId),
      requestedMarket: normalizeOptionalString(intent.geo.requestedMarket),
      resolvedMarket: normalizeOptionalString(intent.geo.resolvedMarket),
      state: normalizeOptionalString(intent.geo.state),
      city: normalizeOptionalString(intent.geo.city),
      borough: normalizeOptionalString(intent.geo.borough),
      neighborhood: normalizeOptionalString(intent.geo.neighborhood),
      county: normalizeOptionalString(intent.geo.county),
      region: normalizeOptionalString(intent.geo.region),
      geoStrictness: intent.geo.geoStrictness,
      radiusMiles: finiteNumberOrNull(intent.geo.radiusMiles),
    },
    userLocation: normalizeCoordinates(input.userLocation),
    restaurantLimit: normalizeCandidateLimit(
      input.restaurantLimit,
      DEFAULT_RESTAURANT_LIMIT,
    ),
    activityLimit: normalizeCandidateLimit(
      input.activityLimit,
      DEFAULT_ACTIVITY_LIMIT,
    ),
  };

  validateCandidateSearchRequest(request);

  return request;
}

export function validateCandidateSearchRequest(
  request: CandidateSearchRequest,
): void {
  if (!request || typeof request !== "object") {
    throw new TypeError("Candidate search request must be an object.");
  }

  assertSearchCandidateContractVersion(request.contractVersion);

  normalizeRequiredString(request.requestId, "requestId");
  normalizeRequiredString(request.query, "query");

  if (!request.intent || typeof request.intent !== "object") {
    throw new TypeError("Candidate search request is missing intent.");
  }

  if (
    request.intent.needsRestaurant !== true &&
    request.intent.needsActivity !== true
  ) {
    throw new TypeError(
      "Candidate search intent must request at least one search domain.",
    );
  }

  validateLimit(request.restaurantLimit, "restaurantLimit");
  validateLimit(request.activityLimit, "activityLimit");
}

export function validateCandidateSearchResponse(
  response: CandidateSearchResponse,
  expectedRequestId?: string,
): void {
  if (!response || typeof response !== "object") {
    throw new TypeError("Candidate search response must be an object.");
  }

  assertSearchCandidateContractVersion(response.contractVersion);

  normalizeRequiredString(response.requestId, "response.requestId");

  if (
    expectedRequestId &&
    response.requestId !== expectedRequestId
  ) {
    throw new Error(
      `Candidate search response requestId mismatch. Expected ${expectedRequestId}; received ${response.requestId}.`,
    );
  }

  if (!Array.isArray(response.restaurants)) {
    throw new TypeError(
      "Candidate search response restaurants must be an array.",
    );
  }

  if (!Array.isArray(response.activities)) {
    throw new TypeError(
      "Candidate search response activities must be an array.",
    );
  }

  if (!response.timing || typeof response.timing !== "object") {
    throw new TypeError("Candidate search response is missing timing.");
  }

  if (!response.metadata || typeof response.metadata !== "object") {
    throw new TypeError("Candidate search response is missing metadata.");
  }
}

export function candidateSearchDomains(
  request: CandidateSearchRequest,
): CandidateSearchDomain[] {
  const domains: CandidateSearchDomain[] = [];

  if (request.intent.needsRestaurant) {
    domains.push("restaurant");
  }

  if (request.intent.needsActivity) {
    domains.push("activity");
  }

  return domains;
}

export function toEnterpriseSearchIntent(
  request: CandidateSearchRequest,
): SearchIntent {
  validateCandidateSearchRequest(request);

  return {
    ...request.intent,
    rawQuery: request.query,
    geo: {
      ...request.intent.geo,
      requestedMarket:
        request.market.requestedMarket ??
        request.intent.geo.requestedMarket ??
        null,
      resolvedMarket:
        request.market.resolvedMarket ??
        request.intent.geo.resolvedMarket ??
        null,
      state: request.market.state ?? request.intent.geo.state ?? null,
      city: request.market.city ?? request.intent.geo.city ?? null,
      borough: request.market.borough ?? request.intent.geo.borough ?? null,
      neighborhood:
        request.market.neighborhood ??
        request.intent.geo.neighborhood ??
        null,
      county: request.market.county ?? request.intent.geo.county ?? null,
      region: request.market.region ?? request.intent.geo.region ?? null,
      geoStrictness: request.market.geoStrictness,
      radiusMiles:
        request.market.radiusMiles ??
        request.intent.geo.radiusMiles ??
        null,
      latitude:
        request.userLocation?.latitude ??
        request.intent.geo.latitude ??
        null,
      longitude:
        request.userLocation?.longitude ??
        request.intent.geo.longitude ??
        null,
    },
  };
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCoordinates(
  coordinates: CandidateCoordinates | null | undefined,
): CandidateCoordinates | null {
  if (!coordinates) return null;

  const latitude = finiteNumberOrNull(coordinates.latitude);
  const longitude = finiteNumberOrNull(coordinates.longitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  if (latitude < -90 || latitude > 90) {
    throw new RangeError("Candidate latitude must be between -90 and 90.");
  }

  if (longitude < -180 || longitude > 180) {
    throw new RangeError(
      "Candidate longitude must be between -180 and 180.",
    );
  }

  return {
    latitude,
    longitude,
  };
}

function normalizeCandidateLimit(
  value: unknown,
  fallback: number,
): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(MAX_CANDIDATE_LIMIT, Math.floor(numberValue)),
  );
}

function validateLimit(value: unknown, field: string): void {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 1 ||
    numberValue > MAX_CANDIDATE_LIMIT
  ) {
    throw new RangeError(
      `${field} must be an integer between 1 and ${MAX_CANDIDATE_LIMIT}.`,
    );
  }
}