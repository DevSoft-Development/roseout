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

export function getBusinessProPriceId() {
  const priceId = process.env.STRIPE_THEOUTHAVEN_PRO_PRICE_ID;

  if (!priceId) {
    throw new Error("Missing STRIPE_THEOUTHAVEN_PRO_PRICE_ID");
  }

  return priceId;
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
}
