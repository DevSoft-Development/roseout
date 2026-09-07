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

export type IntegrationBalanceAmount = { amount: number; currency: string };
export type IntegrationStripePayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date?: number | null;
  created?: number | null;
  method?: string | null;
  type?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  destination?: string | null;
};
export type IntegrationStripeConnectSnapshot = {
  accountId: string;
  available: IntegrationBalanceAmount[];
  pending: IntegrationBalanceAmount[];
  payouts: IntegrationStripePayout[];
  error: string | null;
};
export type IntegrationStripeConnectSnapshotResponse = {
  ok: true;
  snapshots: IntegrationStripeConnectSnapshot[];
  partial: boolean;
};

export type IntegrationTelnyxPurpose =
  | "transactional"
  | "crm"
  | "reservations"
  | "support"
  | "marketing"
  | "concierge";

export type IntegrationTelnyxSendResponse = {
  ok: true;
  provider: "telnyx";
  purpose: Exclude<IntegrationTelnyxPurpose, "transactional">;
  id: string | null;
  status: string;
  from: string;
  to: string;
};

export type IntegrationStampsStatusResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  configured: boolean;
  postcardEnabled: boolean;
  livePurchasesEnabled: boolean;
  endpointApproved: boolean;
  credentialSource: "admin-credential-vault";
  transactionalOperationsEnabled: boolean;
};

export type IntegrationStampsConnectionResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  accountStatus: string | null;
  customerId: string | null;
  meterNumber: string | null;
  availablePostage: number | null;
  namespace: string;
  credentialSource: "admin-credential-vault";
  message: string;
};

export type IntegrationStampsProductionProofResponse = {
  ok: true;
  provider: "stamps";
  mode: "live";
  apiVersion: "v160";
  businessName: string;
  cleansedAddress: { street: string; city: string; state: string; zip: string; zip4?: string | null };
  addressMatch: boolean;
  cityStateZipOk: boolean;
  amount: number;
  serviceType: string;
  packageType: string;
  shipDate: string;
  stampsTxId: string | null;
  integratorTxId: string;
  labelPngBase64: string | null;
  labelWarning: string | null;
  sampleOnly: false;
};

export type IntegrationResendSendResponse = {
  ok: true;
  provider: "resend";
  id: string | null;
};

export type MicrosoftTokenResponse = {
  token_type: string;
  scope?: string;
  expires_in: number;
  ext_expires_in?: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
};

type IntegrationGooglePlacesSearchResponse<T> = { ok: true; places: T[] };
type IntegrationGooglePlacesAutocompleteResponse<T> = { ok: true; suggestions: T[] };
type IntegrationGooglePlaceDetailsResponse<T> = { ok: true; place: T };
type IntegrationGooglePhotoMetadataResponse<T> = { ok: true; photos: T[] };

function configuredSecret() {
  return String(
    process.env.AWS_PLATFORM_INTEGRATION_API_SECRET
      || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || "",
  ).trim();
}

function getConfig() {
  const baseUrl = String(process.env.AWS_PLATFORM_INTEGRATION_API_URL || "").trim().replace(/\/$/, "");
  const secret = configuredSecret();
  if (!baseUrl || !secret) throw new Error("aws_platform_integration_api_not_configured");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("aws_platform_integration_api_requires_https");
  return { baseUrl, secret };
}

export function platformIntegrationApiConfigured() {
  return Boolean(process.env.AWS_PLATFORM_INTEGRATION_API_URL?.trim() && configuredSecret());
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

async function signedJson<T>(path: string, payload: unknown, timeoutMs = 18_000): Promise<T> {
  const body = JSON.stringify(payload);
  const response = await signedFetch(path, body, timeoutMs);
  const parsed = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((parsed as { error?: string } | null)?.error || `aws_platform_integration_api_http_${response.status}`);
  }
  return parsed as T;
}

async function signedGetJson<T>(path: string, timeoutMs = 18_000): Promise<T> {
  const response = await signedFetch(path, "", timeoutMs, "GET");
  const parsed = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((parsed as { error?: string } | null)?.error || `aws_platform_integration_api_http_${response.status}`);
  }
  return parsed as T;
}

function normalizeGraphTarget(defaultVersion: "v1.0" | "beta", pathOrUrl: string) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) throw new Error("microsoft_graph_path_required");
  if (!raw.startsWith("https://")) {
    return { version: defaultVersion, path: raw.startsWith("/") ? raw : `/${raw}` };
  }
  const parsed = new URL(raw);
  if (parsed.hostname.toLowerCase() !== ALLOWED_GRAPH_HOST) throw new Error("microsoft_graph_host_not_allowed");
  const parts = parsed.pathname.split("/").filter(Boolean);
  const version = parts.shift() || "";
  if (!ALLOWED_GRAPH_VERSIONS.has(version)) throw new Error("microsoft_graph_version_not_allowed");
  return { version: version as "v1.0" | "beta", path: `/${parts.join("/")}${parsed.search}` };
}

function normalizeHeaders(init: RequestInit) {
  const source = new Headers(init.headers || {});
  const forwarded: Record<string, string> = {};
  for (const [key, value] of source.entries()) {
    const normalized = key.toLowerCase();
    if (FORWARDED_HEADER_NAMES.has(normalized)) forwarded[normalized] = value;
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
  if (rawBody != null && typeof rawBody !== "string") throw new Error("microsoft_graph_integration_body_must_be_string");
  const payload = JSON.stringify({
    accessToken,
    version: target.version,
    path: target.path,
    method,
    headers: normalizeHeaders(init),
    body: rawBody ?? null,
  });
  return signedFetch("/v1/microsoft-graph", payload);
}

export async function microsoftAppGraphIntegrationFetch(
  pathOrUrl: string,
  init: RequestInit = {},
  credentialSet: "default" | "provisioning" = "provisioning",
): Promise<Response> {
  const target = normalizeGraphTarget("v1.0", pathOrUrl);
  const rawBody = init.body;
  if (rawBody != null && typeof rawBody !== "string") throw new Error("microsoft_graph_integration_body_must_be_string");
  const payload = JSON.stringify({
    credentialSet,
    version: target.version,
    path: target.path,
    method: String(init.method || "GET").toUpperCase(),
    headers: normalizeHeaders(init),
    body: rawBody ?? null,
  });
  return signedFetch("/v1/microsoft-app/graph", payload);
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
  return signedJson<MicrosoftTokenResponse>("/v1/microsoft-oauth/token", input, 15_000);
}

export function readMicrosoftAppReadinessViaIntegrationApi() {
  return signedGetJson<{
    ok: boolean;
    provider: "microsoft-graph";
    tenantMatches: boolean;
    graphUserRead: boolean;
    roles: string[];
    licenseSku: string | null;
  }>("/v1/microsoft-app/readiness", 15_000);
}

export async function readStripeConnectPayoutsViaIntegrationApi(
  accountIds: string[],
): Promise<IntegrationStripeConnectSnapshotResponse> {
  return signedJson<IntegrationStripeConnectSnapshotResponse>(
    "/v1/stripe-connect/payouts/read",
    { accountIds },
  );
}

export async function stripeRequestViaIntegrationApi<T>(input: {
  apiVersion?: "v1" | "v2";
  mode?: "live" | "test";
  method?: "GET" | "POST";
  path: string;
  form?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  stripeAccount?: string;
}): Promise<T> {
  return signedJson<T>("/v1/stripe/request", input, 20_000);
}

export async function sendEmailViaIntegrationApi(input: {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  subject: string;
  html?: string;
  text?: string;
}): Promise<IntegrationResendSendResponse> {
  return signedJson<IntegrationResendSendResponse>("/v1/resend/emails/send", input, 15_000);
}

export async function sendTelnyxSmsViaIntegrationApi(
  purpose: IntegrationTelnyxPurpose,
  to: string,
  body: string,
): Promise<IntegrationTelnyxSendResponse> {
  return signedJson<IntegrationTelnyxSendResponse>(
    "/v1/telnyx/messages/send",
    { purpose, to, body },
    12_000,
  );
}

export async function getStampsStatusViaIntegrationApi(): Promise<IntegrationStampsStatusResponse> {
  return signedGetJson<IntegrationStampsStatusResponse>("/v1/stamps/status", 12_000);
}

export async function testStampsConnectionViaIntegrationApi(): Promise<IntegrationStampsConnectionResponse> {
  return signedJson<IntegrationStampsConnectionResponse>("/v1/stamps/connection-test", {}, 20_000);
}

export async function createStampsPostcardProductionProofViaIntegrationApi(
  address: { name: string; street: string; city: string; state: string; zip: string },
  integratorTxId: string,
): Promise<IntegrationStampsProductionProofResponse> {
  return signedJson<IntegrationStampsProductionProofResponse>(
    "/v1/stamps/postcard/production-proof",
    { address, integratorTxId },
    90_000,
  );
}

export async function searchGooglePlacesTextViaIntegrationApi<T>(
  textQuery: string,
  options: { pageSize?: number; regionCode?: string; fieldMode?: "ids-only" | "rich" } = {},
): Promise<T[]> {
  const result = await signedJson<IntegrationGooglePlacesSearchResponse<T>>(
    "/v1/google-places/search-text",
    { mode: "text-search", textQuery, pageSize: options.pageSize, regionCode: options.regionCode, fieldMode: options.fieldMode },
    15_000,
  );
  return Array.isArray(result.places) ? result.places : [];
}

export async function autocompleteGooglePlacesViaIntegrationApi<T>(input: string, sessionToken?: string): Promise<T[]> {
  const result = await signedJson<IntegrationGooglePlacesAutocompleteResponse<T>>(
    "/v1/google-places/search-text",
    { mode: "autocomplete", input, sessionToken: sessionToken || undefined },
    15_000,
  );
  return Array.isArray(result.suggestions) ? result.suggestions : [];
}

export async function getGooglePlaceDetailsViaIntegrationApi<T>(placeId: string, options: { sessionToken?: string; fieldMode?: "address" | "rich" } = {}): Promise<T> {
  const result = await signedJson<IntegrationGooglePlaceDetailsResponse<T>>(
    "/v1/google-places/details",
    { placeId, sessionToken: options.sessionToken || undefined, fieldMode: options.fieldMode },
    15_000,
  );
  return result.place;
}

export async function getGooglePlacePhotosViaIntegrationApi<T>(placeId: string): Promise<T[]> {
  const result = await signedJson<IntegrationGooglePhotoMetadataResponse<T>>(
    "/v1/google-places/photo-metadata",
    { placeId },
    15_000,
  );
  return Array.isArray(result.photos) ? result.photos : [];
}

export async function fetchGooglePlacePhotoViaIntegrationApi(photoName: string, maxWidthPx: number): Promise<Response> {
  const body = JSON.stringify({ photoName, maxWidthPx });
  return signedFetch("/v1/google-places/photo-media", body, 18_000);
}
