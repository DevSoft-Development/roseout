import { describe, expect, it } from "vitest";
import { getLocationSubscriptionPriceId, isBusinessPlanKey } from "../../lib/business/paid-plan-billing";
describe("location subscription safety", () => {
  it("rejects unlisted software plans", () => {
    expect(isBusinessPlanKey("unlimited")).toBe(false);
    expect(isBusinessPlanKey("select-plus")).toBe(true);
  });
  it("maps each plan only to its configured monthly Stripe price", () => {
    const env = { VERCEL_ENV: "production", STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID: "price_essential123", STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_select123", STRIPE_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID: "price_signature123" } as NodeJS.ProcessEnv;
    expect(getLocationSubscriptionPriceId("essential-plus", env)).toBe("price_essential123");
    expect(getLocationSubscriptionPriceId("select-plus", env)).toBe("price_select123");
    expect(getLocationSubscriptionPriceId("signature-plus", env)).toBe("price_signature123");
  });
  it("fails closed when price missing or invalid", () => {
    expect(getLocationSubscriptionPriceId("essential-plus", { VERCEL_ENV: "production" })).toBeNull();
    expect(getLocationSubscriptionPriceId("select-plus", { VERCEL_ENV: "production", STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "invalid" })).toBeNull();
  });
  it("does not fall back from test to live prices", () => {
    expect(getLocationSubscriptionPriceId("select-plus", { VERCEL_ENV: "preview", STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_live123" })).toBeNull();
  });
});
