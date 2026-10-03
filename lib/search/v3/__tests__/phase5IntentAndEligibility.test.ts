import { describe, expect, it } from "vitest";
import type {
  LocationIntelligenceProvider,
  SearchEligibilityProvider,
  SearchRetrievalProvider,
} from "@/lib/search-framework";
import { createEmptyLocationIntelligenceProfile } from "@/lib/search-framework";
import {
  RuleBasedSearchV3IntentProvider,
  createSearchV3Orchestrator,
} from "@/lib/search/v3";

describe("Search V3 Phase 5 intent and eligibility", () => {
  const intentProvider = new RuleBasedSearchV3IntentProvider();

  it("keeps rooftop dinner in the restaurant domain", async () => {
    const intent = await intentProvider.parse({
      requestId: "phase5-intent-1",
      query: "Italian rooftop dinner in Queens",
    });

    expect(intent.primaryDomain).toBe("restaurant");
    expect(intent.domains).toEqual(["restaurant"]);
    expect(intent.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "cuisine", value: "italian", strength: "hard" }),
      expect.objectContaining({ key: "meal_period", value: "dinner", strength: "hard" }),
      expect.objectContaining({ key: "feature", value: "rooftop", strength: "hard" }),
      expect.objectContaining({ key: "borough", value: "Queens", strength: "hard" }),
    ]));
  });

  it("extracts a graph-resolvable landmark anchor", async () => {
    const intent = await intentProvider.parse({
      requestId: "phase5-intent-2",
      query: "dinner near MSG",
    });

    expect(intent.primaryDomain).toBe("restaurant");
    expect(intent.anchor?.label).toBe("MSG");
  });

  it("preserves neighborhood text for graph geo resolution", async () => {
    const intent = await intentProvider.parse({
      requestId: "phase5-intent-geo",
      query: "dinner in Astoria",
    });

    expect(intent.primaryDomain).toBe("restaurant");
    expect(intent.anchor?.label).toBe("Astoria");
  });

  it("detects activity-only intent", async () => {
    const intent = await intentProvider.parse({
      requestId: "phase5-intent-3",
      query: "bowling in Queens",
    });

    expect(intent.domains).toEqual(["activity"]);
    expect(intent.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "activity_type", value: "bowling", strength: "hard" }),
      expect.objectContaining({ key: "borough", value: "Queens", strength: "hard" }),
    ]));
  });

  it("applies hard eligibility before Location Intelligence hydration", async () => {
    const retrieval: SearchRetrievalProvider = {
      providerId: "test.retrieval",
      async retrieve() {
        return {
          lane: "structured",
          elapsedMs: 1,
          candidates: [
            { locationId: "keep", lane: "structured", rank: 1 },
            { locationId: "reject", lane: "structured", rank: 2 },
          ],
        };
      },
    };

    const eligibility: SearchEligibilityProvider = {
      providerId: "test.eligibility",
      async filter() {
        return {
          eligibleLocationIds: ["keep"],
          rejected: [{ locationId: "reject", reasons: ["meal_period_mismatch"] }],
        };
      },
    };

    let hydratedIds: readonly string[] = [];
    const locationIntelligence: LocationIntelligenceProvider = {
      providerId: "test.location-intelligence",
      async getLocation(locationId) {
        return createEmptyLocationIntelligenceProfile({
          locationId,
          name: locationId,
          primaryDomain: "restaurant",
        });
      },
      async getLocations(locationIds) {
        hydratedIds = locationIds;
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
      intent: intentProvider,
      retrieval: [retrieval],
      eligibility,
      locationIntelligence,
    });

    const result = await orchestrator.execute({
      requestId: "phase5-eligibility",
      query: "dinner",
    });

    expect(hydratedIds).toEqual(["keep"]);
    expect(result.metadata.candidateCount).toBe(2);
    expect(result.metadata.eligibleCount).toBe(1);
    expect(result.metadata.rejectedCount).toBe(1);
    expect(result.candidates.map((candidate) => candidate.locationId)).toEqual(["keep"]);
    expect(result.trace.some((event) =>
      event.stage === "hard_eligibility" && event.status === "completed"
    )).toBe(true);
  });
});
