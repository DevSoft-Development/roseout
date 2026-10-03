import { describe, expect, it } from "vitest";

import type {
  LocationIntelligenceProvider,
  SearchEntityResolutionProvider,
  SearchIntentProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import { createEmptyLocationIntelligenceProfile } from "@/lib/search-framework";
import { createSearchV3Orchestrator } from "@/lib/search/v3";

describe("Search V3 foundation", () => {
  it("orchestrates intent, retrieval, intelligence hydration, and stable ranking placeholders", async () => {
    const intent: SearchIntentProvider = {
      providerId: "test.intent",
      async parse(request) {
        return {
          contractVersion: "search-intent-v3-alpha.1",
          rawQuery: request.query,
          domains: ["restaurant"],
          primaryDomain: "restaurant",
          constraints: [],
          anchor: null,
          travelMode: "unspecified",
          maxTravelMinutes: null,
          occasion: null,
          partySize: null,
          sequencing: "single",
          ambiguity: {
            requiresClarification: false,
            unresolved: [],
          },
          metadata: {},
        };
      },
    };

    const retrieval: SearchRetrievalProvider = {
      providerId: "test.lexical",
      async retrieve() {
        return {
          lane: "lexical",
          elapsedMs: 1,
          candidates: [
            { locationId: "b", lane: "lexical", rank: 2 },
            { locationId: "a", lane: "lexical", rank: 1 },
          ],
        };
      },
    };

    const locationIntelligence: LocationIntelligenceProvider = {
      providerId: "test.intelligence",
      async getLocation(locationId) {
        return createEmptyLocationIntelligenceProfile({
          locationId,
          name: locationId,
          primaryDomain: "restaurant",
        });
      },
      async getLocations(locationIds) {
        return locationIds.map((locationId) =>
          createEmptyLocationIntelligenceProfile({
            locationId,
            name: locationId,
            primaryDomain: "restaurant",
          }),
        );
      },
    };

    const orchestrator = createSearchV3Orchestrator({
      intent,
      retrieval: [retrieval],
      locationIntelligence,
    });

    const result = await orchestrator.execute({
      requestId: "req-1",
      query: "Italian dinner in Queens",
    });

    expect(result.contractVersion).toBe("search-execution-v3-alpha.1");
    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual([
      "a",
      "b",
    ]);
    expect(result.candidates.map((candidate) => candidate.finalRank)).toEqual([
      1,
      2,
    ]);
    expect(result.metadata.candidateCount).toBe(2);
    expect(result.trace.some((event) => event.stage === "ranking" && event.status === "skipped")).toBe(true);
  });

  it("resolves an intent anchor before retrieval", async () => {
    const intent: SearchIntentProvider = {
      providerId: "test.intent.anchor",
      async parse(request) {
        return {
          contractVersion: "search-intent-v3-alpha.1",
          rawQuery: request.query,
          domains: ["restaurant"],
          primaryDomain: "restaurant",
          constraints: [],
          anchor: {
            entityId: null,
            label: "MSG",
            entityType: "landmark",
            latitude: null,
            longitude: null,
            confidence: 0.5,
          },
          travelMode: "walking",
          maxTravelMinutes: 20,
          occasion: null,
          partySize: null,
          sequencing: "single",
          ambiguity: { requiresClarification: false, unresolved: [] },
          metadata: {},
        };
      },
    };

    const entityResolution: SearchEntityResolutionProvider = {
      providerId: "test.entity-resolution",
      async resolve() {
        return {
          status: "resolved",
          query: "MSG",
          normalizedQuery: "madison square garden",
          entity: {
            id: "msg-entity",
            entityType: "arena",
            canonicalKey: "search_anchor:msg",
            canonicalName: "Madison Square Garden",
            locationId: null,
            attributes: {
              latitude: 40.7505045,
              longitude: -73.9934387,
            },
            confidence: 1,
            source: "search_anchors",
            sourceUpdatedAt: null,
          },
          candidates: [],
          confidence: 1,
          source: "alias_exact",
          metadata: {},
        };
      },
    };

    let observedEntityId: string | null = null;
    let observedLatitude: number | null = null;
    const retrieval: SearchRetrievalProvider = {
      providerId: "test.retrieval.anchor",
      async retrieve({ intent: resolvedIntent }) {
        observedEntityId = resolvedIntent.anchor?.entityId ?? null;
        observedLatitude = resolvedIntent.anchor?.latitude ?? null;
        return { lane: "test", elapsedMs: 1, candidates: [] };
      },
    };

    const locationIntelligence: LocationIntelligenceProvider = {
      providerId: "test.intelligence.empty",
      async getLocation() { return null; },
      async getLocations() { return []; },
    };

    const orchestrator = createSearchV3Orchestrator({
      intent,
      entityResolution,
      retrieval: [retrieval],
      locationIntelligence,
    });

    const result = await orchestrator.execute({
      requestId: "req-anchor",
      query: "dinner near MSG",
    });

    expect(observedEntityId).toBe("msg-entity");
    expect(observedLatitude).toBe(40.7505045);
    expect(result.intent.anchor?.entityType).toBe("arena");
    expect(result.intent.metadata.entityResolution).toMatchObject({
      status: "resolved",
      canonicalName: "Madison Square Garden",
    });
    expect(result.trace.some((event) =>
      event.stage === "entity_resolution" && event.status === "completed"
    )).toBe(true);
  });

  it("degrades gracefully when one retrieval lane fails", async () => {
    const intent: SearchIntentProvider = {
      providerId: "test.intent.degraded",
      async parse(request) {
        return {
          contractVersion: "search-intent-v3-alpha.1",
          rawQuery: request.query,
          domains: ["restaurant"],
          primaryDomain: "restaurant",
          constraints: [],
          anchor: null,
          travelMode: "unspecified",
          maxTravelMinutes: null,
          occasion: null,
          partySize: null,
          sequencing: "single",
          ambiguity: { requiresClarification: false, unresolved: [] },
          metadata: {},
        };
      },
    };

    const failed: SearchRetrievalProvider = {
      providerId: "test.failed",
      async retrieve() {
        throw new TypeError("fetch failed");
      },
    };

    const healthy: SearchRetrievalProvider = {
      providerId: "test.healthy",
      async retrieve() {
        return {
          lane: "lexical",
          elapsedMs: 1,
          candidates: [{ locationId: "a", lane: "lexical", rank: 1 }],
        };
      },
    };

    const locationIntelligence: LocationIntelligenceProvider = {
      providerId: "test.intelligence.degraded",
      async getLocation(locationId) {
        return createEmptyLocationIntelligenceProfile({
          locationId,
          name: locationId,
          primaryDomain: "restaurant",
        });
      },
      async getLocations(locationIds) {
        return locationIds.map((locationId) =>
          createEmptyLocationIntelligenceProfile({
            locationId,
            name: locationId,
            primaryDomain: "restaurant",
          }),
        );
      },
    };

    const orchestrator = createSearchV3Orchestrator({
      intent,
      retrieval: [failed, healthy],
      locationIntelligence,
    });

    const result = await orchestrator.execute({
      requestId: "req-degraded",
      query: "Italian dinner",
    });

    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual(["a"]);
    expect(result.metadata.retrievalFailureCount).toBe(1);
    expect(result.trace.some((event) =>
      event.stage === "retrieval_degraded" && event.status === "completed"
    )).toBe(true);
  });

  it("rejects an orchestration shell with no retrieval providers", () => {
    expect(() =>
      createSearchV3Orchestrator({
        intent: {} as SearchIntentProvider,
        retrieval: [],
        locationIntelligence: {} as LocationIntelligenceProvider,
      }),
    ).toThrow("at least one retrieval provider");
  });
});
