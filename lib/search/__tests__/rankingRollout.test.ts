import { describe, expect, it } from "vitest";
import { assignRankingVariant, type RolloutSettings } from "@/lib/search/rankingRollout";

const settings: RolloutSettings = {
  enabled: true,
  rollout_percent: 25,
  admin_only: false,
  eligible_markets: ["nyc"],
  assignment_salt: "phase4d:test",
  model_version: "hybrid:test",
};

describe("assignRankingVariant", () => {
  it("is stable for the same identity", () => {
    const first = assignRankingVariant({ identityKey: "session-123", market: "nyc", settings });
    const second = assignRankingVariant({ identityKey: "session-123", market: "nyc", settings });
    expect(second).toEqual(first);
  });

  it("returns control when rollout is disabled", () => {
    const result = assignRankingVariant({ identityKey: "session-123", market: "nyc", settings: { ...settings, enabled: false } });
    expect(result.variant).toBe("control");
    expect(result.eligible).toBe(false);
  });

  it("enforces market eligibility", () => {
    const result = assignRankingVariant({ identityKey: "session-123", market: "long-island", settings });
    expect(result.variant).toBe("control");
    expect(result.eligible).toBe(false);
  });

  it("enforces admin-only mode", () => {
    const result = assignRankingVariant({ identityKey: "session-123", market: "nyc", isAdmin: false, settings: { ...settings, admin_only: true } });
    expect(result.variant).toBe("control");
    expect(result.eligible).toBe(false);
  });
});