import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { storeSocialConnectionSecrets } from "./social-secrets";

export type SocialProvider = "instagram" | "facebook" | "tiktok" | "youtube";

function baseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://www.theouthaven.com";
}

function oauthStateSecret() {
  return process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "";
}

function sign(value: string) {
  const secret = oauthStateSecret();
  if (!secret) throw new Error("SOCIAL_OAUTH_STATE_SECRET is not configured.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSocialOauthState(provider: SocialProvider, userId: string) {
  const payload = Buffer.from(JSON.stringify({ provider, userId, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySocialOauthState(value: string, provider: SocialProvider) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state.");
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { provider: SocialProvider; userId: string; issuedAt: number };
  if (parsed.provider !== provider) throw new Error("OAuth provider mismatch.");
  if (!parsed.userId || Date.now() - Number(parsed.issuedAt || 0) > 20 * 60 * 1000) throw new Error("OAuth state expired.");
  return parsed;
}

export function socialOauthRedirectUri(provider: SocialProvider) {
  return new URL(`/api/admin/marketing/social/oauth/${provider}/callback`, baseUrl()).toString();
}

function envList(name: string, fallback: string[]) {
  const value = process.env[name];
  return value ? value.split(/[ ,]+/).map((item) => item.trim()).filter(Boolean) : fallback;
}

export function socialOauthConfigured(provider: SocialProvider) {
  if (provider === "instagram" || provider === "facebook") return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_GRAPH_VERSION);
  if (provider === "tiktok") return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  return Boolean(process.env.GOOGLE_SOCIAL_CLIENT_ID && process.env.GOOGLE_SOCIAL_CLIENT_SECRET);
}

export function socialAuthorizeUrl(provider: SocialProvider, state: string) {
  const redirectUri = socialOauthRedirectUri(provider);
  if (provider === "instagram" || provider === "facebook") {
    const appId = process.env.META_APP_ID;
    const version = process.env.META_GRAPH_VERSION;
    if (!appId || !version) throw new Error("Meta social OAuth is not configured.");
    const scopes = envList("META_SOCIAL_SCOPES", [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
    ]);
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  if (provider === "tiktok") {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) throw new Error("TikTok social OAuth is not configured.");
    const scopes = envList("TIKTOK_SOCIAL_SCOPES", ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish", "video.upload"]);
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  const clientId = process.env.GOOGLE_SOCIAL_CLIENT_ID;
  if (!clientId) throw new Error("YouTube OAuth is not configured.");
  const scopes = envList("YOUTUBE_SOCIAL_SCOPES", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ]);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function jsonFetch<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Social provider request failed (${response.status}): ${text.slice(0, 500)}`);
  return body as T;
}

async function upsertConnection(input: {
  provider: SocialProvider;
  providerAccountId: string;
  providerBusinessId?: string | null;
  displayName?: string | null;
  username?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  scopes: string[];
  userId: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id")
    .eq("scope", "platform")
    .eq("provider", input.provider)
    .eq("provider_account_id", input.providerAccountId)
    .maybeSingle();

  let connectionId = existing?.id as string | undefined;
  const row = {
    scope: "platform",
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    provider_business_id: input.providerBusinessId || null,
    display_name: input.displayName || null,
    username: input.username || null,
    status: "connected",
    granted_scopes: input.scopes,
    token_expires_at: input.expiresAt || null,
    connected_by: input.userId,
    connected_at: existing?.id ? undefined : now,
    last_refreshed_at: now,
    last_error: null,
    metadata: input.metadata || {},
    updated_at: now,
  };

  if (connectionId) {
    const { error } = await supabaseAdmin.from("marketing_social_connections").update(row).eq("id", connectionId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.from("marketing_social_connections").insert(row).select("id").single();
    if (error || !data?.id) throw error || new Error("Could not save social connection.");
    connectionId = data.id;
  }

  if (!connectionId) throw new Error("Could not resolve saved social connection ID.");
  await storeSocialConnectionSecrets({
    connectionId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenType: input.tokenType,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
  });
  return connectionId;
}

export async function completeSocialOauth(provider: SocialProvider, code: string, userId: string) {
  const redirectUri = socialOauthRedirectUri(provider);

  if (provider === "instagram" || provider === "facebook") {
    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const version = process.env.META_GRAPH_VERSION!;
    const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const token = await jsonFetch<{ access_token: string; token_type?: string; expires_in?: number }>(tokenUrl.toString());
    const accounts = await jsonFetch<{ data?: Array<{ id: string; name?: string; access_token?: string; instagram_business_account?: { id: string; username?: string; name?: string } }> }>(
      `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(token.access_token)}`,
    );
    const page = (accounts.data || []).find((item) => provider === "facebook" ? Boolean(item.id) : Boolean(item.instagram_business_account?.id));
    if (!page) throw new Error(provider === "instagram" ? "No Instagram professional account linked to an authorized Facebook Page was found." : "No authorized Facebook Page was found.");
    const account = provider === "instagram" ? page.instagram_business_account! : page;
    const accessToken = page.access_token || token.access_token;
    const scopes = envList("META_SOCIAL_SCOPES", []);
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    return upsertConnection({
      provider,
      providerAccountId: account.id,
      providerBusinessId: page.id,
      displayName: account.name || page.name || null,
      username: provider === "instagram" ? page.instagram_business_account?.username || null : page.name || null,
      accessToken,
      tokenType: token.token_type || "Bearer",
      expiresAt,
      scopes,
      userId,
      metadata: { page_id: page.id },
    });
  }

  if (provider === "tiktok") {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const token = await jsonFetch<{ access_token: string; refresh_token?: string; token_type?: string; expires_in?: number; open_id: string; scope?: string }>("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const scopes = token.scope ? token.scope.split(",").map((item) => item.trim()).filter(Boolean) : envList("TIKTOK_SOCIAL_SCOPES", []);
    const creator = await jsonFetch<{ data?: { creator_username?: string; creator_nickname?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number }; error?: { code?: string; message?: string } }>(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      { method: "POST", headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json; charset=UTF-8" } },
    );
    if (creator.error?.code && creator.error.code !== "ok") throw new Error(creator.error.message || "TikTok creator information could not be loaded.");
    const creatorData = creator.data || {};
    return upsertConnection({
      provider,
      providerAccountId: token.open_id,
      displayName: creatorData.creator_nickname || "TikTok",
      username: creatorData.creator_username || null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenType: token.token_type || "Bearer",
      expiresAt,
      scopes,
      userId,
      metadata: {
        open_id: token.open_id,
        privacy_level_options: creatorData.privacy_level_options || [],
        comment_disabled: Boolean(creatorData.comment_disabled),
        duet_disabled: Boolean(creatorData.duet_disabled),
        stitch_disabled: Boolean(creatorData.stitch_disabled),
        max_video_post_duration_sec: creatorData.max_video_post_duration_sec || null,
        creator_info_checked_at: new Date().toISOString(),
      },
    });
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_SOCIAL_CLIENT_ID!,
    client_secret: process.env.GOOGLE_SOCIAL_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const token = await jsonFetch<{ access_token: string; refresh_token?: string; token_type?: string; expires_in?: number; scope?: string }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const channels = await jsonFetch<{ items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string } }> }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${token.access_token}` } });
  const channel = channels.items?.[0];
  if (!channel?.id) throw new Error("No YouTube channel was found for the authorized Google account.");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const scopes = token.scope ? token.scope.split(" ").filter(Boolean) : envList("YOUTUBE_SOCIAL_SCOPES", []);
  return upsertConnection({ provider, providerAccountId: channel.id, displayName: channel.snippet?.title || "YouTube", username: channel.snippet?.customUrl || null, accessToken: token.access_token, refreshToken: token.refresh_token || null, tokenType: token.token_type || "Bearer", expiresAt, scopes, userId, metadata: { channel_id: channel.id } });
}
