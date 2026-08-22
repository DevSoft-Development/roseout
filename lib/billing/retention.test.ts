import { describe, expect, it } from "vitest";
import { calculateSubscriptionTenureMonths, getRetentionOffer } from "./retention";

describe("billing retention", () => {
  it("calculates tenure from Stripe subscription creation time", () => {
    const now = Date.UTC(2026, 7, 22);
    const created = Math.floor(Date.UTC(2025, 7, 22) / 1000);
    expect(calculateSubscriptionTenureMonths(created, now)).toBeGreaterThanOrEqual(11);
  });

  it("increases the save offer with tenure", () => {
    expect(getRetentionOffer(0).discountPercent).toBe(10);
    expect(getRetentionOffer(3).discountPercent).toBe(15);
    expect(getRetentionOffer(6).discountPercent).toBe(20);
    expect(getRetentionOffer(12).discountPercent).toBe(25);
    expect(getRetentionOffer(24).discountPercent).toBe(30);
  });

  it("caps the strongest offer at 30 percent for six months", () => {
    expect(getRetentionOffer(60)).toMatchObject({ discountPercent: 30, discountMonths: 6 });
  });
});
