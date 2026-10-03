import type {
  KnowledgeEdge,
  KnowledgeEntity,
  KnowledgeEntityContext,
} from "./graph";
import type { EntityResolution } from "./entityResolution";
import type { LocationIntelligenceProfile } from "./locationIntelligence";
import type {
  RetrievalLaneResult,
  SearchCandidate,
  SearchEligibilityResult,
  SearchIntentGraph,
  SearchV3Request,
  SearchV3TraceEvent,
} from "./search";

export interface LocationIntelligenceProvider {
  readonly providerId: string;
  getLocation(locationId: string): Promise<LocationIntelligenceProfile | null>;
  getLocations(locationIds: readonly string[]): Promise<readonly LocationIntelligenceProfile[]>;
}

export interface SearchEntityResolutionProvider {
  readonly providerId: string;
  resolve(query: string): Promise<EntityResolution>;
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

export interface SearchFusionProvider {
  readonly providerId: string;
  fuse(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    lanes: readonly RetrievalLaneResult[];
  }): Promise<RetrievalLaneResult>;
}

export interface SearchEligibilityProvider {
  readonly providerId: string;
  filter(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
    locationIds: readonly string[];
  }): Promise<SearchEligibilityResult>;
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
  resolveEntity(query: string): Promise<KnowledgeEntity | null>;
  resolveAlias(alias: string): Promise<KnowledgeEntity | null>;
  getEntity(entityId: string): Promise<KnowledgeEntity | null>;
  getRelationships(entityId: string): Promise<readonly KnowledgeEdge[]>;
  getFeatures(entityId: string): Promise<Readonly<Record<string, unknown>>>;
  getEvidence(entityId: string): Promise<readonly Readonly<Record<string, unknown>>[]>;
  findRelated(entityId: string, relationship?: string): Promise<readonly KnowledgeEntity[]>;
  resolveHierarchy(entityId: string): Promise<readonly KnowledgeEntity[]>;
  getEntityContext(entityId: string): Promise<KnowledgeEntityContext | null>;
  searchEntities(query: string, limit?: number): Promise<readonly KnowledgeEntity[]>;
}
