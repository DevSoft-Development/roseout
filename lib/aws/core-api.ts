import "server-only";

import { createHmac } from "node:crypto";
import type { CrmRecordContext } from "@/lib/crm/context";

export type CoreCrmContextResponse = {
  context: CrmRecordContext;
  labels: {
    location: { id: string; name: string | null; city: string | null; state: string | null } | null;
    account: { id: string; name: string | null } | null;
    contact: { id: string; full_name: string | null; email: string | null } | null;
    opportunity: { id: string; name: string | null } | null;
  };
};

export type CoreCrmLocationHealthResponse = {
  success: true;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  duplicateCount: number;
  activeRun: Record<string, unknown> | null;
  latestRun: Record<string, unknown> | null;
  reviewItems: Array<{
    locationId: string;
    name: string;
    reasons: string[];
    changedFields: string[];
    lastError: string | null;
  }>;
  ownerUpdateCount: number;
};

export type CoreCrmLocationHealthInput = {
  page: number;
  pageSize: number;
  q: string;
  view: string;
};

export type CoreCrmOpportunityPageInput = {
  page: number;
  size: 25 | 250;
  pipelineMode: "all" | "unassigned" | "values";
  pipelineValues: string[];
  stagePipeline: string;
  stage?: string;
  forecast?: string;
  risk?: string;
  search?: string;
  accountId?: string;
  contactId?: string;
  locationId?: string;
  opportunityId?: string;
  selectorAccountId?: string;
};

export type CoreCrmOpportunityPageResponse = {
  success: true;
  rows: Array<Record<string, unknown>>;
  count: number;
  page: number;
  size: number;
  stages: Array<Record<string, unknown>>;
  pipelineKeys: Array<string | null>;
  selectors: {
    accounts: Array<{ id: string; name: string | null }>;
    contacts: Array<{ id: string; full_name: string | null; email: string | null }>;
    locations: Array<{ id: string; name: string | null; city: string | null; state: string | null }>;
  };
};

function configuredSecret() {
  return String(
    process.env.AWS_PLATFORM_CORE_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
}

function getConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_CORE_API_URL || "").trim().replace(/\/$/, "");
  const secret = configuredSecret();
  if (!baseUrl || !secret) throw new Error("aws_platform_core_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_core_api_requires_https");
  return { baseUrl, secret };
}

export function platformCoreApiConfigured() {
  return Boolean(process.env.AWS_PLATFORM_CORE_API_URL?.trim() && configuredSecret());
}

async function signedRequest<T>(method: "GET" | "POST", path: string, body = "", timeoutMs = 12_000): Promise<T> {
  const { baseUrl, secret } = getConfig();
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
    if (!response.ok) {
      throw new Error((payload as { error?: string } | null)?.error || `aws_platform_core_api_http_${response.status}`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveCrmContextViaCoreApi(context: CrmRecordContext): Promise<CoreCrmContextResponse> {
  return signedRequest<CoreCrmContextResponse>(
    "POST",
    "/v1/crm/context",
    JSON.stringify({ context }),
  );
}

export async function readCrmLocationHealthViaCoreApi(
  input: CoreCrmLocationHealthInput,
): Promise<CoreCrmLocationHealthResponse> {
  return signedRequest<CoreCrmLocationHealthResponse>(
    "POST",
    "/v1/crm/location-health/read",
    JSON.stringify(input),
    15_000,
  );
}

export async function readCrmOpportunityPageViaCoreApi(
  input: CoreCrmOpportunityPageInput,
): Promise<CoreCrmOpportunityPageResponse> {
  return signedRequest<CoreCrmOpportunityPageResponse>(
    "POST",
    "/v1/crm/opportunities/page",
    JSON.stringify(input),
    20_000,
  );
}
