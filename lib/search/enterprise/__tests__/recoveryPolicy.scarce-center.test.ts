import { describe, expect, it } from "vitest";
import { mergeRecoveredCandidates, planPairRecovery } from "../recoveryPolicy";

describe("pair recovery centering", () => {
  it("retrieves restaurants around a scarce activity", () => {
    expect(
      planPairRecovery({
        restaurantCount: 12,
        activityCount: 1,
        pairCount: 0,
        radiusMiles: 8,
        maxPairDistanceMiles: 1.5,
      }),
    ).toMatchObject({
      shouldRecover: true,
      lane: "restaurant",
      centerOn: "activity",
      radiusMiles: 12,
      maxPairDistanceMiles: 3,
    });
  });

  it("retrieves activities around a scarce restaurant", () => {
    expect(
      planPairRecovery({
        restaurantCount: 1,
        activityCount: 8,
        pairCount: 0,
      }),
    ).toMatchObject({
      shouldRecover: true,
      lane: "activity",
      centerOn: "restaurant",
    });
  });

  it("marks merged second-pass rows with recovery provenance", () => {
    const merged = mergeRecoveredCandidates(
      [],
      [{ id: "recovered", name: "Recovered Karaoke" } as any],
    );

    expect(merged[0]).toMatchObject({
      id: "recovered",
      recovery_generated: true,
      post_filter_recovery: true,
    });
  });
});
