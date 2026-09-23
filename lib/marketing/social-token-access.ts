import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { instagramAccessToken, type InstagramConnectionRef } from "./instagram-business-api";
import { loadSocialConnectionSecrets, storeSocialConnectionSecrets } from "./social-secrets";
import type { SocialProvider } from "./social-oauth";

export type SocialTokenConnection = InstagramConnectionRef & {
  provider: SocialProvider;
};

async function providerJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Social token refresh failed (${response.status}): ${text.slice(0, 500)}`);
  return body as T;
}

async function saveRefresh(
  connection: SocialTokenConnection,
  input: {
    accessToken: string;
    refreshToken: string;
    tokenType?: string | null;
    scopes: string[];
    expiresAt: string | null;
  },
) {
  await storeSocialConnectionSecrets({
    connectionId: connection.id,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenType: input.tokenType || "Bearer",
    scopes: input.scopes,
    expiresAt: input.expiresAt,
  });
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("marketing_social_connections")
    .update({
      token_expires_at: input.expiresAt,
      last_refreshed_at: now,
      status: "connected",
      last_error: null,
      updated_at: now,
    })
    .eq("id", connection.id);
  return input.accessToken;
}

async function refreshTikTok(connection: SocialTokenConnection, refreshToken: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  if (!clientKey || !clientSecret) throw new Error("TikTok social OAuth is not configured.");
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const token = await providerJson<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  }>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!token.access_token) throw new Error("TikTok token refresh returned no access token.");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const scopes = token.scope
    ? token.scope.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  return saveRefresh(connection, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || refreshToken,
    tokenType: token.token_type,
    scopes,
    expiresAt,
  });
}

async function refreshYouTube(connection: SocialTokenConnection, refreshToken: string) {
  const clientId = process.env.GOOGLE_SOCIAL_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_SOCIAL_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("YouTube OAuth is not configured.");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const token = await providerJson<{
    access_token: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!token.access_token) throw new Error("YouTube token refresh returned no access token.");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const scopes = token.scope ? token.scope.split(" ").filter(Boolean) : [];
  return saveRefresh(connection, {
    accessToken: token.access_token,
    refreshToken,
    tokenType: token.token_type,
    scopes,
    expiresAt,
  });
}

export async function socialAccessToken(connection: SocialTokenConnection) {
  if (connection.provider === "instagram") return instagramAccessToken(connection);

  const secrets = await loadSocialConnectionSecrets(connection.id);
  const expiresAt = secrets.expiresAt ? new Date(secrets.expiresAt).getTime() : null;
  if (!expiresAt || expiresAt > Date.now() + 5 * 60 * 1000) return secrets.accessToken;

  if (connection.provider === "tiktok" && secrets.refreshToken) {
    return refreshTikTok(connection, secrets.refreshToken);
  }
  if (connection.provider === "youtube" && secrets.refreshToken) {
    return refreshYouTube(connection, secrets.refreshToken);
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("marketing_social_connections")
    .update({
      status: "reauthorization_required",
      last_error: "Social OAuth token expired. Reconnect this account.",
      updated_at: now,
    })
    .eq("id", connection.id);
  throw new Error("Social OAuth token expired. Reconnect this account.");
}
