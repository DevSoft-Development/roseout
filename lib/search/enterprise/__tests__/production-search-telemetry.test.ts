import { afterEach, describe, expect, it } from "vitest";
import { productionSafeDebug } from "../debug";
import { resolveSearchTelemetry } from "../searchTelemetry";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalNodeEnv,
    configurable: true,
    writable: true,
  });
});

describe("production search telemetry", () => {
  it("survives production debug filtering and resolves into analytics fields", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
    });

    const safeDebug = productionSafeDebug({
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
      pairCandidatesEvaluated: 72,
      validPairCountBeforeRender: 4,
      candidatePairCountBeforeRequiredPairSuppression: 4,
      pairsRejectedForDistance: 60,
      pairsRejectedForMissingCoordinates: 8,
      extremeWalkingRoutesRejected: 1,
      invalidWalkingRoutesHiddenFromDisplay: 1,
      distanceMode: "walking",
      maxPairDistanceMiles: 1.5,
      maxPairWalkingMinutes: 30,
      performance: {
        total_ms: 2435,
        intent_parse_ms: 120,
        rpc_ms: 1712,
        pairing_ms: 42,
        ranking_ms: 88,
      },
      mlSearchDebug: {
        mlEnabled: true,
        mlApplied: false,
        notAppliedReason: "ml_did_not_materially_change_results",
      },
      rejectedPairs: [{ internal: true }],
    });

    const telemetry = resolveSearchTelemetry({
      debug: safeDebug,
      routeSearchMs: 2000,
    });

    expect(telemetry).toEqual(
      expect.objectContaining({
        intentParserSource: "fast_path",
        pairCandidatesEvaluated: 72,
        validPairCountBeforeRender: 4,
        candidatePairCountBeforeRequiredPairSuppression: 4,
        pairsRejectedForDistance: 60,
        pairsRejectedForMissingCoordinates: 8,
        extremeWalkingRoutesRejected: 1,
        invalidWalkingRoutesHiddenFromDisplay: 1,
        distanceMode: "walking",
        maxPairDistanceMiles: 1.5,
        maxPairWalkingMinutes: 30,
        intentMs: 120,
        searchMs: 1712,
        pairingMs: 42,
        rankingMs: 88,
        mlStatus: "ranking_unchanged",
      }),
    );
    expect(safeDebug).not.toHaveProperty("rejectedPairs");
  });
});
