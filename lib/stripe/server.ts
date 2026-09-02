import "server-only";

import { stripeRequestViaIntegrationApi } from "@/lib/aws/integration-api";

export type StripeMode = "live" | "test";

export function isStripeProductionEnvironment() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

export function getDefaultStripeMode(): StripeMode {
  return isStripeProductionEnvironment() ? "live" : "test";
}

export function getStripeModeForLocation(location: Record<string, any> | null | undefined): StripeMode {
  if (!location) return getDefaultStripeMode();
  const metadata = location.metadata && typeof location.metadata === "object" ? location.metadata : {};
  const isDemo = location.is_demo === true
    || String(location.demo_key || "").trim() === "real_location_mirror_demo"
    || metadata.demo === true
    || String(metadata.demo_key || "").trim() === "real_location_mirror_demo";
  return isDemo ? "test" : getDefaultStripeMode();
}

export function getStripeSecretKey(_mode: StripeMode = getDefaultStripeMode()): never {
  throw new Error("Stripe secret keys are managed by the AWS Integration API.");
}

export function getStripePublishableKey(mode: StripeMode = getDefaultStripeMode()) {
  const key = mode === "live"
    ? process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    : process.env.STRIPE_TEST_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY
      || process.env.STRIPE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error(mode === "live" ? "Missing STRIPE_PUBLISHABLE_KEY" : "Missing STRIPE_TEST_PUBLISHABLE_KEY");
  return key;
}

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: URLSearchParams;
  idempotencyKey?: string;
  stripeAccount?: string;
  mode?: StripeMode;
};

type StripeV2RequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  mode?: StripeMode;
};

export async function safeStripeRequest<T>(
  path: string,
  { method = "POST", body, idempotencyKey, stripeAccount, mode }: StripeRequestOptions = {},
): Promise<T> {
  try {
    return await stripeRequest<T>(path, { method, body, idempotencyKey, stripeAccount, mode });
  } catch (error) {
    console.error("Stripe request failed through AWS Integration API", {
      path,
      mode: mode || getDefaultStripeMode(),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function stripeRequest<T>(
  path: string,
  { method = "POST", body, idempotencyKey, stripeAccount, mode = getDefaultStripeMode() }: StripeRequestOptions = {},
): Promise<T> {
  return stripeRequestViaIntegrationApi<T>({
    apiVersion: "v1",
    mode,
    method,
    path,
    form: body?.toString(),
    idempotencyKey,
    stripeAccount,
  });
}

export function stripeV2Request<T>(
  path: string,
  { method = "POST", body, idempotencyKey, mode = getDefaultStripeMode() }: StripeV2RequestOptions = {},
): Promise<T> {
  return stripeRequestViaIntegrationApi<T>({
    apiVersion: "v2",
    mode,
    method,
    path,
    body,
    idempotencyKey,
  });
}

function getEnvironmentPriceId(liveName: string, testName: string, legacyLiveName?: string, legacyTestName?: string, mode: StripeMode = getDefaultStripeMode()) {
  if (mode === "live") {
    return process.env[liveName] || (legacyLiveName ? process.env[legacyLiveName] : undefined);
  }
  return process.env[testName]
    || (legacyTestName ? process.env[legacyTestName] : undefined)
    || process.env[liveName]
    || (legacyLiveName ? process.env[legacyLiveName] : undefined);
}

export function getBusinessProMonthlyPriceId(mode: StripeMode = getDefaultStripeMode()) {
  const priceId = getEnvironmentPriceId(
    "STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID",
    "STRIPE_THEOUTHAVEN_PRO_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_PRICE_ID",
    mode,
  );
  if (!priceId) throw new Error(mode === "live" ? "Missing STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID or STRIPE_THEOUTHAVEN_PRO_PRICE_ID" : "Missing STRIPE_TEST_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID or STRIPE_TEST_THEOUTHAVEN_PRO_PRICE_ID");
  return priceId;
}

export function getBusinessProAnnualPriceId(mode: StripeMode = getDefaultStripeMode()) {
  const priceId = getEnvironmentPriceId(
    "STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID",
    undefined,
    undefined,
    mode,
  );
  if (!priceId) throw new Error(mode === "live" ? "Missing STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID" : "Missing STRIPE_TEST_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID");
  return priceId;
}

export function getBusinessProPriceId(interval: "monthly" | "annual" = "monthly", mode: StripeMode = getDefaultStripeMode()) {
  return interval === "annual" ? getBusinessProAnnualPriceId(mode) : getBusinessProMonthlyPriceId(mode);
}

export { getSiteUrl } from "@/lib/site-url";
