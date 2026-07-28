import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
import { classifyV2Search } from "../observability/healthClassifier";
import {
  assignSearchCoreVersion,
  rolloutBucket,
  validateSearchCoreConfig,
  type SearchCoreConfig,
} from "../../searchCoreConfig";
const config: SearchCoreConfig = {
  enabled: true,
  mode: "percentage",
  rolloutPercentage: 25,
  shadowEnabled: false,
  killSwitch: false,
  internalOnly: false,
  source: "database",
  updatedAt: null,
  updatedBy: null,
};
const response = (overrides: Record<string, unknown> = {}) => ({
  requestFulfilled: true,
  partialResults: false,
  requestedMode: "paired_outing" as const,
  counts: {
    retrievedCandidates: 2,
    restaurantCandidates: 1,
    activityCandidates: 1,
    dualRoleCandidates: 0,
    restaurantCards: 0,
    activityCards: 0,
    sameVenueCards: 0,
    pairs: 1,
    displayedResults: 1,
  },
  fallback: { used: false, reason: null },
  ...overrides,
});
describe("Search Core V2 admin integration", () => {
  it("uses pair cards to fulfill both roles without false zero-role issues", () =>
    expect(classifyV2Search(response())).toMatchObject({
      fulfilled: true,
      restaurantFulfilled: true,
      activityFulfilled: true,
      issueCodes: [],
    }));
  it("classifies fallback outcomes by fulfillment", () =>
    expect(
      classifyV2Search(
        response({ fallback: { used: true, reason: "targeted" } }),
      ).fallbackOutcome,
    ).toBe("successful"));
  it("assigns a stable deterministic bucket", () =>
    expect(rolloutBucket("stable-user")).toBe(rolloutBucket("stable-user")));
  it("applies kill switch before persisted rollout", () =>
    expect(
      assignSearchCoreVersion({
        config: { ...config, killSwitch: true, rolloutPercentage: 100 },
        requestId: "r",
      }).engine,
    ).toBe("legacy"));
  it("allows authorized Search Lab override before kill switch", () =>
    expect(
      assignSearchCoreVersion({
        config: { ...config, killSwitch: true },
        override: "v2",
        authorizedOverride: true,
        requestId: "r",
      }).reason,
    ).toBe("admin_override"));
  it("enforces internal-only mode", () =>
    expect(
      assignSearchCoreVersion({
        config: { ...config, internalOnly: true },
        isAdmin: false,
        requestId: "r",
      }).reason,
    ).toBe("internal_only"));
  it("validates integer percentages and serving modes", () => {
    expect(() =>
      validateSearchCoreConfig({ ...config, rolloutPercentage: 101 }),
    ).toThrow();
    expect(validateSearchCoreConfig(config).rolloutPercentage).toBe(25);
  });
});
