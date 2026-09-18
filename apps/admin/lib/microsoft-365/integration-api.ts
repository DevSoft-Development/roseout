import "server-only";

import { createHmac } from "node:crypto";

const ALLOWED_GRAPH_HOST = "graph.microsoft.com";
const ALLOWED_GRAPH_VERSIONS = new Set(["v1.0", "beta"]);
const FORWARDED_HEADER_NAMES = new Set([
  "accept",
  "content-type",
  "prefer",
  "consistencylevel",
  "if-match",
  "if-none-match",
]);

export type MicrosoftTokenResponse = {
  token_type: string;
  scope?: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
};

function configuredSecret() {
  return String(
    process.env.AWS_PLATFORM_INTEGRATION_API_SECRET ||
      process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET ||
      "",
  ).trim();
}

function getConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_INTEGRATION_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = configuredSecret();

  if (!baseUrl || !secret) {
    throw new Error("aws_platform_integration_api_not_configured");
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("aws_platform_integration_api_requires_https");
  }

  return { baseUrl, secret };
}

async function signedFetch(
  path: string,
  body: string,
  timeoutMs = 15_000,
  method = "POST",
): Promise<Response> {
  const { baseUrl, secret } = getConfig();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update([timestamp, method, path, body].join("\n"))
    .digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        "x-toh-timestamp": timestamp,
        "x-toh-signature": signature,
      },
      ...(method === "POST" ? { body } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function signedJson<T>(
  path: string,
  payload: unknown,
  timeoutMs = 18_000,
): Promise<T> {
  const body = JSON.stringify(payload);
  const response = await signedFetch(path, body, timeoutMs);
  const parsed = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      (parsed as { error?: string } | null)?.error ||
        `aws_platform_integration_api_http_${response.status}`,
    );
  }

  return parsed as T;
}

function normalizeGraphTarget(
  defaultVersion: "v1.0" | "beta",
  pathOrUrl: string,
) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) throw new Error("microsoft_graph_path_required");

  if (!raw.startsWith("https://")) {
    return {
      version: defaultVersion,
      path: raw.startsWith("/") ? raw : `/${raw}`,
    };
  }

  const parsed = new URL(raw);
  if (parsed.hostname.toLowerCase() !== ALLOWED_GRAPH_HOST) {
    throw new Error("microsoft_graph_host_not_allowed");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const version = parts.shift() || "";
  if (!ALLOWED_GRAPH_VERSIONS.has(version)) {
    throw new Error("microsoft_graph_version_not_allowed");
  }

  return {
    version: version as "v1.0" | "beta",
    path: `/${parts.join("/")}${parsed.search}`,
  };
}

function normalizeHeaders(init: RequestInit) {
  const source = new Headers(init.headers || {});
  const forwarded: Record<string, string> = {};

  for (const [key, value] of source.entries()) {
    const normalized = key.toLowerCase();
    if (FORWARDED_HEADER_NAMES.has(normalized)) {
      forwarded[normalized] = value;
    }
  }

  return forwarded;
}

export async function microsoftGraphIntegrationFetch(
  accessToken: string,
  defaultVersion: "v1.0" | "beta",
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  const target = normalizeGraphTarget(defaultVersion, pathOrUrl);
  const method = String(init.method || "GET").toUpperCase();
  const rawBody = init.body;

  if (rawBody != null && typeof rawBody !== "string") {
    throw new Error("microsoft_graph_integration_body_must_be_string");
  }

  return signedFetch(
    "/v1/microsoft-graph",
    JSON.stringify({
      accessToken,
      version: target.version,
      path: target.path,
      method,
      headers: normalizeHeaders(init),
      body: rawBody ?? null,
    }),
  );
}

export function exchangeMicrosoftTokenViaIntegrationApi(input: {
  grantType: "authorization_code" | "refresh_token" | "client_credentials";
  credentialSet?: "default" | "provisioning";
  code?: string;
  codeVerifier?: string;
  refreshToken?: string;
  redirectUri?: string;
  scope?: string;
}) {
  return signedJson<MicrosoftTokenResponse>(
    "/v1/microsoft-oauth/token",
    input,
    15_000,
  );
}
