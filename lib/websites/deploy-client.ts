import "server-only";

import { createHmac } from "node:crypto";
import { normalizeDeployRequest, type WebsiteDeployRequest } from "@/lib/websites/publish-contract";

export type WebsiteDeployResult = {
  ok: boolean;
  version: number;
  currentPath: string;
};

function getDeployConfig() {
  const url = process.env.WEBSITE_DEPLOY_AGENT_URL?.trim().replace(/\/$/, "");
  const secret = process.env.WEBSITE_DEPLOY_AGENT_SECRET?.trim();
  if (!url || !secret) throw new Error("website_deploy_agent_not_configured");
  return { url, secret };
}

export async function deployWebsiteArtifact(input: WebsiteDeployRequest): Promise<WebsiteDeployResult> {
  const payload = normalizeDeployRequest(input);
  const { url, secret } = getDeployConfig();
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${url}/v1/deploy`, {
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
