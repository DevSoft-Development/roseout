import { describe, expect, it } from "vitest";
import { evaluateLocationSubscriptionEvent } from "../../lib/business/subscription-release-policy";
const base = { currentSubscriptionId: "sub_current", eventSubscriptionId: "sub_current", authoritativeSubscriptionId: "sub_current", locationId: "location-1", source: "location_plan_checkout", plan: "select-plus", priceId: "price_select123", livemode: true, currentStatus: "active", environment: { STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_select123" } as NodeJS.ProcessEnv };
describe("subscription release policy", () => {
  it("activates only validated, active subscriptions", () => expect(evaluateLocationSubscriptionEvent(base)).toMatchObject({ action: "activate", plan: "select-plus" }));
  it("ignores stale webhooks", () => expect(evaluateLocationSubscriptionEvent({ ...base, eventSubscriptionId: "sub_old" }).action).toBe("ignore"));
  it("ignores subscription replaced on location", () => expect(evaluateLocationSubscriptionEvent({ ...base, currentSubscriptionId: "sub_new" }).action).toBe("ignore"));
  it("does not activate unpaid subscriptions", () => expect(evaluateLocationSubscriptionEvent({ ...base, currentStatus: "incomplete" }).action).toBe("deactivate"));
  it("rejects mismatched pricing", () => expect(evaluateLocationSubscriptionEvent({ ...base, priceId: "price_wrong" }).action).toBe("ignore"));
});
