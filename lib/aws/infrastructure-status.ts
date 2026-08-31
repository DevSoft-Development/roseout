import "server-only";

import { createHmac } from "node:crypto";

export type InfrastructureHealth = "healthy" | "degraded" | "unhealthy" | "unknown" | "configured";

export type InfrastructureResource = {
  name: string;
  type?: string | null;
  status?: string | null;
  region?: string | null;
  lastUpdatedAt?: string | null;
  detail?: string | null;
};

export type InfrastructureService = {
  provider: "aws" | "supabase" | "vercel";
  id: string;
  name: string;
  health: InfrastructureHealth;
  resourceCount: number;
  region?: string | null;
  lastUpdatedAt?: string | null;
  lastCheckedAt: string;
  detail?: string | null;
  resources?: InfrastructureResource[];
};

export type InfrastructureProviderSummary = {
  provider: "aws" | "supabase" | "vercel";
  label: string;
  health: InfrastructureHealth;
  detail?: string | null;
  accountId?: string | null;
  projectId?: string | null;
  region?: string | null;
  lastCheckedAt: string;
  services: InfrastructureService[];
};

export type InfrastructureOverview = {
  ok: boolean;
  checkedAt: string;
  providers: InfrastructureProviderSummary[];
};

function getGatewayConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_JOB_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("infrastructure_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("infrastructure_gateway_requires_https");
  return { baseUrl, secret };
}

async function signedGet<T>(path: string): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const timestamp = Date.now().toString();
  const payload = [timestamp, "GET", path, ""].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
    });
    const data = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error || `infrastructure_gateway_http_${response.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getInfrastructureOverview() {
  return signedGet<InfrastructureOverview>("/v1/infrastructure");
}
