import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { storeSocialConnectionSecrets } from "./social-secrets";
import { loadMetaSocialConfig } from "./social-provider-config";

const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

export type LocationInstagramOauthState = {
  userId: string;
  locationId: string;
  issuedAt: number;
  returnTo: string;
};

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function stateSecret() {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "";
  if (!secret) throw new Error("SOCIAL_OAUTH_STATE_SECRET is not configured.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

function safeReturnTo(value?: string | null) {
  const fallback = "/locations/dashboard/social-accounts";
  const clean = String(value || "").trim();
  if (!clean.startsWith("/locations/dashboard")) return fallback;
  try {
    const parsed = new URL(clean, baseUrl());
    if (parsed.origin !== new URL(baseUrl()).origin || !parsed.pathname.startsWith("/locations/dashboard")) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function locationInstagramRedirectUri() {
  return new URL("/api/locations/social/instagram/callback", baseUrl()).toString();
}

export function createLocationInstagramOauthState(input: {
  userId: string;
  locationId: string;
  returnTo?: string | null;
}) {
  const payload = Buffer.from(JSON.stringify({
    userId: input.userId,
    locationId: input.locationId,
    issuedAt: Date.now(),
    returnTo: safeReturnTo(input.returnTo),
  } satisfies LocationInstagramOauthState)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyLocationInstagramOauthState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid Instagram OAuth state.");
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid Instagram OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocationInstagramOauthState;
  if (!parsed.userId || !parsed.locationId || !parsed.issuedAt) throw new Error("Invalid Instagram OAuth state payload.");
  if (Date.now() - parsed.issuedAt > 20 * 60 * 1000) throw new Error("Instagram OAuth session expired. Please connect again.");
  parsed.returnTo = safeReturnTo(parsed.returnTo);
  return parsed;
}

export async function locationInstagramConfigured() {
  const config = await loadMetaSocialConfig();
  return Boolean(config.appId && config.appSecret && config.graphVersion && stateSecret());
}

export async function locationInstagramAuthorizeUrl(state: string) {
  const config = await loadMetaSocialConfig();
  if (!config.appId || !config.appSecret || !config.graphVersion) {
    throw new Error("Instagram API credentials are not configured.");
  }
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", locationInstagramRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

async function providerJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Instagram API ${response.status}: ${text.slice(0, 500)}`);
  return body as T;
}

async function exchangeInstagramCode(code: string) {
  const config = await loadMetaSocialConfig();
  if (!config.appId || !config.appSecret || !config.graphVersion) throw new Error("Instagram API credentials are not configured.");

  const form = new FormData();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", locationInstagramRedirectUri());
  form.set("code", code);

  const shortToken = await providerJson<{ access_token: string; user_id?: string | number; permissions?: string[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body: form },
  );
  if (!shortToken.access_token) throw new Error("Instagram did not return an access token.");

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", config.appSecret);
  longUrl.searchParams.set("access_token", shortToken.access_token);
  const longToken = await providerJson<{ access_token: string; token_type?: string; expires_in?: number }>(longUrl.toString());
  const accessToken = longToken.access_token || shortToken.access_token;

  const profileUrl = new URL(`https://graph.instagram.com/${config.graphVersion}/me`);
  profileUrl.searchParams.set("fields", "id,username,account_type,media_count");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = await providerJson<{ id?: string; username?: string; account_type?: string; media_count?: number }>(profileUrl.toString());
  const providerAccountId = String(profile.id || shortToken.user_id || "").trim();
  if (!providerAccountId) throw new Error("Instagram did not return the professional account ID.");

  return {
    accessToken,
    providerAccountId,
    username: profile.username || null,
    accountType: profile.account_type || null,
    mediaCount: profile.media_count ?? null,
    tokenType: longToken.token_type || "Bearer",
    expiresAt: longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : null,
    scopes: shortToken.permissions?.length ? shortToken.permissions : INSTAGRAM_SCOPES,
  };
}

export async function completeLocationInstagramOauth(input: {
  code: string;
  userId: string;
  locationId: string;
}) {
  const token = await exchangeInstagramCode(input.code);
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("marketing_social_connections")
    .update({ status: "disconnected", updated_at: now })
    .eq("scope", "location")
    .eq("location_id", input.locationId)
    .eq("provider", "instagram")
    .neq("provider_account_id", token.providerAccountId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,connected_at")
    .eq("scope", "location")
    .eq("location_id", input.locationId)
    .eq("provider", "instagram")
    .eq("provider_account_id", token.providerAccountId)
    .maybeSingle();
  if (existingError) throw existingError;

  const row = {
    scope: "location",
    location_id: input.locationId,
    organization_id: null,
    provider: "instagram",
    provider_account_id: token.providerAccountId,
    provider_business_id: null,
    display_name: token.username ? `@${token.username}` : "Instagram",
    username: token.username,
    status: "connected",
    granted_scopes: token.scopes,
    token_expires_at: token.expiresAt,
    connected_by: input.userId,
    connected_at: existing?.connected_at || now,
    last_refreshed_at: now,
    last_error: null,
    metadata: {
      login_type: "instagram_business_login",
      account_type: token.accountType,
      media_count_at_connect: token.mediaCount,
    },
    updated_at: now,
  };

  let connectionId = existing?.id as string | undefined;
  if (connectionId) {
    const { error } = await supabaseAdmin.from("marketing_social_connections").update(row).eq("id", connectionId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.from("marketing_social_connections").insert(row).select("id").single();
    if (error || !data?.id) throw error || new Error("Could not save Instagram connection.");
    connectionId = data.id;
  }
  if (!connectionId) throw new Error("Could not resolve saved Instagram connection ID.");

  await storeSocialConnectionSecrets({
    connectionId,
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    scopes: token.scopes,
    expiresAt: token.expiresAt,
  });

  return { connectionId, username: token.username, providerAccountId: token.providerAccountId };
}
