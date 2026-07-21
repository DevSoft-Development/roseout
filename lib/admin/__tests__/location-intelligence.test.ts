import { describe, expect, it } from "vitest";
import { calculateLocationHealthScore, compareMetric, dedupeRecommendations, freshnessState, maskSensitiveValue, normalizeActivityChildTab } from "../location-intelligence";

describe("location intelligence workspace helpers", () => {
  it("maps legacy activity tabs to child tabs", () => {
    expect(normalizeActivityChildTab("analytics", null)).toBe("overview");
    expect(normalizeActivityChildTab("reviews-feedback", null)).toBe("reviews");
    expect(normalizeActivityChildTab("logs", null)).toBe("system-logs");
    expect(normalizeActivityChildTab("analytics", "health-score")).toBe("health-score");
  });
  it("does not emit misleading zero-baseline percentages", () => {
    expect(compareMetric(5, 0)).toMatchObject({ percent: null, label: "New" });
    expect(compareMetric(0, 0)).toMatchObject({ percent: null, label: "No prior data" });
  });
  it("calculates deterministic health scores and suppresses completed duplicate recommendations", () => {
    const input = { name: "A", address: "B", city: "C", description: "D", phone: "1", is_searchable: true, publishReady: true, readyToApprove: true, main_image: "x", galleryCount: 4, category: "Food", reservation_url: "https://x", is_claimed: true, claim_code: "c", qrCodeCount: 1, average_rating: 4, hasFreshData: true };
    expect(calculateLocationHealthScore(input)).toEqual(calculateLocationHealthScore(input));
    expect(dedupeRecommendations([{ title: "Add hours" }, { title: "Add hours" }, { title: "Done", complete: true }])).toHaveLength(1);
  });
  it("classifies freshness and masks sensitive audit/log values", () => {
    expect(freshnessState("2026-07-21T00:00:00Z", new Date("2026-07-21T12:00:00Z"))).toBe("fresh");
    expect(maskSensitiveValue("owner@example.com token=abc", "viewer")).toContain("token=••••");
  });
});
