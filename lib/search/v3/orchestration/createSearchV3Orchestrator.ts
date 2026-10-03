import type {
  LocationIntelligenceProvider,
  SearchCandidate,
  SearchEligibilityProvider,
  SearchEntityResolutionProvider,
  SearchIntentProvider,
  SearchObservabilityProvider,
  SearchRankingProvider,
  SearchRetrievalProvider,
  SearchRerankingProvider,
  SearchV3Execution,
  SearchV3Request,
  SearchV3TraceEvent,
} from "@/lib/search-framework";

export const SEARCH_V3_ORCHESTRATION_VERSION = "v3-structured-retrieval-alpha.1";

export interface SearchV3Dependencies {
  intent: SearchIntentProvider;
  entityResolution?: SearchEntityResolutionProvider | null;
  locationIntelligence: LocationIntelligenceProvider;
  retrieval: readonly SearchRetrievalProvider[];
  eligibility?: SearchEligibilityProvider | null;
  ranking?: SearchRankingProvider | null;
  reranking?: SearchRerankingProvider | null;
  observability?: SearchObservabilityProvider | null;
}

export interface SearchV3Orchestrator {
  execute(request: SearchV3Request): Promise<SearchV3Execution>;
}

export function createSearchV3Orchestrator(
  dependencies: SearchV3Dependencies,
): SearchV3Orchestrator {
  validateDependencies(dependencies);

  return {
    async execute(request: SearchV3Request): Promise<SearchV3Execution> {
      validateRequest(request);
      const trace: SearchV3TraceEvent[] = [];

      let intent = await runStage({
        stage: "intent",
        requestId: request.requestId,
        trace,
        observability: dependencies.observability,
        work: () => dependencies.intent.parse(request),
      });

      if (dependencies.entityResolution && intent.anchor?.label) {
        const resolution = await runStage({
          stage: "entity_resolution",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () => dependencies.entityResolution!.resolve(intent.anchor!.label),
        });

        if (resolution.status === "resolved" && resolution.entity) {
          const attributes = resolution.entity.attributes;
          intent = {
            ...intent,
            anchor: {
              ...intent.anchor,
              entityId: resolution.entity.id,
              entityType: resolution.entity.entityType,
              latitude: numberAttribute(attributes.latitude),
              longitude: numberAttribute(attributes.longitude),
              confidence: resolution.confidence ?? resolution.entity.confidence,
            },
            metadata: {
              ...intent.metadata,
              entityResolution: {
                status: resolution.status,
                source: resolution.source,
                normalizedQuery: resolution.normalizedQuery,
                canonicalName: resolution.entity.canonicalName,
              },
            },
          };
        } else {
          intent = {
            ...intent,
            metadata: {
              ...intent.metadata,
              entityResolution: {
                status: resolution.status,
                source: resolution.source,
                normalizedQuery: resolution.normalizedQuery,
                candidateCount: resolution.candidates.length,
              },
            },
          };
        }
      } else {
        await recordSkipped(
          "entity_resolution",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      const retrieval = await runStage({
        stage: "retrieval",
        requestId: request.requestId,
        trace,
        observability: dependencies.observability,
        work: () =>
          Promise.all(
            dependencies.retrieval.map((provider) =>
              provider.retrieve({ request, intent }),
            ),
          ),
      });

      const retrievedLocationIds = uniqueLocationIds(retrieval);
      let locationIds = retrievedLocationIds;
      let rejectedCount = 0;

      if (dependencies.eligibility) {
        const eligibility = await runStage({
          stage: "hard_eligibility",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () => dependencies.eligibility!.filter({
            request,
            intent,
            locationIds: retrievedLocationIds,
          }),
        });
        locationIds = [...eligibility.eligibleLocationIds];
        rejectedCount = eligibility.rejected.length;
      } else {
        await recordSkipped(
          "hard_eligibility",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      const intelligence = await runStage({
        stage: "location_intelligence",
        requestId: request.requestId,
        trace,
        observability: dependencies.observability,
        work: () => dependencies.locationIntelligence.getLocations(locationIds),
      });

      const intelligenceById = new Map(
        intelligence.map((profile) => [profile.locationId, profile]),
      );

      let candidates: readonly SearchCandidate[] = locationIds.flatMap((locationId) => {
        const profile = intelligenceById.get(locationId);
        if (!profile) return [];

        return [{
          locationId,
          intelligence: profile,
          retrieval: retrieval.flatMap((lane) =>
            lane.candidates.filter((candidate) => candidate.locationId === locationId),
          ),
          frameworkScore: null,
          finalRank: null,
          metadata: {},
        }];
      });

      if (dependencies.ranking) {
        candidates = await runStage({
          stage: "ranking",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () =>
            dependencies.ranking!.rank({
              request,
              intent,
              candidates,
            }),
        });
      } else {
        await recordSkipped(
          "ranking",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      if (dependencies.reranking) {
        candidates = await runStage({
          stage: "reranking",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () =>
            dependencies.reranking!.rerank({
              request,
              intent,
              candidates,
            }),
        });
      } else {
        await recordSkipped(
          "reranking",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      const limit = normalizeLimit(request.limit);
      const finalCandidates = candidates.slice(0, limit).map((candidate, index) => ({
        ...candidate,
        finalRank: index + 1,
      }));

      return {
        contractVersion: "search-execution-v3-alpha.1",
        requestId: request.requestId,
        query: request.query,
        intent,
        retrieval,
        candidates: finalCandidates,
        trace,
        metadata: {
          candidateCount: retrievedLocationIds.length,
          eligibleCount: locationIds.length,
          rejectedCount,
          hydratedCount: intelligence.length,
          orchestrationVersion: SEARCH_V3_ORCHESTRATION_VERSION,
        },
      };
    },
  };
}

function validateDependencies(dependencies: SearchV3Dependencies): void {
  if (!dependencies.intent) {
    throw new TypeError("Search V3 requires an intent provider.");
  }
  if (!dependencies.locationIntelligence) {
    throw new TypeError("Search V3 requires a location intelligence provider.");
  }
  if (!Array.isArray(dependencies.retrieval) || dependencies.retrieval.length === 0) {
    throw new TypeError("Search V3 requires at least one retrieval provider.");
  }
}

function validateRequest(request: SearchV3Request): void {
  if (!request || typeof request !== "object") {
    throw new TypeError("Search V3 request must be an object.");
  }
  if (typeof request.requestId !== "string" || !request.requestId.trim()) {
    throw new TypeError("Search V3 requestId must be a non-empty string.");
  }
  if (typeof request.query !== "string" || !request.query.trim()) {
    throw new TypeError("Search V3 query must be a non-empty string.");
  }
}

function numberAttribute(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(100, Math.floor(limit!)));
}

function uniqueLocationIds(
  lanes: readonly {
    candidates: readonly { locationId: string; rank: number }[];
  }[],
): string[] {
  const bestRank = new Map<string, number>();

  for (const lane of lanes) {
    for (const candidate of lane.candidates) {
      const current = bestRank.get(candidate.locationId);
      if (current == null || candidate.rank < current) {
        bestRank.set(candidate.locationId, candidate.rank);
      }
    }
  }

  return [...bestRank.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([locationId]) => locationId);
}

async function runStage<T>(args: {
  stage: string;
  requestId: string;
  trace: SearchV3TraceEvent[];
  observability?: SearchObservabilityProvider | null;
  work: () => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  await record(
    { stage: args.stage, status: "started" },
    args.requestId,
    args.trace,
    args.observability,
  );

  try {
    const result = await args.work();
    await record(
      {
        stage: args.stage,
        status: "completed",
        elapsedMs: Date.now() - startedAt,
      },
      args.requestId,
      args.trace,
      args.observability,
    );
    return result;
  } catch (error) {
    await record(
      {
        stage: args.stage,
        status: "failed",
        elapsedMs: Date.now() - startedAt,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
      args.requestId,
      args.trace,
      args.observability,
    );
    throw error;
  }
}

async function recordSkipped(
  stage: string,
  requestId: string,
  trace: SearchV3TraceEvent[],
  observability?: SearchObservabilityProvider | null,
): Promise<void> {
  await record(
    { stage, status: "skipped" },
    requestId,
    trace,
    observability,
  );
}

async function record(
  event: SearchV3TraceEvent,
  requestId: string,
  trace: SearchV3TraceEvent[],
  observability?: SearchObservabilityProvider | null,
): Promise<void> {
  trace.push(event);
  if (observability) {
    await observability.record({ ...event, requestId });
  }
}
