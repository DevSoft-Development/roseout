import { describe, expect, it } from "vitest";
import { buildPairs } from "../pairing/buildPairs";

function candidate(id: string, latitude: number, longitude: number, geo: { state: string; borough?: string; county?: string }) {
  return {
    candidate: { candidate: { location: { id, latitude, longitude, ...geo } } },
    scores: { total: 90, quality: 90 },
  } as any;
}

function plan(rawQuery: string, geo: { state: string; borough?: string | null; county?: string | null }, maxDistanceMiles = 3) {
  return {
    rawQuery,
    geo: { ...geo, city: null, neighborhood: null, market: null, latitude: 40.738, longitude: -73.682, radiusMiles: 6, source: "explicit", strictness: "strict" },
    pairing: { sameVenueRequired: false, maxDistanceMiles, maxWalkingMinutes: null, requireWalkable: false },
  } as any;
}

describe("explicit distance and hard geography boundaries", () => {
  it("treats distance as a ranking preference when no exact distance is requested", async () => {
    const result = await buildPairs({
      plan: plan("Sushi and an escape room in Garden City", { state: "NY", county: "Nassau County" }),
      restaurants: [candidate("r1", 40.738, -73.682, { state: "NY", county: "Nassau" })],
      activities: [candidate("a1", 40.738, -73.55, { state: "NY", county: "Nassau County" })],
    });
    expect(result.length).toBe(1);
    expect(result[0].distanceMiles).toBeGreaterThan(3);
  });

  it("enforces a hard distance when the query explicitly asks for one", async () => {
    const result = await buildPairs({
      plan: plan("Sushi and an escape room within 3 miles in Garden City", { state: "NY", county: "Nassau County" }),
      restaurants: [candidate("r1", 40.738, -73.682, { state: "NY", county: "Nassau County" })],
      activities: [candidate("a1", 40.738, -73.55, { state: "NY", county: "Nassau County" })],
    });
    expect(result).toHaveLength(0);
  });

  it("rejects cross-state pairs even when distance is implicit", async () => {
    const result = await buildPairs({
      plan: plan("Dinner and an activity near the city", { state: "NY" }),
      restaurants: [candidate("r1", 40.75, -74.0, { state: "NY" })],
      activities: [candidate("a1", 40.75, -74.01, { state: "NJ" })],
    });
    expect(result).toHaveLength(0);
  });

  it("rejects cross-borough NYC pairs", async () => {
    const result = await buildPairs({
      plan: plan("Dinner and karaoke in Queens", { state: "NY", borough: "Queens", county: "Queens County" }),
      restaurants: [candidate("r1", 40.75, -73.9, { state: "NY", borough: "Queens", county: "Queens County" })],
      activities: [candidate("a1", 40.72, -73.95, { state: "NY", borough: "Brooklyn", county: "Kings County" })],
    });
    expect(result).toHaveLength(0);
  });
});
