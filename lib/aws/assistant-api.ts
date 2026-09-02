import "server-only";

import { createHmac } from "node:crypto";

function configuredSecret() {
  return String(
    process.env.AWS_PLATFORM_ASSISTANT_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
}

export function assistantApiBaseUrl() {
  return String(process.env.AWS_PLATFORM_ASSISTANT_API_URL || "")
    .trim()
    .replace(/\/$/, "");
}

export function assistantApiConfigured() {
  const url = assistantApiBaseUrl();
  const secret = configuredSecret();
  return url.startsWith("https://") && secret.length >= 32;
}

function assistantConfig() {
  const baseUrl = assistantApiBaseUrl();
  const secret = configuredSecret();
  if (!baseUrl.startsWith("https://")) {
    throw new Error("AWS_PLATFORM_ASSISTANT_API_URL is not configured.");
  }
  if (secret.length < 32) {
    throw new Error("AWS Assistant API shared secret is not configured.");
  }
  return { baseUrl, secret };
}

function bodyFromInit(body: BodyInit | null | undefined) {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString("utf8");
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("utf8");
  }
  throw new Error("AWS Assistant API only accepts buffered request bodies.");
}

export async function assistantSignedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { baseUrl, secret } = assistantConfig();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const allowedBase = new URL(baseUrl);
  if (url.origin !== allowedBase.origin || !url.pathname.startsWith("/v1/openai/")) {
    throw new Error("AWS Assistant API fetch attempted an unsupported URL.");
  }

  const method = request.method.toUpperCase();
  if (method !== "POST") {
    throw new Error("AWS Assistant API model requests must use POST.");
  }
  const body = bodyFromInit(init.body);
  const timestamp = String(Date.now());
  const canonical = [timestamp, method, url.pathname, body].join("\n");
  const signature = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  const headers = new Headers(request.headers);
  headers.set("x-toh-timestamp", timestamp);
  headers.set("x-toh-signature", signature);
  headers.set("content-type", "application/json");

  return fetch(url, {
    method,
    headers,
    body,
    signal: request.signal,
    redirect: "manual",
    cache: "no-store",
  });
}

export async function assistantStatus() {
  const { baseUrl } = assistantConfig();
  const response = await fetch(`${baseUrl}/v1/status`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`AWS Assistant API status failed (${response.status}).`);
  }
  return payload;
}
