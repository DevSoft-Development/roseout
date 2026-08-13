import "server-only";

import crypto from "node:crypto";

export type WebsitePublishPayload = {
  locationId: string;
  domain: string;
  sitePath: string;
  version: number;
  snapshot: Record<string, unknown>;
};

export type WebsitePublishResult = {
  ok: boolean;
  deploymentId?: string;
  version: number;
  sslStatus?: string;
};

function getConfig() {
  const baseUrl = process.env.WEBSITE_HOSTING_GATEWAY_URL?.replace(/\/$/, "");
  const secret = process.env.WEBSITE_HOSTING_GATEWAY_SECRET;
  if (!baseUrl || !secret) throw new Error("website_hosting_gateway_not_configured");
  return { baseUrl, secret };
}

export async function publishWebsiteToLightsail(payload: WebsitePublishPayload) {
  const { baseUrl, secret } = getConfig();
  const path = "/v1/sites/publish";
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signaturePayload = [timestamp, "POST", path, body].join("\n");
  const signature = crypto.createHmac("sha256", secret).update(signaturePayload).digest("hex");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-toh-timestamp": timestamp,
      "x-toh-signature": signature,
    },
    body,
  });

  const data = await response.json().catch(() => null) as WebsitePublishResult | { error?: string } | null;
  if (!response.ok) {
    throw new Error((data && "error" in data && data.error) || `website_hosting_gateway_http_${response.status}`);
  }
  return data as WebsitePublishResult;
}
