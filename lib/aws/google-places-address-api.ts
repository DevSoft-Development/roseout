import { createHmac } from "node:crypto";

function integrationConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_INTEGRATION_API_URL || "").trim().replace(/\/$/, "");
  const secret = String(
    process.env.AWS_PLATFORM_INTEGRATION_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
  if (!baseUrl || !secret) throw new Error("aws_platform_integration_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_integration_api_requires_https");
  return { baseUrl, secret };
}

export async function getGoogleAddressDetailsViaIntegrationApi<T>(placeId: string, sessionToken?: string): Promise<T> {
  const { baseUrl, secret } = integrationConfig();
  const path = "/v1/google-places/details";
  const body = JSON.stringify({
    placeId,
    sessionToken: sessionToken || undefined,
    fieldMode: "address",
  });
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, "POST", path, body].join("\n"))
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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
    const payload = await response.json().catch(() => null) as { ok?: boolean; place?: T; error?: string } | null;
    if (!response.ok || !payload?.place) {
      throw new Error(payload?.error || `aws_platform_integration_api_http_${response.status}`);
    }
    return payload.place;
  } finally {
    clearTimeout(timeout);
  }
}
