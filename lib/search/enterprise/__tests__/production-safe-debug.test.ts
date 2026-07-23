import { afterEach, describe, expect, it } from "vitest";
import { productionSafeDebug } from "../debug";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalNodeEnv,
    configurable: true,
    writable: true,
  });
});

describe("productionSafeDebug", () => {
  it("preserves production search telemetry needed by the public logger", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
    });

    const result = productionSafeDebug({
      search_system: "enterprise-search-v1",
      intentParserSource: "fast_path",
      searchType: "mixed_outing",
      primaryDomain: "mixed",
      wantsPairing: true,
      needsRestaurant: true,
      needsActivity: true,
      normalizedIntent: {
        searchType: "mixed_outing",
        pairingPreference: {
          requiresPairing: true,
          distanceMode: "walking",
          maxPairDistanceMiles: 1.5,
          maxPairWalkingMinutes: 30,
          requireWalkablePair: true,
        },
      },
      pairingPreference: {
        requiresPairing: true,
        distanceMode: "walking",
        maxPairDistanceMiles: 1.5,
        maxPairWalkingMinutes: 30,
        requireWalkablePair: true,
      },
      pairCandidatesEvaluated: 12,
      validPairCountBeforeRender: 3,
      candidatePairCountBeforeRequiredPairSuppression: 3,
      pairsRejectedForDistance: 7,
      pairsRejectedForMissingCoordinates: 2,
      extremeWalkingRoutesRejected: 1,
      invalidWalkingRoutesHiddenFromDisplay: 1,
      distanceMode: "walking",
      maxPairDistanceMiles: 1.5,
      maxPairWalkingMinutes: 30,
      performance: {
        total_ms: 2000,
        intent_parse_ms: 100,
        rpc_ms: 1200,
        pairing_ms: 40,
        ranking_ms: 80,
      },
      mlSearchDebug: {
        mlEnabled: true,
        mlApplied: false,
        mlUnavailableReason: "ml_did_not_materially_change_results",
      },
      secretInternalValue: "must-not-leak",
    });

    expect(result.intentParserSource).toBe("fast_path");
    expect(result.pairCandidatesEvaluated).toBe(12);
    expect(result.validPairCountBeforeRender).toBe(3);
    expect(result.pairsRejectedForDistance).toBe(7);
    expect(result.distanceMode).toBe("walking");
    expect(result.performance).toEqual(
      expect.objectContaining({
        rpc_ms: 1200,
        pairing_ms: 40,
        ranking_ms: 80,
      }),
    );
    expect(result.mlSearchDebug).toBeTruthy();
    expect(result).not.toHaveProperty("secretInternalValue");
  });

  it("returns the complete object outside production", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      configurable: true,
      writable: true,
    });

    const debug = {
      search_system: "enterprise-search-v1",
      secretInternalValue: "available-in-test",
    };

    expect(productionSafeDebug(debug)).toBe(debug);
  });
});
