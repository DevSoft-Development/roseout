import "server-only";

import { createHmac } from "node:crypto";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

export type WebsiteHostingMode = "lightsail" | "dual" | "cloudfront_s3";

export type AwsWebsiteReleaseRequest = {
  websiteId: string;
  locationId: string;
  version: number;
  domain: string;
  files: WebsiteArtifactFile[];
  provisionTenant?: boolean;
};

export type AwsWebsiteHostingResult = {
  ok: boolean;
  provider: "aws-cloudfront-s3";
  websiteId: string;
  locationId?: string;
  version: number;
  bucket?: string;
  releasePrefix: string;
  files?: number;
  routingEndpoint: string;
  tenant?: {
    id?: string | null;
    name?: string | null;
    status?: string | null;
    enabled?: boolean | null;
    domains?: unknown[];
    parameters?: unknown[];
  } | null;
  invalidation?: {
    id?: string | null;
    status?: string | null;
  } | null;
};

type GatewayErrorPayload = {
  ok?: boolean;
  error?: string;
  code?: string;
};

export class AwsWebsiteHostingError extends Error {
  status: number;
  code: string;

  constructor(status: number, payload: GatewayErrorPayload | null) {
    const code = payload?.error || `aws_website_hosting_http_${status}`;
    super(code);
    this.name = "AwsWebsiteHostingError";
    this.status = status;
    this.code = code;
  }
}

export function getWebsiteHostingMode(): WebsiteHostingMode {
  const value = String(process.env.WEBSITE_HOSTING_MODE || "lightsail").trim().toLowerCase();
  if (value === "dual" || value === "cloudfront_s3") return value;
  return "lightsail";
}

export function awsWebsiteHostingConfigured() {
  return Boolean(
    process.env.AWS_WEBSITE_HOSTING_GATEWAY_URL?.trim()
      && process.env.AWS_WEBSITE_HOSTING_GATEWAY_SECRET?.trim(),
  );
}

function getGatewayConfig() {
  const baseUrl = String(process.env.AWS_WEBSITE_HOSTING_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_WEBSITE_HOSTING_GATEWAY_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("aws_website_hosting_gateway_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_website_hosting_gateway_requires_https");
  return { baseUrl, secret };
}

async function gatewayRequest<T>(path: string, body?: string, method = "POST"): Promise<T> {
  const { baseUrl, secret } = getGatewayConfig();
  const timestamp = Date.now().toString();
  const normalizedMethod = method.toUpperCase();
  const payload = [timestamp, normalizedMethod, path, body || ""].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: normalizedMethod,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(body ? { body } : {}),
    });
    const data = await response.json().catch(() => null) as T | GatewayErrorPayload | null;
    if (!response.ok) throw new AwsWebsiteHostingError(response.status, data as GatewayErrorPayload | null);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getAwsWebsiteHostingStatus() {
  return gatewayRequest<{
    ok: boolean;
    authenticated: boolean;
    environment: string;
    provider: "aws-cloudfront-s3";
    sitesBucket: string;
    distributionId: string;
    connectionGroupId: string;
    routingEndpoint: string;
  }>("/v1/status", undefined, "GET");
}

export function publishAwsWebsiteRelease(input: AwsWebsiteReleaseRequest) {
  return gatewayRequest<AwsWebsiteHostingResult>("/v1/sites/publish", JSON.stringify(input));
}

export function rollbackAwsWebsiteRelease(input: {
  websiteId: string;
  domain: string;
  version: number;
}) {
  return gatewayRequest<AwsWebsiteHostingResult>("/v1/sites/rollback", JSON.stringify(input));
}
