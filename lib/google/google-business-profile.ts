import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const GOOGLE_BUSINESS_READ_MASK = [
  "name",
  "title",
  "storefrontAddress",
  "phoneNumbers",
  "websiteUri",
  "regularHours",
  "metadata",
].join(",");

type GoogleToken = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type GoogleBusinessCandidate = {
  accountName: string;
  accountDisplayName: string | null;
  locationName: string;
  title: string | null;
  placeId: string | null;
  storefrontAddress: Record<string, unknown> | null;
};

export type GoogleBusinessMismatch = {
  field: "title" | "phone" | "website" | "address" | "hours";
  localValue: unknown;
  googleValue: unknown;
  status: "different";
};

function clientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
}

function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
}

function stateSecret() {
  return process.env.GOOGLE_BUSINESS_OAUTH_STATE_SECRET
    || process.env.SOCIAL_OAUTH_STATE_SECRET
    || process.env.GOOGLE_BUSINESS_TOKEN_ENCRYPTION_KEY
    || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY
    || "";
}

function tokenSecret() {
  return process.env.GOOGLE_BUSINESS_TOKEN_ENCRYPTION_KEY
    || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY
    || "";
}

function encryptionKey() {
  const secret = tokenSecret();
  if (!secret) throw new Error("Google Business Profile token encryption is not configured.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decrypt(value: string) {
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 29) throw new Error("Invalid Google Business Profile encrypted token.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function sign(value: string) {
  const secret = stateSecret();
  if (!secret) throw new Error("Google Business Profile OAuth state secret is not configured.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cleanReturnTo(value: unknown, locationId: string) {
  const raw = String(value || "").trim();
  if (raw.startsWith("/locations/dashboard/")) return raw;
  return `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`;
}

export function googleBusinessConfigured() {
  return Boolean(clientId() && clientSecret() && stateSecret() && tokenSecret());
}

export function createGoogleBusinessState(input: {
  userId: string;
  locationId: string;
  returnTo?: string | null;
}) {
  const payload = Buffer.from(JSON.stringify({
    userId: input.userId,
    locationId: input.locationId,
    returnTo: cleanReturnTo(input.returnTo, input.locationId),
    issuedAt: Date.now(),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyGoogleBusinessState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid Google Business Profile OAuth state.");
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid Google Business Profile OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId: string;
    locationId: string;
    returnTo: string;
    issuedAt: number;
  };
  if (!parsed.userId || !parsed.locationId || Date.now() - Number(parsed.issuedAt || 0) > 20 * 60 * 1000) {
    throw new Error("Google Business Profile OAuth state expired.");
  }
  parsed.returnTo = cleanReturnTo(parsed.returnTo, parsed.locationId);
  return parsed;
}

export function googleBusinessAuthorizeUrl(state: string, redirectUri: string) {
  if (!googleBusinessConfigured()) throw new Error("Google Business Profile OAuth is not configured.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", GOOGLE_BUSINESS_SCOPE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

async function jsonFetch<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  let body: unknown = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  if (!response.ok) {
    const error = new Error(`Google Business Profile request failed (${response.status}): ${bodyText.slice(0, 600)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export async function exchangeGoogleBusinessCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  return jsonFetch<GoogleToken>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

async function refreshGoogleBusinessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return jsonFetch<GoogleToken>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export async function storeGoogleBusinessSecrets(input: {
  connectionId: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
}) {
  const { data: existing } = await supabaseAdmin
    .from("google_business_profile_connection_secrets")
    .select("refresh_token_ciphertext")
    .eq("connection_id", input.connectionId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("google_business_profile_connection_secrets").upsert({
    connection_id: input.connectionId,
    access_token_ciphertext: encrypt(input.accessToken),
    refresh_token_ciphertext: input.refreshToken
      ? encrypt(input.refreshToken)
      : existing?.refresh_token_ciphertext || null,
    token_type: input.tokenType || "Bearer",
    expires_at: input.expiresAt || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function loadGoogleBusinessSecrets(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("google_business_profile_connection_secrets")
    .select("access_token_ciphertext,refresh_token_ciphertext,token_type,expires_at")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token_ciphertext) throw new Error("Google Business Profile token is missing.");
  return {
    accessToken: decrypt(data.access_token_ciphertext),
    refreshToken: data.refresh_token_ciphertext ? decrypt(data.refresh_token_ciphertext) : null,
    tokenType: data.token_type || "Bearer",
    expiresAt: data.expires_at || null,
  };
}

export async function accessTokenForConnection(connectionId: string) {
  const secrets = await loadGoogleBusinessSecrets(connectionId);
  const expiresAt = secrets.expiresAt ? new Date(secrets.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now() + 60_000) return secrets.accessToken;
  if (!secrets.refreshToken) throw new Error("Google Business Profile authorization must be renewed.");

  const refreshed = await refreshGoogleBusinessToken(secrets.refreshToken);
  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await storeGoogleBusinessSecrets({
    connectionId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || secrets.refreshToken,
    tokenType: refreshed.token_type || secrets.tokenType,
    expiresAt: nextExpiresAt,
  });
  await supabaseAdmin.from("google_business_profile_connections").update({
    token_expires_at: nextExpiresAt,
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", connectionId);
  return refreshed.access_token;
}

export async function listGoogleBusinessCandidates(accessToken: string): Promise<GoogleBusinessCandidate[]> {
  const accounts = await jsonFetch<{ accounts?: Array<{ name: string; accountName?: string; type?: string }> }>(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  const candidates: GoogleBusinessCandidate[] = [];
  for (const account of accounts.accounts || []) {
    if (!account.name) continue;
    let pageToken = "";
    let page = 0;
    do {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
      url.searchParams.set("readMask", GOOGLE_BUSINESS_READ_MASK);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await jsonFetch<{
        locations?: Array<{
          name?: string;
          title?: string;
          storefrontAddress?: Record<string, unknown>;
          metadata?: { placeId?: string };
        }>;
        nextPageToken?: string;
      }>(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
      for (const location of response.locations || []) {
        if (!location.name) continue;
        candidates.push({
          accountName: account.name,
          accountDisplayName: account.accountName || null,
          locationName: location.name,
          title: location.title || null,
          placeId: location.metadata?.placeId || null,
          storefrontAddress: location.storefrontAddress || null,
        });
      }
      pageToken = response.nextPageToken || "";
      page += 1;
    } while (pageToken && page < 10);
  }
  return candidates.slice(0, 500);
}

export async function getGoogleBusinessLocation(accessToken: string, locationName: string) {
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}`);
  url.searchParams.set("readMask", GOOGLE_BUSINESS_READ_MASK);
  return jsonFetch<any>(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
}

export async function patchGoogleBusinessLocation(
  accessToken: string,
  locationName: string,
  updateMask: string,
  payload: Record<string, unknown>,
) {
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}`);
  url.searchParams.set("updateMask", updateMask);
  return jsonFetch<any>(url.toString(), {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

function localAddress(location: any) {
  return {
    addressLines: [String(location.address || "").trim()].filter(Boolean),
    locality: String(location.city || "").trim(),
    administrativeArea: String(location.state || "").trim(),
    postalCode: String(location.zip_code || location.postal_code || "").trim(),
    regionCode: "US",
  };
}

function comparableAddress(value: any) {
  return [
    ...(Array.isArray(value?.addressLines) ? value.addressLines : []),
    value?.locality,
    value?.administrativeArea,
    value?.postalCode,
  ].map(clean).filter(Boolean).join("|");
}

function comparableHours(value: any) {
  if (!value) return "";
  return JSON.stringify(value);
}

export function computeGoogleBusinessMismatches(location: any, google: any): GoogleBusinessMismatch[] {
  const mismatches: GoogleBusinessMismatch[] = [];
  const localTitle = location.name || location.restaurant_name || location.activity_name || "";
  if (clean(localTitle) !== clean(google.title)) mismatches.push({ field: "title", localValue: localTitle, googleValue: google.title || null, status: "different" });

  const googlePhone = google.phoneNumbers?.primaryPhone || "";
  if (cleanPhone(location.phone) !== cleanPhone(googlePhone)) mismatches.push({ field: "phone", localValue: location.phone || null, googleValue: googlePhone || null, status: "different" });

  const localWebsite = location.website || location.website_url || "";
  if (clean(localWebsite).replace(/\/$/, "") !== clean(google.websiteUri).replace(/\/$/, "")) mismatches.push({ field: "website", localValue: localWebsite || null, googleValue: google.websiteUri || null, status: "different" });

  const localAddr = localAddress(location);
  if (comparableAddress(localAddr) !== comparableAddress(google.storefrontAddress)) mismatches.push({ field: "address", localValue: localAddr, googleValue: google.storefrontAddress || null, status: "different" });

  const localHours = location.operating_hours || null;
  if (localHours && google.regularHours && comparableHours(localHours) !== comparableHours(google.regularHours)) {
    mismatches.push({ field: "hours", localValue: localHours, googleValue: google.regularHours, status: "different" });
  }
  return mismatches;
}

export function googleBusinessHealth(input: {
  mapped: boolean;
  status: string;
  mismatchCount: number;
  lastSyncAt?: string | null;
  tokenExpiresAt?: string | null;
}) {
  let score = 100;
  if (!input.mapped) score -= 45;
  if (input.status === "reauthorization_required") score -= 40;
  if (input.status === "degraded") score -= 20;
  score -= Math.min(30, input.mismatchCount * 6);
  if (!input.lastSyncAt) score -= 10;
  else if (Date.now() - new Date(input.lastSyncAt).getTime() > 7 * 24 * 60 * 60 * 1000) score -= 10;
  if (input.tokenExpiresAt && new Date(input.tokenExpiresAt).getTime() < Date.now()) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export function googlePayloadForField(field: GoogleBusinessMismatch["field"], location: any) {
  if (field === "title") {
    return { updateMask: "title", payload: { title: location.name || location.restaurant_name || location.activity_name || "" } };
  }
  if (field === "phone") {
    return { updateMask: "phoneNumbers", payload: { phoneNumbers: { primaryPhone: location.phone || "" } } };
  }
  if (field === "website") {
    return { updateMask: "websiteUri", payload: { websiteUri: location.website || location.website_url || "" } };
  }
  if (field === "address") {
    return { updateMask: "storefrontAddress", payload: { storefrontAddress: localAddress(location) } };
  }
  return { updateMask: "regularHours", payload: { regularHours: location.operating_hours || {} } };
}

export function localUpdatesForGoogleField(field: GoogleBusinessMismatch["field"], google: any) {
  if (field === "title") return { name: google.title || null };
  if (field === "phone") return { phone: google.phoneNumbers?.primaryPhone || null };
  if (field === "website") return { website: google.websiteUri || null, website_url: google.websiteUri || null };
  if (field === "address") {
    const addr = google.storefrontAddress || {};
    return {
      address: Array.isArray(addr.addressLines) ? addr.addressLines.join(", ") : null,
      city: addr.locality || null,
      state: addr.administrativeArea || null,
      zip_code: addr.postalCode || null,
      postal_code: addr.postalCode || null,
    };
  }
  return { operating_hours: google.regularHours || null };
}
