import { describe, expect, it } from "vitest";
import { hasNearMeIntent, hasPairProximityIntent, stripNearMeIntent } from "../../near-me";
import { normalizeCreateSearchRequest } from "../../normalizeCreateSearchRequest";

describe("near-me and pair proximity routing helpers", () => {
  it("does not treat standalone nearby as current-location intent", () => {
    expect(hasNearMeIntent("brunch and activity nearby")).toBe(false);
    expect(hasPairProximityIntent("brunch and activity nearby")).toBe(true);
    expect(stripNearMeIntent("brunch and activity nearby")).toBe("brunch and activity nearby");

    expect(hasNearMeIntent("brunch and activity near me")).toBe(true);
    expect(stripNearMeIntent("brunch and activity near me")).toBe("brunch and activity");

    expect(hasNearMeIntent("dinner and bowling close by")).toBe(false);
    expect(hasPairProximityIntent("dinner and bowling close by")).toBe(true);

    expect(hasNearMeIntent("restaurants around me")).toBe(true);
    expect(hasPairProximityIntent("restaurants around me")).toBe(false);
  });

  it("preserves nearby in normalized mixed outing queries", () => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: "brunch and activity nearby",
      body: {
        query: "brunch and activity nearby",
        userLatitude: 40.7,
        userLongitude: -73.9,
        useCurrentLocation: false,
      },
      source: "public_create",
    });

    expect(normalized.cleanedQuery).toBe("brunch and activity nearby");
    expect(normalized.nearMeIntent).toBe(false);
    expect(normalized.pairProximityIntent).toBe(true);
    expect(normalized.useCurrentLocation).toBe(false);
    expect(normalized.rawQueryAfterNearMeStrip).toBe("brunch and activity nearby");
    expect(normalized.debugParity.searchBackendUsed).toBe("enterprise");
  });
});
