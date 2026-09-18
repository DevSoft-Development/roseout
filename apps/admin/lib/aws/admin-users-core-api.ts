import "server-only";

import { createHmac } from "node:crypto";

export type CoreAdminUsersListResponse = {
  success: true;
  users: Array<Record<string, any>>;
  count: number;
  page: number;
  per: number;
  hasMore: boolean;
};

export type CoreAdminUserDetailResponse = {
  success: true;
  profile: Record<string, any>;
  beta: Record<string, any> | null;
  saved: Array<Record<string, any>>;
  booked: Array<Record<string, any>>;
  reservations: Array<Record<string, any>>;
  tickets: Array<Record<string, any>>;
  usage: Array<Record<string, any>>;
  subscription: Record<string, any> | null;
  betaAssignments: Array<Record<string, any>>;
  betaFeedback: Array<Record<string, any>>;
  betaBugReports: Array<Record<string, any>>;
};

function config() {
  const baseUrl = String(process.env.AWS_PLATFORM_CORE_API_URL || "").trim().replace(/\/$/, "");
  const secret = String(
    process.env.AWS_PLATFORM_CORE_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
  if (!baseUrl || !secret) throw new Error("aws_platform_core_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_core_api_requires_https");
  return { baseUrl, secret };
}

async function signedPost<T>(path: string, payload: unknown, timeoutMs = 18_000): Promise<T> {
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
    const result = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error((result as { error?: string } | null)?.error || `aws_platform_core_api_http_${response.status}`);
    }
    return result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readAdminUsersListViaCoreApi(
  filters: Record<string, string | undefined>,
): Promise<CoreAdminUsersListResponse> {
  return signedPost<CoreAdminUsersListResponse>(
    "/v1/admin/users/list/read",
    { filters },
  );
}

export async function readAdminUserDetailViaCoreApi(
  userId: string,
): Promise<CoreAdminUserDetailResponse> {
  return signedPost<CoreAdminUserDetailResponse>(
    "/v1/admin/users/detail/read",
    { userId },
  );
}
