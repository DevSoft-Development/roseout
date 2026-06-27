import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "../normalizeCreateSearchRequest";

describe("normalizeCreateSearchRequest", () => {
  it("keeps standalone nearby as pair proximity instead of current-location near-me", () => {
    const normalized = normalizeCreateSearchRequest({
      rawQuery: "brunch and activity nearby",
      source: "public_create",
      body: {
        userLatitude: 40.758,
        userLongitude: -73.9855,
      },
    });

    expect(normalized.cleanedQuery).toBe("brunch and activity nearby");
    expect(normalized.nearMeIntent).toBe(false);
    expect(normalized.useCurrentLocation).toBe(false);
    expect(normalized.rawQueryAfterNearMeStrip).toBe("brunch and activity nearby");
    expect(normalized.searchBody.query).toBe("brunch and activity nearby");
    expect(normalized.debugParity.pairProximityIntent).toBe(true);
    expect(normalized.debugParity.searchBackendUsed).not.toBe("legacy_for_current_location");
  });
});
