type TelnyxPurpose = "transactional" | "crm" | "reservations" | "support" | "marketing" | "concierge";

export type IntegrationTelnyxSendResponse = {
  ok: true;
  provider: "telnyx";
  purpose: Exclude<TelnyxPurpose, "transactional">;
  id: string | null;
  status: string;
  from: string;
  to: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredSecret() {
  return clean(
    Deno.env.get("AWS_PLATFORM_INTEGRATION_API_SECRET")
      || Deno.env.get("AWS_PLATFORM_JOB_GATEWAY_SECRET"),
  );
}

function getConfig() {
  const baseUrl = clean(Deno.env.get("AWS_PLATFORM_INTEGRATION_API_URL")).replace(/\/$/, "");
  const secret = configuredSecret();
  if (!baseUrl || !secret) throw new Error("aws_platform_integration_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_integration_api_requires_https");
  return { baseUrl, secret };
}

export function platformIntegrationApiConfigured() {
  return Boolean(clean(Deno.env.get("AWS_PLATFORM_INTEGRATION_API_URL")) && configuredSecret());
}

async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedJson<T>(path: string, payload: unknown, timeoutMs = 12_000): Promise<T> {
  const { baseUrl, secret } = getConfig();
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const canonical = [timestamp, "POST", path, body].join("\n");
  const signature = await hmacSha256Hex(secret, canonical);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      body,
    });
    const parsed = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      if (response.status === 404) throw new Error("aws_platform_integration_api_http_404");
      const providerError = clean((parsed as { error?: string } | null)?.error);
      throw new Error(providerError || `aws_platform_integration_api_http_${response.status}`);
    }
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function sendTelnyxSmsViaIntegrationApi(
  purpose: TelnyxPurpose,
  to: string,
  body: string,
) {
  return signedJson<IntegrationTelnyxSendResponse>(
    "/v1/telnyx/messages/send",
    { purpose, to, body },
    12_000,
  );
}
