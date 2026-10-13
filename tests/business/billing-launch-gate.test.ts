import { describe, expect, it } from "vitest";
import { getLocationSubscriptionPriceId } from "../../lib/business/paid-plan-billing";

/** This contract never enables checkout; release requires separately verified configuration. */
describe("production billing launch prerequisites", () => {
  const plans = ["essential-plus", "select-plus", "signature-plus"] as const;
  it("requires all three distinct live price IDs", () => {
    const env = {
      VERCEL_ENV: "production",
      STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID: "price_essential123",
      STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_select123",
      STRIPE_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID: "price_signature123",
    } as NodeJS.ProcessEnv;
    const prices = plans.map(p => getLocationSubscriptionPriceId(p, env));
    expect(new Set(prices).size).toBe(3);
    expect(prices.every(Boolean)).toBe(true);
  });
  it("does not silently accept missing production configuration", () => {
    for (const plan of plans) expect(getLocationSubscriptionPriceId(plan, { VERCEL_ENV: "production" })).toBeNull();
  });
});
