import { describe, expect, it } from "vitest";
import { finalizePublicSearchPayload } from "../finalizePayload";

const restaurant = (id: string) => ({
  id,
  location_type: "restaurant",
  name: `Restaurant ${id}`,
  latitude: 40.68,
  longitude: -73.96,
  borough: "Brooklyn",
  city: "Brooklyn",
  state: "NY",
});

const activity = (id: string) => ({
  id,
  location_type: "activity",
  name: `Activity ${id}`,
  latitude: 40.681,
  longitude: -73.959,
  borough: "Brooklyn",
  city: "Brooklyn",
  state: "NY",
});

describe("finalizePublicSearchPayload hard contracts", () => {
  it("never regenerates a nearby pair for a hard same-venue request", () => {
    const result = finalizePublicSearchPayload({
      success: false,
      requestFulfilled: false,
      partialResults: true,
      restaurants: [restaurant("r1")],
      activities: [activity("a1")],
      pairs: [],
      counts: {},
      card_counts: {},
      cardCounts: {},
      searchV2: {
        requestedMode: "same_venue",
        resolvedMode: "same_venue",
        requestFulfilled: false,
        searchPlan: {
          mode: "same_venue",
          pairing: { sameVenueRequired: true },
          relationship: { type: "same_venue_required" },
        },
      },
      debug: {
        wantsPairing: true,
        searchPlan: {
          mode: "same_venue",
          pairing: { sameVenueRequired: true },
          relationship: { type: "same_venue_required" },
        },
      },
    } as any);

    expect(result.pairs).toHaveLength(0);
    expect(result.debug.finalPublicRegeneratedPairCount).toBe(0);
    expect(result.debug.finalPublicHardSameVenue).toBe(true);
    expect(result.requestFulfilled).toBe(false);
    expect(result.success).toBe(false);
    expect(result.partialResults).toBe(true);
    expect(result.render_mode).toBe("partial_mixed");
    expect(result.no_pairs_reason).toBe("no_strong_same_venue_match");
  });

  it("drops a separate-venue pair that leaks into a hard same-venue payload", () => {
    const result = finalizePublicSearchPayload({
      success: false,
      requestFulfilled: false,
      restaurants: [restaurant("r1")],
      activities: [activity("a1")],
      pairs: [{ restaurant: restaurant("r1"), activity: activity("a1") }],
      counts: {},
      card_counts: {},
      cardCounts: {},
      requestedMode: "same_venue",
      debug: {
        wantsPairing: true,
        searchPlan: {
          pairing: { sameVenueRequired: true },
          relationship: { type: "same_venue_required" },
        },
      },
    } as any);

    expect(result.pairs).toHaveLength(0);
    expect(result.debug.finalPublicRegeneratedPairCount).toBe(0);
    expect(result.success).toBe(false);
  });
});
