import "server-only";

import { createHmac } from "node:crypto";

export type PlatformJobType = "email.send";

export type PlatformJob = {
  jobType: PlatformJobType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export type PlatformJobBatchResult = {
  ok: boolean;
  accepted: number;
  failed: number;
  results: Array<{
    idempotencyKey: string;
    accepted: boolean;
    messageId?: string | null;
    error?: string | null;
  }>;
};

export type PlatformJobGatewayStatus = {
  ok: boolean;
  authenticated: boolean;
  environment?: string | null;
};

function getGatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("aws_platform_job_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_job_gateway_requires_https");
  return { baseUrl, secret };
}

export function platformJobGatewayConfigured() {
  return Boolean(
    process.env.AWS_PLATFORM_JOB_GATEWAY_URL?.trim()
      && process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET?.trim(),
  );
}

async function signedRequest<T>(method: "GET" | "POST", path: string, body = ""): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const timestamp = Date.now().toString();
  const payload = [timestamp, method, path, body].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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
    const data = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error || `aws_platform_job_gateway_http_${response.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPlatformJobGatewayStatus(): Promise<PlatformJobGatewayStatus> {
  return signedRequest<PlatformJobGatewayStatus>("GET", "/v1/status");
}

export async function enqueuePlatformJobs(jobs: PlatformJob[]): Promise<PlatformJobBatchResult> {
  if (!jobs.length) return { ok: true, accepted: 0, failed: 0, results: [] };

  const aggregate: PlatformJobBatchResult = { ok: true, accepted: 0, failed: 0, results: [] };
  for (let index = 0; index < jobs.length; index += 10) {
    const chunk = jobs.slice(index, index + 10);
    const result = await signedRequest<PlatformJobBatchResult>("POST", "/v1/jobs/enqueue-batch", JSON.stringify({ jobs: chunk }));
    aggregate.accepted += Number(result.accepted || 0);
    aggregate.failed += Number(result.failed || 0);
    aggregate.results.push(...(result.results || []));
  }
  aggregate.ok = aggregate.failed === 0;
  return aggregate;
}
