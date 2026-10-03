import { describe, expect, it } from "vitest";

import type {
  LocationIntelligenceProvider,
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
