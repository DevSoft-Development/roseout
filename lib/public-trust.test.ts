import { describe, expect, it } from "vitest";
import {
  getPublicTrustBadges,
  getPublicVerificationState,
} from "./public-trust";

describe("public verification trust state", () => {
  const now = new Date("2026-09-21T12:00:00Z");

  it("never treats featured placement as business verification", () => {
    const state = getPublicVerificationState({ featured: true, is_featured: true }, now);
    expect(state.verified).toBe(false);
    expect(getPublicTrustBadges({ featured: true, is_featured: true })).not.toContain("Verified business");
  });

  it("uses explicit verification and claim states", () => {
    const state = getPublicVerificationState({
      is_verified: true,
      is_claimed: true,
    }, now);
    expect(state).toMatchObject({ verified: true, claimed: true });
    expect(getPublicTrustBadges({ is_verified: true, is_claimed: true })).toEqual([
      "Verified business",
      "Owner claimed",
    ]);
  });

  it("labels recent quality checks without claiming stale data is recent", () => {
    expect(getPublicVerificationState({
      last_quality_check_at: "2026-09-18T08:00:00Z",
    }, now)).toMatchObject({
      freshness: "recent",
      freshnessLabel: "Recently checked Sep 18",
    });

    expect(getPublicVerificationState({
      last_quality_check_at: "2026-06-01T08:00:00Z",
    }, now)).toMatchObject({
      freshness: "stale",
      freshnessLabel: "Last checked Jun 1",
    });
  });
});
