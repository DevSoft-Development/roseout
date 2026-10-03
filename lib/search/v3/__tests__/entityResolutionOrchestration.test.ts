import { describe, expect, it } from "vitest";

import type {
  LocationIntelligenceProvider,
  SearchEntityResolutionProvider,
  SearchIntentProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import { createEmptyLocationIntelligenceProfile } from "@/lib/search-framework";
import { createSearchV3Orchestrator } from "@/lib/search/v3";

describe("Search V3 graph-aware orchestration", () => {
  it("resolves an intent anchor before retrieval", async () => {
    const intent: SearchIntentProvider = {
      providerId: "test.intent",
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
            entityType: "unknown",
            latitude: null,
            longitude: null,
            confidence: 0.7,
          },
          travelMode: "walking",
          maxTravelMinutes: 20,
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

    const entityResolution: SearchEntityResolutionProvider = {
      providerId: "test.entities",
      async resolve(query) {
        expect(query).toBe("MSG");
        return {
          status: "resolved",
          query,
          normalizedQuery: "madison square garden",
          entity: {
            id: "entity-msg",
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

    const retrieval: SearchRetrievalProvider = {
      providerId: "test.retrieval",
      async retrieve({ intent: resolvedIntent }) {
        expect(resolvedIntent.anchor).toMatchObject({
          entityId: "entity-msg",
          entityType: "arena",
          latitude: 40.7505045,
          longitude: -73.9934387,
          confidence: 1,
        });

        return {
          lane: "structured",
          elapsedMs: 1,
          candidates: [{ locationId: "location-1", lane: "structured", rank: 1 }],
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

    const result = await createSearchV3Orchestrator({
      intent,
      entityResolution,
      retrieval: [retrieval],
      locationIntelligence,
    }).execute({
      requestId: "req-msg",
      query: "dinner near MSG",
    });

    expect(result.intent.anchor?.entityId).toBe("entity-msg");
    expect(result.intent.metadata.entityResolution).toMatchObject({
      status: "resolved",
      source: "alias_exact",
      canonicalName: "Madison Square Garden",
    });
    expect(result.trace.some(
      (event) => event.stage === "entity_resolution" && event.status === "completed",
    )).toBe(true);
  });
});
