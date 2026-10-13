import { describe, expect, it } from "vitest";
import { getLocationSubscriptionPriceId } from "../../lib/business/paid-plan-billing";
import { verifiedLocationPlanFromStripe } from "../../lib/business/stripe-location-entitlements";

// Stripe test-mode prices on TheOutHaven LLC sandbox (acct_1U3ZAy1uqlTAOmyx).
// These are public identifiers, not credentials. Sandbox secrets must remain in the vault.
const sandbox = {
  VERCEL_ENV: "preview",
  STRIPE_TEST_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID: "price_1U7nwy1uqlTAOmyxqkI91P9d",
  STRIPE_TEST_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_1UPzvi1uqlTAOmyxnoR4Dh1a",
  STRIPE_TEST_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID: "price_1UPzvk1uqlTAOmyx0b8YThQu",
} as NodeJS.ProcessEnv;

describe("TheOutHaven Stripe sandbox plan mapping", () => {
  it.each([
    ["essential-plus", "price_1U7nwy1uqlTAOmyxqkI91P9d"],
    ["select-plus", "price_1UPzvi1uqlTAOmyxnoR4Dh1a"],
    ["signature-plus", "price_1UPzvk1uqlTAOmyx0b8YThQu"],
  ] as const)("maps %s only to the sandbox price", (plan, priceId) => {
    expect(getLocationSubscriptionPriceId(plan, sandbox)).toBe(priceId);
    expect(verifiedLocationPlanFromStripe({ source: "location_plan_checkout", plan, priceId, livemode: false, environment: sandbox })).toBe(plan);
    expect(verifiedLocationPlanFromStripe({ source: "location_plan_checkout", plan, priceId, livemode: true, environment: sandbox })).toBeNull();
  });
  it("does not accept sandbox prices with production-only settings", () => {
    expect(getLocationSubscriptionPriceId("select-plus", { VERCEL_ENV: "production", ...{ STRIPE_TEST_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: sandbox.STRIPE_TEST_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID } })).toBeNull();
  });
});
