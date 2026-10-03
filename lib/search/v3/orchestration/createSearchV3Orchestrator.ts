import type {
  LocationIntelligenceProvider,
  RetrievalLaneResult,
  SearchCandidate,
  SearchEligibilityProvider,
  SearchEntityResolutionProvider,
  SearchFusionProvider,
  SearchIntentProvider,
  SearchObservabilityProvider,
  SearchOuting,
  SearchPairingProvider,
  SearchRankingProvider,
  SearchRetrievalProvider,
  SearchRerankingProvider,
  SearchV3Execution,
  SearchV3Request,
  SearchV3TraceEvent,
} from "@/lib/search-framework";

export const SEARCH_V3_ORCHESTRATION_VERSION = "v3-outing-decision-alpha.1";

export interface SearchV3Dependencies {
  intent: SearchIntentProvider;
  entityResolution?: SearchEntityResolutionProvider | null;
  locationIntelligence: LocationIntelligenceProvider;
  retrieval: readonly SearchRetrievalProvider[];
  fusion?: SearchFusionProvider | null;
  eligibility?: SearchEligibilityProvider | null;
  ranking?: SearchRankingProvider | null;
  reranking?: SearchRerankingProvider | null;
  pairing?: SearchPairingProvider | null;
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
          work: () => withTransientSearchRetry(() => dependencies.entityResolution!.resolve(intent.anchor!.label)),
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

      const retrievalSettled = await runStage({
        stage: "retrieval",
        requestId: request.requestId,
        trace,
        observability: dependencies.observability,
        work: () =>
          Promise.allSettled(
            dependencies.retrieval.map((provider) =>
              withTransientSearchRetry(() => provider.retrieve({ request, intent })),
            ),
          ),
      });

      const retrievalLanes: RetrievalLaneResult[] = [];
      const retrievalFailures: Array<{ providerId: string; error: string }> = [];
      retrievalSettled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          retrievalLanes.push(result.value);
          return;
        }
        retrievalFailures.push({
          providerId: dependencies.retrieval[index]?.providerId ?? `retrieval-${index}`,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });

      if (retrievalLanes.length === 0) {
        const detail = retrievalFailures
          .map((failure) => `${failure.providerId}: ${failure.error}`)
          .join("; ");
        throw new Error(`All Search V3 retrieval providers failed.${detail ? ` ${detail}` : ""}`);
      }

      if (retrievalFailures.length > 0) {
        await record(
          {
            stage: "retrieval_degraded",
            status: "completed",
            metadata: {
              failedProviders: retrievalFailures,
              successfulLaneCount: retrievalLanes.length,
            },
          },
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      let fusedLane: RetrievalLaneResult | null = null;
      if (dependencies.fusion && retrievalLanes.length > 1) {
        fusedLane = await runStage({
          stage: "fusion",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () => dependencies.fusion!.fuse({
            request,
            intent,
            lanes: retrievalLanes,
          }),
        });
      } else {
        await recordSkipped(
          "fusion",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      const retrieval = fusedLane
        ? [...retrievalLanes, fusedLane]
        : retrievalLanes;

      const retrievedLocationIds = fusedLane
        ? fusedLane.candidates.map((candidate) => candidate.locationId)
        : uniqueLocationIds(retrievalLanes);
      let locationIds = retrievedLocationIds;
      let rejectedCount = 0;

      if (dependencies.eligibility) {
        const eligibility = await runStage({
          stage: "hard_eligibility",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () => withTransientSearchRetry(() => dependencies.eligibility!.filter({
            request,
            intent,
            locationIds: retrievedLocationIds,
          })),
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
        work: () => withTransientSearchRetry(() => dependencies.locationIntelligence.getLocations(locationIds)),
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

      const rankedCandidates = candidates.map((candidate, index) => ({
        ...candidate,
        finalRank: index + 1,
      }));

      let outings: SearchOuting[] = [];
      if (dependencies.pairing) {
        outings = [...await runStage({
          stage: "pairing",
          requestId: request.requestId,
          trace,
          observability: dependencies.observability,
          work: () => dependencies.pairing!.pair({
            request,
            intent,
            candidates: rankedCandidates,
          }),
        })];
      } else {
        await recordSkipped(
          "pairing",
          request.requestId,
          trace,
          dependencies.observability,
        );
      }

      const limit = normalizeLimit(request.limit);
      const finalCandidates = rankedCandidates.slice(0, limit);

      return {
        contractVersion: "search-execution-v3-alpha.1",
        requestId: request.requestId,
        query: request.query,
        intent,
        retrieval,
        candidates: finalCandidates,
        outings,
        trace,
        metadata: {
          candidateCount: retrievedLocationIds.length,
          eligibleCount: locationIds.length,
          rejectedCount,
          hydratedCount: intelligence.length,
          outingCount: outings.length,
          retrievalFailureCount: retrievalFailures.length,
          orchestrationVersion: SEARCH_V3_ORCHESTRATION_VERSION,
        },
      };
    },
  };
}

async function withTransientSearchRetry<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  const delaysMs = [250, 750];

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isTransientSearchError(error) || attempt === delaysMs.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }

  throw lastError;
}

function isTransientSearchError(error: unknown): boolean {
  const message = error instanceof Error
    ? [error.name, error.message, String((error as Error & { cause?: unknown }).cause ?? "")].join(" ")
    : String(error);

  return /fetch failed|network|socket|timeout|temporar|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|provider_unavailable|rate_limited|mapbox_matrix_request_failed/i.test(message);
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Search V3 stage "${args.stage}" failed: ${message}`);
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
