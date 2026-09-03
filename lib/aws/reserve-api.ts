import "server-only";

import { createHmac } from "node:crypto";

export type ReserveApiAssignmentInput = {
  reservationId: string;
  locationId: string;
  resourceId: string | null;
  resourceLabel: string;
  resourceType: string;
  resourceCapacity: number | null;
  seatAfterAssign: boolean;
  staffProfileId: string | null;
  overrideReason: string | null;
};

function configuredSecret() {
  return String(
    process.env.AWS_RESERVE_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
}

function config() {
  const baseUrl = String(process.env.AWS_RESERVE_API_URL || "").trim().replace(/\/$/, "");
  const secret = configuredSecret();
  if (!baseUrl || !secret) throw new Error("aws_reserve_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_reserve_api_requires_https");
  return { baseUrl, secret };
}

export function reserveApiConfigured() {
  return Boolean(process.env.AWS_RESERVE_API_URL?.trim() && configuredSecret());
}

async function signedRequest<T>(method: "GET" | "POST", path: string, body = "", timeoutMs = 8_000): Promise<T> {
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
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `aws_reserve_api_http_${response.status}`);
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function assignReserveResourceViaAws(input: ReserveApiAssignmentInput) {
  return signedRequest<{ success: true; reservation: Record<string, unknown> }>(
    "POST",
    "/v1/reserve/assign",
    JSON.stringify(input),
  );
}

export async function assignReserveServerViaAws(input: {
  reservationId: string;
  locationId: string;
  serverStaffProfileId: string;
  actorStaffProfileId: string | null;
}) {
  return signedRequest<{ success: true; reservation: Record<string, unknown> }>(
    "POST",
    "/v1/reserve/assign-server",
    JSON.stringify(input),
  );
}

export async function readReserveApiHealth() {
  return signedRequest<{ ok: boolean; service: string }>("GET", "/healthz");
}
