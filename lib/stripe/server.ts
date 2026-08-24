import "server-only";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_V2_BASE = "https://api.stripe.com/v2";
const STRIPE_API_VERSION = "2026-07-29.dahlia";

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

export function getStripeSecretKey(mode: StripeMode = getDefaultStripeMode()) {
  const stripeSecretKey = mode === "live"
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error(mode === "live" ? "Missing STRIPE_SECRET_KEY" : "Missing STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY");
  }

  return stripeSecretKey;
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
    console.error("Stripe request failed", { path, mode: mode || getDefaultStripeMode(), message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function stripeRequest<T>(
  path: string,
  { method = "POST", body, idempotencyKey, stripeAccount, mode = getDefaultStripeMode() }: StripeRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(mode)}`,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(stripeAccount ? { "Stripe-Account": stripeAccount } : {}),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Stripe request failed.");
  }

  return payload as T;
}

export async function stripeV2Request<T>(
  path: string,
  { method = "POST", body, idempotencyKey, mode = getDefaultStripeMode() }: StripeV2RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API_V2_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(mode)}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error?.code || "Stripe v2 request failed.");
  }
  return payload as T;
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
