import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/location-data-quality/enrichment-runner.ts", "utf8");

describe("catalog enrichment stale Google Place ID recovery contract", () => {
  it("only treats a confirmed Place Details 404/NOT_FOUND as a stale stored identity", () => {
    expect(source).toContain("function isStaleGooglePlaceIdError");
    expect(source).toContain("Google Place Details failed: 404");
    expect(source).toContain("Place ID is no longer valid");
    expect(source).toContain("NOT_FOUND");
  });

  it("retires the stale identity before performing a fresh safe Google lookup", () => {
    const retireIndex = source.indexOf("google_place_id: null");
    const clearLocalIndex = source.indexOf("location.google_place_id = null", retireIndex);
    const retryIndex = source.indexOf("result = await enrichLocationFromGoogle(location)", clearLocalIndex);

    expect(retireIndex).toBeGreaterThan(-1);
    expect(clearLocalIndex).toBeGreaterThan(retireIndex);
    expect(retryIndex).toBeGreaterThan(clearLocalIndex);
    expect(source).toContain("staleGooglePlaceIdRecovery: true");
  });

  it("reserves and records the two additional Google calls used by recovery", () => {
    expect(source).toContain("const recoveryCalls = 2");
    expect(source).toContain("batch.apiCalls += recoveryCalls");
    expect(source).toContain("apiCallsForItem += recoveryCalls");
    expect(source).toContain("fresh identity lookup deferred by API budget");
  });

  it("keeps replacement identities behind the existing collision guard", () => {
    const retryIndex = source.indexOf("result = await enrichLocationFromGoogle(location)", source.indexOf("staleGooglePlaceIdRecovery"));
    const collisionIndex = source.indexOf("findIdentityCollision(location, place.id)");
    expect(retryIndex).toBeGreaterThan(-1);
    expect(collisionIndex).toBeGreaterThan(retryIndex);
    expect(source).toContain("duplicate_google_place_id");
  });

  it("uses per-item API accounting for terminal item states", () => {
    expect(source.match(/api_calls: apiCallsForItem/g)?.length).toBeGreaterThanOrEqual(3);
  });
});