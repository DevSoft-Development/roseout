import "server-only";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_V2_BASE = "https://api.stripe.com/v2";
const STRIPE_API_VERSION = "2026-07-29.dahlia";

export function isStripeProductionEnvironment() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

export function getStripeSecretKey() {
  const stripeSecretKey = isStripeProductionEnvironment()
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error(
      isStripeProductionEnvironment()
        ? "Missing STRIPE_SECRET_KEY"
        : "Missing STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY",
    );
  }

  return stripeSecretKey;
}

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: URLSearchParams;
  idempotencyKey?: string;
  stripeAccount?: string;
};

type StripeV2RequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export async function safeStripeRequest<T>(
  path: string,
  { method = "POST", body, idempotencyKey, stripeAccount }: StripeRequestOptions = {},
): Promise<T> {
  try {
    return await stripeRequest<T>(path, { method, body, idempotencyKey, stripeAccount });
  } catch (error) {
    console.error("Stripe request failed", { path, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function stripeRequest<T>(
  path: string,
  { method = "POST", body, idempotencyKey, stripeAccount }: StripeRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
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
  { method = "POST", body, idempotencyKey }: StripeV2RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API_V2_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
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

function getEnvironmentPriceId(liveName: string, testName: string, legacyLiveName?: string, legacyTestName?: string) {
  if (isStripeProductionEnvironment()) {
    return process.env[liveName] || (legacyLiveName ? process.env[legacyLiveName] : undefined);
  }

  return process.env[testName]
    || (legacyTestName ? process.env[legacyTestName] : undefined)
    || process.env[liveName]
    || (legacyLiveName ? process.env[legacyLiveName] : undefined);
}

export function getBusinessProMonthlyPriceId() {
  const priceId = getEnvironmentPriceId(
    "STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID",
    "STRIPE_THEOUTHAVEN_PRO_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_PRICE_ID",
  );
  if (!priceId) {
    throw new Error(
      isStripeProductionEnvironment()
        ? "Missing STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID or STRIPE_THEOUTHAVEN_PRO_PRICE_ID"
        : "Missing STRIPE_TEST_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID or STRIPE_TEST_THEOUTHAVEN_PRO_PRICE_ID",
    );
  }
  return priceId;
}

export function getBusinessProAnnualPriceId() {
  const priceId = getEnvironmentPriceId(
    "STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID",
    "STRIPE_TEST_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID",
  );
  if (!priceId) {
    throw new Error(
      isStripeProductionEnvironment()
        ? "Missing STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID"
        : "Missing STRIPE_TEST_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID",
    );
  }
  return priceId;
}

export function getBusinessProPriceId(interval: "monthly" | "annual" = "monthly") {
  return interval === "annual" ? getBusinessProAnnualPriceId() : getBusinessProMonthlyPriceId();
}

export { getSiteUrl } from "@/lib/site-url";
