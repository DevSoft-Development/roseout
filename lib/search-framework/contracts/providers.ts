import type { LocationIntelligenceProfile } from "./locationIntelligence";
import type {
  RetrievalLaneResult,
  SearchCandidate,
  SearchIntentGraph,
  SearchV3Request,
  SearchV3TraceEvent,
} from "./search";

export interface LocationIntelligenceProvider {
  readonly providerId: string;
  getLocation(locationId: string): Promise<LocationIntelligenceProfile | null>;
  getLocations(locationIds: readonly string[]): Promise<readonly LocationIntelligenceProfile[]>;
}

export interface SearchIntentProvider {
  readonly providerId: string;
  parse(request: SearchV3Request): Promise<SearchIntentGraph>;
}

export interface SearchRetrievalProvider {
  readonly providerId: string;
  retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult>;
}

export interface SearchRankingProvider {
  readonly providerId: string;
  rank(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    candidates: readonly SearchCandidate[];
  }): Promise<readonly SearchCandidate[]>;
}

export interface SearchRerankingProvider {
  readonly providerId: string;
  rerank(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    candidates: readonly SearchCandidate[];
  }): Promise<readonly SearchCandidate[]>;
}

export interface SearchExplanationProvider {
  readonly providerId: string;
  explain(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    candidates: readonly SearchCandidate[];
  }): Promise<Readonly<Record<string, string>>>;
}

export interface SearchObservabilityProvider {
  readonly providerId: string;
  record(event: SearchV3TraceEvent & {
    requestId: string;
  }): Promise<void> | void;
}

export interface KnowledgeGraphProvider {
  readonly providerId: string;
  resolveEntity(query: string): Promise<unknown | null>;
  resolveAlias(alias: string): Promise<unknown | null>;
  getEntity(entityId: string): Promise<unknown | null>;
  getRelationships(entityId: string): Promise<readonly unknown[]>;
  getFeatures(entityId: string): Promise<Readonly<Record<string, unknown>>>;
  getEvidence(entityId: string): Promise<readonly unknown[]>;
  findRelated(entityId: string, relationship?: string): Promise<readonly unknown[]>;
  resolveHierarchy(entityId: string): Promise<readonly unknown[]>;
  getEntityContext(entityId: string): Promise<Readonly<Record<string, unknown>> | null>;
}
