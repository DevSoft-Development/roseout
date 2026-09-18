import "server-only";

import { createHmac } from "node:crypto";

export function platformIntegrationApiConfigured() {
  return Boolean(
    process.env.AWS_PLATFORM_INTEGRATION_API_URL?.trim() &&
      (process.env.AWS_PLATFORM_INTEGRATION_API_SECRET?.trim() ||
        process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET?.trim()),
  );
}

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


export async function testStampsConnectionViaIntegrationApi(): Promise<{
  ok: boolean;
  message: string;
}> {
  return signedJson<{ ok: boolean; message: string }>(
    "/v1/stamps/connection-test",
    {},
    20_000,
  );
}
