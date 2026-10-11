import { describe, expect, it } from "vitest";
import { parseBusinessEntryIntent } from "../../lib/business/entry-intent";
import { getBusinessEntryReturnPath } from "../../lib/business/entry-return";
import { getClaimReadiness } from "../../lib/business/free-claim-readiness";
import { resolveCheckoutGate } from "../../lib/business/plan-checkout-gate";
import { getLocationPlanConfig } from "../../lib/business/product-entitlements";
import { getDiscoveryReadiness } from "../../lib/business/discovery-readiness";

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
    expect(getLocationPlanConfig("essential-plus").monthlyUsd).toBe(99);
    expect(getLocationPlanConfig("select-plus").pos).toBe(true);
    expect(getLocationPlanConfig("signature-plus").aiReceptionistMinutes).toBe(150);
  });
});

describe("discovery-first location onboarding", () => {
  const profile = { key: "profile", status: "complete", optional: false } as const;
  const optional = [
    { key: "plan", status: "needs_setup", optional: true },
    { key: "reservations", status: "needs_setup", optional: true },
    { key: "events_experiences", status: "needs_setup", optional: true },
  ] as const;
  it("allows free discovery readiness with no paid plan, booking setup or events", () => {
    expect(getDiscoveryReadiness([profile, ...optional])).toMatchObject({
      discoveryReady: true, nextRequiredStep: null, readinessPercent: 25
    });
  });
  it("requires a complete public discovery profile", () => {
    expect(getDiscoveryReadiness([{ ...profile, status: "needs_setup" }, ...optional])).toMatchObject({
      discoveryReady: false, nextRequiredStep: "profile"
    });
  });
  it("applies equally across location types", () => {
    for (const locationType of ["restaurant", "bar", "nightclub", "activity", "event_space", "entertainment"]) {
      expect(getDiscoveryReadiness([profile, ...optional]).discoveryReady, locationType).toBe(true);
    }
  });
  it("never treats optional tools as required for discovery", () => {
    expect(getDiscoveryReadiness([profile, { key: "plan", status: "skipped", optional: true }]).discoveryReady).toBe(true);
  });
});
