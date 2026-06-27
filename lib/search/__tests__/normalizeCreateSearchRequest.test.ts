import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "../normalizeCreateSearchRequest";

describe("normalizeCreateSearchRequest", () => {
  it("keeps standalone nearby as pair proximity instead of current-location near-me", () => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: "brunch and activity nearby",
      source: "public_create",
      body: {
        userLatitude: 40.7,
        userLongitude: -73.9,
        useCurrentLocation: false,
      },
    });

    expect(normalized.cleanedQuery).toBe("brunch and activity nearby");
    expect(normalized.nearMeIntent).toBe(false);
    expect(normalized.useCurrentLocation).toBe(false);
    expect(normalized.rawQueryAfterNearMeStrip).toBe("brunch and activity nearby");
    expect(normalized.searchBody.query).toBe("brunch and activity nearby");
    expect(normalized.debugParity.pairProximityIntent).toBe(true);
    expect(normalized.pairProximityIntent).toBe(true);
    expect(normalized.debugParity.searchBackendUsed).toBe("enterprise");
    expect(normalized.debugParity.currentLocationBackendDecision).toBe("enterprise_without_user_location");
    expect(normalized.debugParity.enterpriseSearchUsed).toBe(true);
    expect(normalized.debugParity.legacyFallbackUsed).toBe(false);
  });
});
