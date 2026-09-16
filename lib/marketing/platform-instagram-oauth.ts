import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { storeSocialConnectionSecrets } from "./social-secrets";
import { loadInstagramSocialConfig } from "./social-provider-config";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

type PlatformInstagramState = {
  userId: string;
  issuedAt: number;
};

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function secret() {
  const value = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "";
  if (!value) throw new Error("SOCIAL_OAUTH_STATE_SECRET is not configured.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function platformInstagramRedirectUri() {
  return new URL("/api/admin/settings/credentials/instagram/callback", baseUrl()).toString();
}

export function createPlatformInstagramState(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, issuedAt: Date.now() } satisfies PlatformInstagramState)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyPlatformInstagramState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid Instagram OAuth state.");
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid Instagram OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PlatformInstagramState;
  if (!parsed.userId || Date.now() - Number(parsed.issuedAt || 0) > 20 * 60 * 1000) throw new Error("Instagram OAuth session expired.");
  return parsed;
}

export async function platformInstagramAuthorizeUrl(state: string) {
  const config = await loadInstagramSocialConfig();
  if (!config.appId || !config.appSecret || !config.graphVersion) throw new Error("Instagram App ID and Instagram App Secret are not configured.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", platformInstagramRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Instagram API ${response.status}: ${text.slice(0, 500)}`);
  return body as T;
}

export async function completePlatformInstagramOauth(code: string, userId: string) {
  const config = await loadInstagramSocialConfig();
  if (!config.appId || !config.appSecret || !config.graphVersion) throw new Error("Instagram App ID and Instagram App Secret are not configured.");

  const form = new FormData();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", platformInstagramRedirectUri());
  form.set("code", code);
  const shortToken = await json<{ access_token: string; user_id?: string | number; permissions?: string[] }>("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", config.appSecret);
  longUrl.searchParams.set("access_token", shortToken.access_token);
  const longToken = await json<{ access_token: string; token_type?: string; expires_in?: number }>(longUrl.toString());
  const accessToken = longToken.access_token || shortToken.access_token;

  const profileUrl = new URL(`https://graph.instagram.com/${config.graphVersion}/me`);
  profileUrl.searchParams.set("fields", "id,username,account_type,media_count");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = await json<{ id?: string; username?: string; account_type?: string; media_count?: number }>(profileUrl.toString());
  const accountId = String(profile.id || shortToken.user_id || "").trim();
  if (!accountId) throw new Error("Instagram did not return the professional account ID.");

  const expiresAt = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : null;
  const scopes = shortToken.permissions?.length ? shortToken.permissions : SCOPES;
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("marketing_social_connections")
    .update({ status: "disconnected", updated_at: now })
    .eq("scope", "platform")
    .eq("provider", "instagram")
    .neq("provider_account_id", accountId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,connected_at")
    .eq("scope", "platform")
    .eq("provider", "instagram")
    .eq("provider_account_id", accountId)
    .maybeSingle();
  if (existingError) throw existingError;

  const row = {
    scope: "platform",
    location_id: null,
    organization_id: null,
    provider: "instagram",
    provider_account_id: accountId,
    provider_business_id: null,
    display_name: profile.username ? `@${profile.username}` : "Instagram",
    username: profile.username || null,
    status: "connected",
    granted_scopes: scopes,
    token_expires_at: expiresAt,
    connected_by: userId,
    connected_at: existing?.connected_at || now,
    last_refreshed_at: now,
    last_error: null,
    metadata: {
      login_type: "instagram_business_login",
      account_type: profile.account_type || null,
      media_count_at_connect: profile.media_count ?? null,
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

  await storeSocialConnectionSecrets({ connectionId, accessToken, tokenType: longToken.token_type || "Bearer", scopes, expiresAt });
  return { connectionId, username: profile.username || null };
}
