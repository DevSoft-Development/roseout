import "server-only";

import { createHmac } from "node:crypto";
import { normalizeDeployRequest, type WebsiteDeployRequest } from "@/lib/websites/publish-contract";

export type WebsiteDeployResult = {
  ok: boolean;
  version: number;
  currentPath: string;
};

type WebsiteDeployOptions = {
  url?: string | null;
};

function normalizeUrl(value: string | null | undefined) {
  const url = String(value || "").trim().replace(/\/$/, "");
  return url || null;
}

function getDeployConfig(overrideUrl?: string | null) {
  const override = normalizeUrl(overrideUrl);
  if (override && !/^https:\/\//i.test(override)) throw new Error("website_failover_deploy_agent_requires_https");
  const url = override || normalizeUrl(process.env.WEBSITE_DEPLOY_AGENT_URL);
  const secret = process.env.WEBSITE_DEPLOY_AGENT_SECRET?.trim();
  if (!url || !secret) throw new Error("website_deploy_agent_not_configured");
  return { url, secret, useGatewayPublishContract: Boolean(override) };
}

export async function deployWebsiteArtifact(input: WebsiteDeployRequest, options: WebsiteDeployOptions = {}): Promise<WebsiteDeployResult> {
  const payload = normalizeDeployRequest(input);
  const { url, secret, useGatewayPublishContract } = getDeployConfig(options.url);
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const path = useGatewayPublishContract ? "/v1/sites/publish" : "/v1/deploy";
  const signaturePayload = useGatewayPublishContract
    ? [timestamp, "POST", path, body].join("\n")
    : `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(signaturePayload).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null) as WebsiteDeployResult | null;
    if (!response.ok || !result?.ok) throw new Error("website_deploy_failed");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
