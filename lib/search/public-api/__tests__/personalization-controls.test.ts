import { describe, expect, it, vi } from "vitest";
import { createPublicSearchController } from "../controller";

describe("personalization request controls", () => {
  it("passes disabled personalization for one-time opt out", async () => {
    const runSearch = vi.fn(async () => ({ success: true, restaurants: [], activities: [], pairs: [], cards: [], matched_locations: [], debug: {}, card_counts: { restaurants: 0, activities: 0, pairs: 0, matched_locations: 0 } }));
    const controller = createPublicSearchController({
      getIdentity: vi.fn(async () => ({ user: { id: "u1" }, guestId: null, setGuestCookie: false })) as any,
      checkLimit: vi.fn(async () => ({ allowed: true, plan: { planKey: "test" }, weeklyLimit: 100, usedThisWeek: 0 })) as any,
      runSearch: runSearch as any,
      recordUsage: vi.fn() as any,
      logAnalytics: vi.fn() as any,
      logSearchHealth: vi.fn() as any,
    });
    await controller(new Request("https://theouthaven.com/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "Italian dinner", disablePersonalization: true }) }));
    expect(runSearch).toHaveBeenCalledWith(expect.objectContaining({ personalizationMode: "disabled", personalizationConsentReason: "one_time_opt_out" }));
  });
});
