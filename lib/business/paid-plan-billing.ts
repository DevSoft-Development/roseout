import { BUSINESS_PLAN_KEYS, type BusinessPlanKey } from "./entry-intent";

/** Explicit server-side Stripe Price IDs. Never derive prices or privileges from a URL. */
export function isBusinessPlanKey(value: unknown): value is BusinessPlanKey {
  return typeof value === "string" && BUSINESS_PLAN_KEYS.some(key => key === value);
}
export function getLocationSubscriptionPriceId(plan: BusinessPlanKey, env: NodeJS.ProcessEnv = process.env): string | null {
  const keys: Record<BusinessPlanKey, string> = {
    "essential-plus": "STRIPE_LOCATION_ESSENTIAL_PLUS_MONTHLY_PRICE_ID",
    "select-plus": "STRIPE_LOCATION_SELECT_PLUS_MONTHLY_PRICE_ID",
    "signature-plus": "STRIPE_LOCATION_SIGNATURE_PLUS_MONTHLY_PRICE_ID",
  };
  const key = (env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && env.NODE_ENV === "production"))
    ? keys[plan]
    : keys[plan].replace("STRIPE_", "STRIPE_TEST_");
  const value = env[key]?.trim();
  return value && /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}
