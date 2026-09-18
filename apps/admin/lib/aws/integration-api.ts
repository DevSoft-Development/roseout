import "server-only";

import { createHmac } from "node:crypto";

export type IntegrationBalanceAmount = { amount: number; currency: string };
export type IntegrationStripePayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date?: number | null;
  created?: number | null;
  method?: string | null;
  type?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  destination?: string | null;
};
export type IntegrationStripeConnectSnapshot = {
  accountId: string;
  available: IntegrationBalanceAmount[];
  pending: IntegrationBalanceAmount[];
  payouts: IntegrationStripePayout[];
  error: string | null;
};
export type IntegrationStripeConnectSnapshotResponse = {
  ok: true;
  snapshots: IntegrationStripeConnectSnapshot[];
  partial: boolean;
};

function config() {
  const baseUrl = String(
    process.env.AWS_PLATFORM_INTEGRATION_API_URL || "",
  )
    .trim()
    .replace(/\/$/, "");
  const secret = String(
    process.env.AWS_PLATFORM_INTEGRATION_API_SECRET ||
      process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET ||
      "",
  ).trim();

  if (!baseUrl || !secret) {
    throw new Error("aws_platform_integration_api_not_configured");
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("aws_platform_integration_api_requires_https");
  }

  return { baseUrl, secret };
}

async function signedJson<T>(
  path: string,
  payload: unknown,
  timeoutMs = 15_000,
): Promise<T> {
  const { baseUrl, secret } = config();
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, "POST", path, body].join("\n"))
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      body,
    });

    const parsed = (await response.json().catch(() => null)) as
      | T
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        (parsed as { error?: string } | null)?.error ||
          `aws_platform_integration_api_http_${response.status}`,
      );
    }

    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function sendEmailViaIntegrationApi(input: {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}) {
  return signedJson<{ id?: string; sent?: boolean }>(
    "/v1/resend/emails/send",
    input,
  );
}

export function readStripeConnectPayoutsViaIntegrationApi(
  accountIds: string[],
): Promise<IntegrationStripeConnectSnapshotResponse> {
  return signedJson<IntegrationStripeConnectSnapshotResponse>(
    "/v1/stripe-connect/payouts/read",
    { accountIds },
  );
}

export function stripeRequestViaIntegrationApi<T>(input: {
  apiVersion?: "v1" | "v2";
  mode?: "live" | "test";
  method?: "GET" | "POST";
  path: string;
  form?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  stripeAccount?: string;
}): Promise<T> {
  return signedJson<T>("/v1/stripe/request", input, 20_000);
}
