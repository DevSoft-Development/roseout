import { describe, expect, it } from "vitest";
import {
  buildLocationMatchReasonDetails,
  buildPairMatchReasonDetails,
} from "../response/matchReasonDetails";

describe("structured customer match explanations", () => {
  it("turns public search evidence into typed reasons without inventing facts", () => {
    const reasons = buildLocationMatchReasonDetails([
      "Italian cuisine match",
      "date-night fit",
      "Italian cuisine match",
    ]);

    expect(reasons).toEqual([
      {
        type: "cuisine",
        label: "Italian cuisine match",
        source: "search_evidence",
        confidence: "high",
      },
      {
        type: "occasion",
        label: "Fits your date-night request",
        source: "search_evidence",
        confidence: "high",
      },
    ]);
  });

  it("adds factual walking evidence to a pair", () => {
    const reasons = buildPairMatchReasonDetails({
      reasons: ["live music activity match"],
      walkingMinutes: 8.4,
      distanceMiles: 0.4,
    });

    expect(reasons).toContainEqual({
      type: "walking",
      label: "8-minute walk between stops",
      source: "pairing",
      confidence: "high",
    });
  });

  it("uses distance when no walking duration is available", () => {
    const reasons = buildPairMatchReasonDetails({
      reasons: [],
      walkingMinutes: null,
      distanceMiles: 0.44,
    });

    expect(reasons).toEqual([
      {
        type: "distance",
        label: "0.4 miles between stops",
        source: "pairing",
        confidence: "high",
      },
    ]);
  });
});
