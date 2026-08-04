import type { EnterpriseLocation } from "../../enterprise/types";
import type { GeoMatchResult, GeoScopeLevel } from "../geo/geoPolicy";
import type { SearchPlan } from "../planner/searchPlanTypes";

export type DesiredRole = "restaurant" | `${string}_activity`;
export type RetrievalRequest = {
  desiredRole: DesiredRole;
  cuisines: readonly string[];
  foods: readonly string[];
  categories: readonly string[];
  features: readonly string[];
  retrievalTerms: readonly string[];
  eligibleStorageTypes: readonly string[];
  geo: SearchPlan["geo"];
};

export type RetrievedCandidate = {
  location: EnterpriseLocation;
  retrievalSources: string[];
  matchedRetrievalTerms: string[];
  requestedRoles: string[];
  distanceMiles: number | null;
  geoMatch: GeoMatchResult;
  retrievalGeoLevel: GeoScopeLevel | null;
};

export type RetrievalResult = {
  candidates: RetrievedCandidate[];
  allCandidates: RetrievedCandidate[];
  requests: RetrievalRequest[];
  callsUsed: number;
};
