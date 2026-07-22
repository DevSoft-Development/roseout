import { describe, expect, it } from "vitest";
import { normalizeCreateSearchRequest } from "../normalizeCreateSearchRequest";

describe("normalizeCreateSearchRequest telemetry", () => {
  it("marks typed borough geography as explicit geo without browser coordinates", () => {
    const request = normalizeCreateSearchRequest({
      rawQuery: "steak dinner in queens",
      source: "public_create",
    });
    expect(request.debugParity.typedLocationIntent).toBe(true);
    expect(request.debugParity.explicitMarketRequested).toBe(true);
    expect(request.debugParity.userLatitudePresent).toBe(false);
    expect(request.debugParity.userLongitudePresent).toBe(false);
    expect(request.canonicalGeo?.city).toBe("New York");
    expect(request.canonicalGeo?.state).toBe("NY");
    expect(request.canonicalGeo?.borough).toBe("Queens");
  });

  it("marks near me browser coordinates as primary geo", () => {
    const request = normalizeCreateSearchRequest({
      rawQuery: "bowling near me",
      body: { latitude: 40.7, longitude: -73.9 },
      source: "public_create",
    });
    expect(request.debugParity.userLatitudePresent).toBe(true);
    expect(request.debugParity.userLongitudePresent).toBe(true);
    expect(request.debugParity.userLocationUsedAsPrimaryGeo).toBe(true);
  });

  it("keeps typed Queens primary when browser coordinates are also supplied", () => {
    const request = normalizeCreateSearchRequest({
      rawQuery: "steak dinner in queens near me",
      body: { latitude: 40.1, longitude: -74.1 },
      source: "public_create",
    });
    expect(request.canonicalGeo?.borough).toBe("Queens");
    expect(request.debugParity.userLatitudePresent).toBe(true);
    expect(request.debugParity.userLongitudePresent).toBe(true);
    expect(request.debugParity.userLocationUsedAsPrimaryGeo).toBe(false);
    expect(request.debugParity.userLocationUsedAsSoftBoost).toBe(true);
  });
});
