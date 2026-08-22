import { describe, expect, it } from "vitest";
import { hasPaidEntitlement, normalizeBillingStatus, normalizePlanKey } from "./plans";

describe("billing plan normalization", () => {
  it.each(["business_pro", "growth_pro", "growth-pro", "growth pro", "partner_pro", "pro"])(
    "normalizes %s to business_pro",
    (value) => expect(normalizePlanKey(value)).toBe("business_pro"),
  );

  it("recognizes Stripe terminal and paused statuses", () => {
    expect(normalizeBillingStatus("incomplete_expired")).toBe("incomplete_expired");
    expect(normalizeBillingStatus("paused")).toBe("paused");
  });
});

describe("paid entitlement", () => {
  it("grants active Business Pro access", () => {
    expect(hasPaidEntitlement({ plan: "business_pro", status: "active" })).toBe(true);
  });

  it("grants a past-due account only while its grace period is still open", () => {
    const now = Date.UTC(2026, 7, 22, 12, 0, 0);
    expect(hasPaidEntitlement({
      plan: "business_pro",
      status: "grace_period",
      billingGraceEndsAt: "2026-08-23T12:00:00.000Z",
      now,
    })).toBe(true);
    expect(hasPaidEntitlement({
      plan: "business_pro",
      status: "past_due",
      billingGraceEndsAt: "2026-08-21T12:00:00.000Z",
      now,
    })).toBe(false);
  });

  it("never grants paid access to a free plan", () => {
    expect(hasPaidEntitlement({ plan: "free_discovery", status: "active" })).toBe(false);
  });
});
