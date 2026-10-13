import { describe, expect, it } from "vitest";
import { getClaimPlanSelection } from "../../lib/business/claim-plan-return";
import { getClaimReadiness } from "../../lib/business/free-claim-readiness";
import { getDiscoveryReadiness } from "../../lib/business/discovery-readiness";
import { evaluateLocationSubscriptionEvent } from "../../lib/business/subscription-release-policy";

describe("discovery to paid location journey contract", () => {
  it("keeps free discovery independent of any paid plan", () => {
    expect(getClaimReadiness({ ownerVerified: true, profileComplete: true, paidSubscriptionActive: false }).canManageFreeListing).toBe(true);
    expect(getDiscoveryReadiness([{ key: "profile", optional: false, status: "complete" }, { key: "plan", optional: true, status: "needs_setup" }]).discoveryReady).toBe(true);
  });
  it("carries Select+ from marketing through claim without confusing billing interval", () => {
    const result = getClaimPlanSelection("plan=monthly&product_plan=select-plus&source=theposhaven");
    expect(result.entry.plan).toBe("select-plus");
    expect(result.planReviewHref).toContain("plan=select-plus");
  });
  it("does not activate entitlement when Stripe reports an incomplete payment", () => {
    expect(evaluateLocationSubscriptionEvent({ currentSubscriptionId: "sub_1", eventSubscriptionId: "sub_1", authoritativeSubscriptionId: "sub_1", locationId: "loc", source: "location_plan_checkout", plan: "essential-plus", priceId: "price_123", livemode: true, currentStatus: "incomplete", environment: { STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID: "price_123" } as NodeJS.ProcessEnv }).action).toBe("deactivate");
  });
});
