import { describe, expect, it, vi } from "vitest";

vi.mock("../../enterprise/semantic", () => ({
  isEligibleForPublicEmbedding: () => ({ eligible: true }),
}));

import { validateSearchResult } from "./validateSearchResult";

function candidate(id: string) {
  return {
    candidate: {
      candidate: {
        location: { id, status: "published" },
      },
    },
  } as any;
}

function pair(distanceMiles: number, walkingMinutes: number) {
  return {
    restaurant: candidate("restaurant-1"),
    activity: candidate("activity-1"),
    distanceMiles,
    walkingMinutes,
  } as any;
}

function plan(maxDistanceMiles = 5) {
  return {
    travel: { constraint: "hard", mode: "driving" },
    pairing: {
      required: true,
      requireWalkable: false,
      maxDistanceMiles,
      maxWalkingMinutes: null,
      maxDrivingMinutes: 15,
      sameVenueRequired: false,
    },
  } as any;
}

function result(pairs: any[]) {
  return {
    requestFulfilled: pairs.length > 0,
    partialResults: false,
    retrievedCandidates: 9,
    restaurants: [],
    activities: [],
    sameVenueResults: [],
    pairs,
    used: false,
    reason: null,
  } as any;
}

describe("validateSearchResult travel-pair handoff", () => {
  it("preserves a venue-to-venue pair when candidate origin distance is absent", () => {
    const builtPair = pair(3.5, 71);
    const validated = validateSearchResult({ plan: plan(5), result: result([builtPair]) });

    expect(validated.valid).toBe(true);
    expect(validated.result.pairs).toHaveLength(1);
    expect(validated.result.requestFulfilled).toBe(true);
  });

  it("rejects a pair only from its pair-level travel distance", () => {
    const validated = validateSearchResult({ plan: plan(3), result: result([pair(3.5, 71)]) });

    expect(validated.result.pairs).toHaveLength(0);
    expect(validated.result.requestFulfilled).toBe(false);
    expect(validated.errors).toContain("ANCHOR_DISTANCE_VIOLATION");
  });

  it("does not turn four diversified Flushing pairs into zero during validation", () => {
    const pairs = [2.92, 3.28, 3.5, 3.52].map((distance, index) => ({
      ...pair(distance, 59 + index * 4),
      restaurant: candidate(`restaurant-${index % 2}`),
      activity: candidate(`activity-${index}`),
    }));
    const validated = validateSearchResult({ plan: plan(5), result: result(pairs) });

    expect(validated.result.pairs).toHaveLength(4);
    expect(validated.result.requestFulfilled).toBe(true);
    expect(validated.errors).toEqual([]);
  });
});
