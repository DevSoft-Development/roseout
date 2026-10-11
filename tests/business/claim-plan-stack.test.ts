import { describe, expect, it } from "vitest";
import { parseBusinessEntryIntent } from "../../lib/business/entry-intent";
import { getBusinessEntryReturnPath } from "../../lib/business/entry-return";
import { getClaimReadiness } from "../../lib/business/free-claim-readiness";
import { resolveCheckoutGate } from "../../lib/business/plan-checkout-gate";
import { getRestaurantPlanConfig } from "../../lib/business/product-entitlements";

describe("claim and subscription handoff", () => {
  it("recognizes valid plans without allowing arbitrary plan ids", () => {
    expect(parseBusinessEntryIntent(new URLSearchParams("intent=signup&plan=select-plus")).plan).toBe("select-plus");
    expect(parseBusinessEntryIntent(new URLSearchParams("plan=admin")).plan).toBeNull();
  });
  it("canonicalizes return paths and blocks redirect injection", () => {
    expect(getBusinessEntryReturnPath("plan=essential-plus&source=theposhaven&next=https://evil.test"))
      .toBe("/business/onboarding?intent=signup&plan=essential-plus&source=theposhaven");
  });
  it("lets verified owners manage free listings without a subscription", () => {
    expect(getClaimReadiness({ ownerVerified: true, profileComplete: true, paidSubscriptionActive: false }))
      .toMatchObject({ canManageFreeListing: true, freeListingReady: true, paidFeaturesActive: false });
  });
  it("does not activate a paid plan without verified ownership and payment", () => {
    const input = { plan: "select-plus" as const, locationId: "location", ownerVerified: false, paymentConfirmed: true };
    expect(resolveCheckoutGate(input).stage).toBe("verify_owner");
    expect(resolveCheckoutGate({ ...input, ownerVerified: true, paymentConfirmed: false }).stage).toBe("checkout");
    expect(resolveCheckoutGate({ ...input, ownerVerified: true }).stage).toBe("activate");
  });
  it("includes increasing, explicit monthly usage allowances", () => {
    expect(getRestaurantPlanConfig("essential-plus").monthlyUsd).toBe(99);
    expect(getRestaurantPlanConfig("select-plus").pos).toBe(true);
    expect(getRestaurantPlanConfig("signature-plus").aiReceptionistMinutes).toBe(150);
  });
});
