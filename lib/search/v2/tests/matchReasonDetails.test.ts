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
      includeTravelReason: true,
      walkingRequested: true,
      maxWalkingMinutes: 30,
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
      includeTravelReason: true,
    });

    expect(reasons).toEqual([
      {
        type: "distance",
        label: "0.44 miles between stops",
        source: "pairing",
        confidence: "high",
      },
    ]);
  });

  it("does not add travel to a generic match explanation", () => {
    expect(
      buildPairMatchReasonDetails({
        reasons: ["live music activity match"],
        walkingMinutes: 11,
        distanceMiles: 0.55,
      }),
    ).toEqual([
      {
        type: "activity",
        label: "Live music activity match",
        source: "search_evidence",
        confidence: "high",
      },
    ]);
  });

  it("uses miles instead of a walk estimate beyond the requested walking limit", () => {
    const reasons = buildPairMatchReasonDetails({
      reasons: [],
      walkingMinutes: 42,
      distanceMiles: 2.1,
      includeTravelReason: true,
      walkingRequested: true,
      maxWalkingMinutes: 30,
    });

    expect(reasons).toEqual([
      {
        type: "distance",
        label: "2.10 miles between stops",
        source: "pairing",
        confidence: "high",
      },
    ]);
  });

  it("does not fabricate distance when both travel values are unavailable", () => {
    expect(
      buildPairMatchReasonDetails({
        reasons: [],
        walkingMinutes: null,
        distanceMiles: null,
        includeTravelReason: true,
      }),
    ).toEqual([]);
  });

  it("reserves room for canonical pairing evidence", () => {
    const reasons = buildPairMatchReasonDetails({
      reasons: [
        "Italian cuisine match",
        "Fits date night",
        "rooftop feature match",
        "Queens locality match",
        "budget match",
      ],
      walkingMinutes: 6,
      distanceMiles: 0.3,
      includeTravelReason: true,
      walkingRequested: true,
      maxWalkingMinutes: 30,
    });

    expect(reasons).toHaveLength(5);
    expect(reasons.at(-1)).toMatchObject({
      type: "walking",
      source: "pairing",
      label: "6-minute walk between stops",
    });
  });
});
