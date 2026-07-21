import { describe, expect, it } from "vitest";
import { buildGrowthRecommendations, calculateGrowthReadinessScore, dedupeByKey, isActiveOffer, normalizeGrowthChildTab } from "../growth-workspace";

describe("growth workspace helpers", () => {
  it("maps legacy and new growth tabs", () => {
    expect(normalizeGrowthChildTab("offers")).toBe("offers");
    expect(normalizeGrowthChildTab("vip")).toBe("vip-list");
    expect(normalizeGrowthChildTab("event-leads")).toBe("event-leads");
    expect(normalizeGrowthChildTab("marketing-studio")).toBe("marketing-studio");
    expect(normalizeGrowthChildTab("growth-overview")).toBe("growth-overview");
    expect(normalizeGrowthChildTab("campaigns")).toBe("campaigns");
    expect(normalizeGrowthChildTab("bad")).toBe("growth-overview");
  });

  it("calculates deterministic explainable readiness scores", () => {
    const readiness = calculateGrowthReadinessScore({
      location: { name: "A", description: "B", category: "Restaurant", address: "1 Main", city: "NYC", is_searchable: true, main_image: "x", reservation_url: "https://example.com", phone: "555", website: "https://example.com" },
      offers: [{ status: "active", end_date: "2999-01-01" }], vipCount: 2, leads: [{ status: "new" }], qrCodes: [{ id: 1 }], generations: [{ id: 1 }], reservations: 1, analyticsAvailable: true,
    });
    expect(readiness.score).toBeGreaterThan(80);
    expect(readiness.categories).toHaveLength(12);
    expect(readiness.completedItems).toContain("Offers");
  });

  it("deduplicates recommendations and skips completed features", () => {
    expect(dedupeByKey([{ key: "a" }, { key: "A" }, { key: "b" }], (x) => x.key)).toHaveLength(2);
    const readiness = calculateGrowthReadinessScore({ location: {}, offers: [], vipCount: 0, leads: [], qrCodes: [], generations: [], reservations: 0, analyticsAvailable: false });
    const recs = buildGrowthRecommendations({ location: { reservation_url: "https://example.com", vip_signup_url: "https://example.com/vip" }, readiness, offers: [{ status: "active", end_date: "2999-01-01" }], vipCount: 1, leads: [], qrCodes: [{ id: 1 }], generations: [{ id: 1 }], campaigns: [], planStatus: "active", baseHref: "/x?tab=" });
    expect(recs.map((r) => r.key)).not.toContain("offer");
    expect(recs.map((r) => r.key)).not.toContain("vip");
    expect(recs.map((r) => r.key)).not.toContain("qr");
  });

  it("prevents active offers from surviving expiration", () => {
    expect(isActiveOffer({ status: "active", end_date: "2000-01-01" }, new Date("2026-01-01"))).toBe(false);
    expect(isActiveOffer({ status: "active", end_date: "2999-01-01" }, new Date("2026-01-01"))).toBe(true);
    expect(isActiveOffer({ status: "paused", end_date: "2999-01-01" }, new Date("2026-01-01"))).toBe(false);
  });
});
