import { describe, expect, it } from "vitest";
import {
  assignRankingVariant,
  validateRankingRolloutSettings,
} from "../rankingRollout";

const base = validateRankingRolloutSettings({
  enabled: true,
  rollout_percent: 100,
  admin_only: false,
  shadow_enabled: false,
  kill_switch: false,
  eligible_markets: ["nyc"],
  assignment_salt: "test:v1",
  model_version: "hybrid:test",
});

describe("ML rollout admin controls", () => {
  it("serves hybrid when eligible and inside rollout", () => {
    const result = assignRankingVariant({
      identityKey: "user-1",
      market: "nyc",
      settings: base,
    });
    expect(result.variant).toBe("hybrid");
    expect(result.reason).toBe("rollout");
  });

  it("forces control when the kill switch is active", () => {
    const result = assignRankingVariant({
      identityKey: "user-1",
      market: "nyc",
      settings: { ...base, kill_switch: true },
    });
    expect(result.variant).toBe("control");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("kill_switch");
  });

  it("keeps public traffic on control in internal-only mode", () => {
    const result = assignRankingVariant({
      identityKey: "user-1",
      market: "nyc",
      isAdmin: false,
      settings: { ...base, admin_only: true },
    });
    expect(result.variant).toBe("control");
    expect(result.reason).toBe("admin_only");
  });

  it("computes shadow ordering without serving hybrid", () => {
    const result = assignRankingVariant({
      identityKey: "admin-1",
      market: "nyc",
      isAdmin: true,
      settings: { ...base, shadow_enabled: true },
    });
    expect(result.variant).toBe("control");
    expect(result.shadow).toBe(true);
    expect(result.reason).toBe("shadow");
  });

  it("rejects invalid rollout percentages", () => {
    expect(() =>
      validateRankingRolloutSettings({ ...base, rollout_percent: 101 }),
    ).toThrow(/0 through 100/);
  });
});
