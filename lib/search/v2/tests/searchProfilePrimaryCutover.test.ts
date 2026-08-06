import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {},
}));

import {
  normalizeSearchProfileRolloutConfig,
  validateSearchProfileRolloutConfig,
} from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

describe("canonical search profile primary cutover", () => {
  it("normalizes a 100 percent canary to primary", () => {
    expect(
      normalizeSearchProfileRolloutConfig({
        mode: "canary",
        canaryPercent: 100,
        killSwitch: false,
      }),
    ).toEqual({
      mode: "primary",
      canaryPercent: 100,
      killSwitch: false,
    });
  });

  it("keeps a bounded canary below 100 percent", () => {
    expect(
      normalizeSearchProfileRolloutConfig({
        mode: "canary",
        canaryPercent: 25,
        killSwitch: false,
      }),
    ).toEqual({
      mode: "canary",
      canaryPercent: 25,
      killSwitch: false,
    });
  });

  it("forces the kill switch to canonical profiles off", () => {
    expect(
      normalizeSearchProfileRolloutConfig({
        mode: "primary",
        canaryPercent: 100,
        killSwitch: true,
      }),
    ).toEqual({
      mode: "off",
      canaryPercent: 0,
      killSwitch: true,
    });
  });

  it("persists primary as an explicit 100 percent configuration", () => {
    expect(
      validateSearchProfileRolloutConfig({
        mode: "primary",
        canaryPercent: 10,
        killSwitch: false,
      }),
    ).toEqual({
      mode: "primary",
      canaryPercent: 100,
      killSwitch: false,
    });
  });
});
