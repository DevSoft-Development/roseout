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

async function signedRequest(path: string, payload: unknown, timeoutMs = 12_000): Promise<Response> {
  const { baseUrl, secret } = getConfig();
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const canonical = [timestamp, "POST", path, body].join("\n");
  const signature = await hmacSha256Hex(secret, canonical);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function signedJson<T>(path: string, payload: unknown, timeoutMs = 12_000): Promise<T> {
  const response = await signedRequest(path, payload, timeoutMs);
  const parsed = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    if (response.status === 404) throw new Error("aws_platform_integration_api_http_404");
    const providerError = clean((parsed as { error?: string } | null)?.error);
    throw new Error(providerError || `aws_platform_integration_api_http_${response.status}`);
  }
  return parsed as T;
}

export function sendTelnyxSmsViaIntegrationApi(purpose: TelnyxPurpose, to: string, body: string) {
  return signedJson<IntegrationTelnyxSendResponse>("/v1/telnyx/messages/send", { purpose, to, body }, 12_000);
}

export function stripeRequestViaIntegrationApi<T>(input: {
  apiVersion?: "v1" | "v2";
  mode?: "live" | "test";
  method?: "GET" | "POST";
  path: string;
  form?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  stripeAccount?: string;
}) {
  return signedJson<T>("/v1/stripe/request", input, 20_000);
}

export function sendEmailViaIntegrationApi(input: {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  return signedJson<{ ok: true; provider: "resend"; id: string | null }>("/v1/resend/emails/send", input, 15_000);
}

export function microsoftAppGraphViaIntegrationApi<T>(input: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  version?: "v1.0" | "beta";
  body?: string | Record<string, unknown>;
  credentialSet?: "default" | "provisioning";
}): Promise<T> {
  return signedJson<T>("/v1/microsoft-app/graph", input, 15_000);
}

export async function getMicrosoftAppReadinessViaIntegrationApi() {
  const { baseUrl, secret } = getConfig();
  const path = "/v1/microsoft-app/readiness";
  const timestamp = Date.now().toString();
  const canonical = [timestamp, "GET", path, ""].join("\n");
  const signature = await hmacSha256Hex(secret, canonical);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: { "x-toh-timestamp": timestamp, "x-toh-signature": signature },
    });
    const parsed = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(clean(parsed?.error) || `aws_platform_integration_api_http_${response.status}`);
    return parsed || {};
  } finally {
    clearTimeout(timeout);
  }
}

export function googlePlacesSearchViaIntegrationApi<T>(textQuery: string, pageSize = 20, regionCode = "US") {
  return signedJson<{ ok: true; places: T[] }>(
    "/v1/google-places/search-text",
    { mode: "text-search", textQuery, pageSize, regionCode },
    15_000,
  ).then((result) => result.places || []);
}

export function googlePlaceDetailsViaIntegrationApi<T>(placeId: string) {
  return signedJson<{ ok: true; place: T }>("/v1/google-places/details", { placeId }, 15_000)
    .then((result) => result.place);
}

export function googlePlacePhotosViaIntegrationApi<T>(placeId: string) {
  return signedJson<{ ok: true; photos: T[] }>("/v1/google-places/photo-metadata", { placeId }, 15_000)
    .then((result) => result.photos || []);
}
