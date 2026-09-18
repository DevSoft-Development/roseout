import "server-only";

import { createHmac } from "node:crypto";

export type CoreAdminPayoutOwner = {
  ownerType: "Location" | "Organizer";
  ownerId: string;
  name: string;
  accountId: string;
  apiVersion: string;
  onboarding: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requiresAction: boolean;
  updatedAt: string | null;
};

export type CoreAdminPayoutAuditRow = {
  id: string;
  eventType: string;
  payoutId: string | null;
  amount: number | null;
  currency: string | null;
  createdAt: string | null;
  processingError: string | null;
  failureMessage: string | null;
};

export type CoreAdminPayoutsResponse = {
  success: true;
  owners: CoreAdminPayoutOwner[];
  auditRows: CoreAdminPayoutAuditRow[];
};

function config() {
  const baseUrl = String(process.env.AWS_PLATFORM_CORE_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(
    process.env.AWS_PLATFORM_CORE_API_SECRET ||
      process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET ||
      "",
  ).trim();

  if (!baseUrl || !secret) {
    throw new Error("aws_platform_core_api_not_configured");
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("aws_platform_core_api_requires_https");
  }

  return { baseUrl, secret };
}

async function signedRequest<T>(
  method: "GET" | "POST",
  path: string,
  body = "",
  timeoutMs = 18_000,
): Promise<T> {
  const { baseUrl, secret } = config();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, method, path, body].join("\n"))
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(body ? { body } : {}),
    });

    const payload = (await response.json().catch(() => null)) as
      | T
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        (payload as { error?: string } | null)?.error ||
          `aws_platform_core_api_http_${response.status}`,
      );
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function readAdminPayoutsViaCoreApi(): Promise<CoreAdminPayoutsResponse> {
  return signedRequest<CoreAdminPayoutsResponse>(
    "POST",
    "/v1/admin/payouts/read",
    "{}",
  );
}
