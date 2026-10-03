import type {
  EntityResolution,
  EntityResolutionCandidate,
  KnowledgeGraphProvider,
  SearchEntityResolutionProvider,
} from "@/lib/search-framework";
import {
  entityTextSimilarity,
  normalizeEntityText,
} from "@/lib/search-framework/entity-resolution/normalizeEntityText";

const DEFAULT_MIN_FUZZY_SCORE = 0.82;
const AMBIGUITY_GAP = 0.08;

export interface GraphEntityResolverOptions {
  fuzzyCandidateLimit?: number;
  minFuzzyScore?: number;
}

export class GraphEntityResolver implements SearchEntityResolutionProvider {
  readonly providerId = "search-v3.graph-entity-resolver.v1";

  constructor(
    private readonly graph: KnowledgeGraphProvider,
    private readonly options: GraphEntityResolverOptions = {},
  ) {}

  async resolve(query: string): Promise<EntityResolution> {
    const normalizedQuery = normalizeEntityText(query);
    if (!normalizedQuery) {
      return emptyResolution(query, normalizedQuery);
    }

    const exactAlias = await this.graph.resolveAlias(normalizedQuery);
    if (exactAlias) {
      return resolved(query, normalizedQuery, {
        entity: exactAlias,
        matchedText: query,
        normalizedQuery,
        score: 1,
        source: "alias_exact",
      });
    }

    const canonical = await this.graph.resolveEntity(query);
    if (canonical) {
      const normalizedCanonical = normalizeEntityText(canonical.canonicalName);
      if (normalizedCanonical === normalizedQuery) {
        return resolved(query, normalizedQuery, {
          entity: canonical,
          matchedText: canonical.canonicalName,
          normalizedQuery,
          score: 1,
          source: "canonical_exact",
        });
      }
    }

    const candidates = await this.graph.searchEntities(
      normalizedQuery,
      this.options.fuzzyCandidateLimit ?? 25,
    );

    const scored: EntityResolutionCandidate[] = candidates
      .flatMap((entity) => {
        const score = entityTextSimilarity(
          normalizeEntityText(entity.canonicalName),
          normalizedQuery,
        );
        if (score < (this.options.minFuzzyScore ?? DEFAULT_MIN_FUZZY_SCORE)) {
          return [];
        }
        return [{
          entity,
          matchedText: entity.canonicalName,
          normalizedQuery,
          score,
          source: "canonical_fuzzy" as const,
        }];
      })
      .sort((a, b) => b.score - a.score || a.entity.canonicalName.localeCompare(b.entity.canonicalName));

    if (scored.length === 0) {
      return emptyResolution(query, normalizedQuery);
    }

    const top = scored[0];
    const second = scored[1];
    if (second && top.entity.id !== second.entity.id && top.score - second.score < AMBIGUITY_GAP) {
      return {
        status: "ambiguous",
        query,
        normalizedQuery,
        entity: null,
        candidates: scored.slice(0, 5),
        confidence: top.score,
        source: top.source,
        metadata: {
          ambiguityGap: top.score - second.score,
        },
      };
    }

    return resolved(query, normalizedQuery, top, scored.slice(0, 5));
  }
}

function resolved(
  query: string,
  normalizedQuery: string,
  candidate: EntityResolutionCandidate,
  candidates: readonly EntityResolutionCandidate[] = [candidate],
): EntityResolution {
  return {
    status: "resolved",
    query,
    normalizedQuery,
    entity: candidate.entity,
    candidates,
    confidence: candidate.score,
    source: candidate.source,
    metadata: {},
  };
}

function emptyResolution(query: string, normalizedQuery: string): EntityResolution {
  return {
    status: "not_found",
    query,
    normalizedQuery,
    entity: null,
    candidates: [],
    confidence: null,
    source: "none",
    metadata: {},
  };
}
