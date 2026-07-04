import "server-only";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export function getStripeSecretKey() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  return stripeSecretKey;
}

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: URLSearchParams;
};

export async function safeStripeRequest<T>(
  path: string,
  { method = "POST", body }: StripeRequestOptions = {},
): Promise<T> {
  try {
    return await stripeRequest<T>(path, { method, body });
  } catch (error) {
    console.error("Stripe request failed", { path, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function stripeRequest<T>(
  path: string,
  { method = "POST", body }: StripeRequestOptions = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
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

export function getBusinessProMonthlyPriceId() {
  const priceId = process.env.STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_THEOUTHAVEN_PRO_PRICE_ID;
  if (!priceId) throw new Error("Missing STRIPE_THEOUTHAVEN_PRO_MONTHLY_PRICE_ID or STRIPE_THEOUTHAVEN_PRO_PRICE_ID");
  return priceId;
}

export function getBusinessProAnnualPriceId() {
  const priceId = process.env.STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID;
  if (!priceId) throw new Error("Missing STRIPE_THEOUTHAVEN_PRO_ANNUAL_PRICE_ID");
  return priceId;
}

export function getBusinessProPriceId(interval: "monthly" | "annual" = "monthly") {
  return interval === "annual" ? getBusinessProAnnualPriceId() : getBusinessProMonthlyPriceId();
}

export { getSiteUrl } from "@/lib/site-url";
