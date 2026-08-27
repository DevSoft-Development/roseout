import { describe, expect, it } from "vitest";
import { parsePlannedTimeFromQuery } from "@/lib/outings/parse-planned-time";
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

  it("propagates an exact natural-language date and time into the canonical search body", () => {
    const rawQuery = "date night in Brooklyn tomorrow at 7:30 pm";
    const expected = parsePlannedTimeFromQuery(rawQuery, "America/New_York");
    const normalized = normalizeCreateSearchRequest({
      rawQuery,
      source: "public_create",
      body: { timezone: "America/New_York" },
    });

    expect(expected.confidence).toBe("exact");
    expect(expected.plannedFor).not.toBeNull();
    expect(normalized.searchBody.plannedFor).toBe(expected.plannedFor);
  });

  it("preserves an explicit plannedFor value instead of replacing it from query text", () => {
    const plannedFor = "2026-09-05T23:30:00.000Z";
    const normalized = normalizeCreateSearchRequest({
      rawQuery: "date night in Brooklyn tomorrow at 7:30 pm",
      source: "public_create",
      body: {
        timezone: "America/New_York",
        plannedFor,
      },
    });

    expect(normalized.searchBody.plannedFor).toBe(plannedFor);
  });
});
