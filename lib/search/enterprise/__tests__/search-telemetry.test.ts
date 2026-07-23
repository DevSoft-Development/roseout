import { describe, expect, it } from "vitest";
import {
  resolveSearchIntentParserSource,
  resolveSearchTelemetry,
} from "../searchTelemetry";

describe("search telemetry normalization", () => {
  it("reads nested pairing counters and distance policy", () => {
    const telemetry = resolveSearchTelemetry({
      selectedSearchLane: "auto",
      debug: {
        render_mode: "mixed_pairs",
        normalizedIntent: {
          searchType: "mixed_outing",
          inferredFromRenderMode: "mixed_pairs",
          pairingPreference: {
            distanceMode: "walking",
            maxPairDistanceMiles: 1.5,
            maxPairWalkingMinutes: 30,
          },
        },
        pairingDebug: {
          pairCandidatesEvaluated: 12,
          validPairCountBeforeRender: 3,
          pairsRejectedForDistance: 7,
          pairsRejectedForMissingCoordinates: 2,
        },
        performance: {
          llm_ms: 40,
          rpc_ms: 800,
          pairing_ms: 22,
          ranking_ms: 11,
        },
        mlSearchDebug: {
          mlEnabled: true,
          mlApplied: false,
          mlUnavailableReason: "ml_did_not_materially_change_results",
        },
      },
    });

    expect(telemetry.intentParserSource).toBe("render_inference");
    expect(telemetry.pairCandidatesEvaluated).toBe(12);
    expect(telemetry.validPairCountBeforeRender).toBe(3);
    expect(telemetry.pairsRejectedForDistance).toBe(7);
    expect(telemetry.pairsRejectedForMissingCoordinates).toBe(2);
    expect(telemetry.distanceMode).toBe("walking");
    expect(telemetry.maxPairDistanceMiles).toBe(1.5);
    expect(telemetry.maxPairWalkingMinutes).toBe(30);
    expect(telemetry.intentMs).toBe(40);
    expect(telemetry.searchMs).toBe(800);
    expect(telemetry.pairingMs).toBe(22);
    expect(telemetry.rankingMs).toBe(11);
    expect(telemetry.mlStatus).toBe("ranking_unchanged");
  });

  it("never returns a null parser source", () => {
    expect(
      resolveSearchIntentParserSource({
        selectedSearchLane: "restaurant",
        debug: {},
      }),
    ).toBe("selected_lane");

    expect(
      resolveSearchIntentParserSource({
        selectedSearchLane: "auto",
        debug: {},
      }),
    ).toBe("enterprise_fallback");
  });
});
