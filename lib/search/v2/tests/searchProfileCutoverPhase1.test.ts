import { afterEach, describe, expect, it } from "vitest";
import { getSearchProfileMode, resolveSearchProfileRollout } from "../retrieval/searchProfileMode";
import { validatePublicSearchResponse } from "../response/validatePublicSearchResponse";

const originalMode = process.env.SEARCH_PROFILE_MODE;
const originalPercent = process.env.SEARCH_PROFILE_CANARY_PERCENT;

afterEach(() => {
  process.env.SEARCH_PROFILE_MODE = originalMode;
  process.env.SEARCH_PROFILE_CANARY_PERCENT = originalPercent;
});

describe("Search API prelaunch cutover", () => {
  it("defaults invalid profile modes to off", () => {
    process.env.SEARCH_PROFILE_MODE = "invalid";
    expect(getSearchProfileMode()).toBe("off");
  });

  it("serves all requests from canonical profiles in primary mode", () => {
    process.env.SEARCH_PROFILE_MODE = "primary";
    expect(resolveSearchProfileRollout("request-a").serveProfiles).toBe(true);
  });

  it("uses deterministic canary bucketing", () => {
    process.env.SEARCH_PROFILE_MODE = "canary";
    process.env.SEARCH_PROFILE_CANARY_PERCENT = "25";
    expect(resolveSearchProfileRollout("stable-request")).toEqual(resolveSearchProfileRollout("stable-request"));
  });

  it("rejects malformed public responses before they are served", () => {
    expect(() => validatePublicSearchResponse({ version: "public-search-v2", success: true })).toThrow(/PUBLIC_SEARCH_RESPONSE_INVALID/);
  });

  it("accepts the canonical response contract", () => {
    const response = {
      version: "public-search-v2",
      success: true,
      requestFulfilled: true,
      partialResults: false,
      requestId: "request-1",
      requestedMode: "restaurant_only",
      resolvedMode: "restaurant_only",
      primaryDomain: "restaurant",
      primary_domain: "restaurant",
      displayMode: "restaurant_cards",
      searchPlan: {},
      restaurants: [{ id: "location-1" }],
      activities: [],
      sameVenueResults: [],
      pairs: [],
      builder: { enabled: false, restaurants: [], activities: [], selectedRestaurantId: null, selectedActivityId: null },
      anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
      counts: {},
      fallback: { used: false, reason: null },
      retrieval: { configuredMode: "primary", servedSource: "canonical_profile", profileVersion: 3, canaryBucket: 1, canaryPercent: 5, profileCandidateCount: 1, legacyCandidateCount: 0, legacyFallbackUsed: false, fallbackDomains: [] },
      message: "ok",
      timing: {},
      ml: { enabled: false, modelVersion: null, rankingVariant: "control", configuredVariant: null, appliedVariant: "control", applied: false, shadowOnly: false, rolloutBucket: null, reason: "disabled" },
    };
    expect(() => validatePublicSearchResponse(response)).not.toThrow();
  });
});
