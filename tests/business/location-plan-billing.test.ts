import { verifiedLocationPlanFromStripe, canActivateLocationPlan } from "../../lib/business/stripe-location-entitlements";
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

it("documents the three live Stripe prices without enabling checkout", () => {
  const live = {
    VERCEL_ENV: "production",
    STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID: "price_1U3coN01cWE2hGZL6t8WNZsh",
    STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_1UPkIC01cWE2hGZLwK9VxAuu",
    STRIPE_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID: "price_1UPkIE01cWE2hGZLUo2lFXaz",
  } as NodeJS.ProcessEnv;
  expect(getLocationSubscriptionPriceId("essential-plus", live)).toBe(live.STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID);
  expect(getLocationSubscriptionPriceId("select-plus", live)).toBe(live.STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID);
  expect(getLocationSubscriptionPriceId("signature-plus", live)).toBe(live.STRIPE_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID);
});

describe("Stripe-confirmed location entitlement", () => {
  const environment = { STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID: "price_select123" } as NodeJS.ProcessEnv;
  it("accepts verified Stripe plan and expected live price", () => {
    expect(verifiedLocationPlanFromStripe({ source: "location_plan_checkout", plan: "select-plus", priceId: "price_select123", livemode: true, environment })).toBe("select-plus");
  });
  it("rejects forged plan, price, or non-platform checkout", () => {
    expect(verifiedLocationPlanFromStripe({ source: "other", plan: "select-plus", priceId: "price_select123", livemode: true, environment })).toBeNull();
    expect(verifiedLocationPlanFromStripe({ source: "location_plan_checkout", plan: "signature-plus", priceId: "price_select123", livemode: true, environment })).toBeNull();
  });
  it("requires an active Stripe subscription and a location before activation", () => {
    const input = { plan: "select-plus" as const, subscriptionId: "sub_123", locationId: "loc_123" };
    expect(canActivateLocationPlan({ ...input, status: "incomplete" })).toBe(false);
    expect(canActivateLocationPlan({ ...input, status: "active" })).toBe(true);
    expect(canActivateLocationPlan({ ...input, locationId: null, status: "active" })).toBe(false);
  });
});
