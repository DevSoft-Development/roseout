import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadMetaSocialConfig } from "./social-provider-config";
import { loadSocialConnectionSecrets, storeSocialConnectionSecrets } from "./social-secrets";

export type InstagramConnectionRef = {
  id: string;
  provider_account_id: string | null;
  status: string;
};

type InstagramPublishInput = {
  caption: string;
  mediaUrl: string;
};

export type InstagramMetricBundle = {
  metrics: {
    views?: number | null;
    reach?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    saves?: number | null;
  };
  raw: unknown;
  permalink?: string | null;
};

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

async function graphVersion() {
  const config = await loadMetaSocialConfig();
  if (!config.graphVersion) throw new Error("Instagram Graph API version is not configured.");
  return config.graphVersion;
}

async function instagramJson<T>(path: string, accessToken: string, params?: Record<string, string>, init?: RequestInit) {
  const version = await graphVersion();
  const url = new URL(`https://graph.instagram.com/${version}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Instagram API ${response.status}: ${text.slice(0, 800)}`);
  return body as T;
}

async function refreshInstagramToken(connection: InstagramConnectionRef, currentAccessToken: string, currentScopes: string[]) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentAccessToken);
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  let token: { access_token?: string; token_type?: string; expires_in?: number } = {};
  try { token = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok || !token.access_token) throw new Error(`Instagram token refresh failed (${response.status}): ${text.slice(0, 500)}`);

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;
  await storeSocialConnectionSecrets({
    connectionId: connection.id,
    accessToken: token.access_token,
    tokenType: token.token_type || "Bearer",
    scopes: currentScopes,
    expiresAt,
  });
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("marketing_social_connections")
    .update({
      token_expires_at: expiresAt,
      last_refreshed_at: now,
      status: "connected",
      last_error: null,
      updated_at: now,
    })
    .eq("id", connection.id);
  return token.access_token;
}

export async function instagramAccessToken(connection: InstagramConnectionRef) {
  const secrets = await loadSocialConnectionSecrets(connection.id);
  const expiresAt = secrets.expiresAt ? new Date(secrets.expiresAt).getTime() : null;
  const refreshWindowMs = 7 * 24 * 60 * 60 * 1000;
  if (!expiresAt || expiresAt > Date.now() + refreshWindowMs) return secrets.accessToken;

  try {
    return await refreshInstagramToken(connection, secrets.accessToken, secrets.scopes || []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      await supabaseAdmin
        .from("marketing_social_connections")
        .update({ last_error: `Token refresh warning: ${message}`, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      return secrets.accessToken;
    }
    await supabaseAdmin
      .from("marketing_social_connections")
      .update({ status: "reauthorization_required", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    throw new Error("Instagram access expired. Reconnect this account.");
  }
}

function isVideo(url: string) {
  return /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(url);
}

export async function publishInstagramBusinessMedia(
  connection: InstagramConnectionRef,
  accessToken: string,
  input: InstagramPublishInput,
) {
  if (!connection.provider_account_id) throw new Error("Instagram account ID is missing.");
  const createParams: Record<string, string> = { caption: input.caption };
  if (isVideo(input.mediaUrl)) {
    createParams.media_type = "REELS";
    createParams.video_url = input.mediaUrl;
    createParams.share_to_feed = "true";
  } else {
    createParams.image_url = input.mediaUrl;
  }

  const container = await instagramJson<{ id?: string }>(
    `${encodeURIComponent(connection.provider_account_id)}/media`,
    accessToken,
    createParams,
    { method: "POST" },
  );
  if (!container.id) throw new Error("Instagram did not return a media container ID.");

  if (isVideo(input.mediaUrl)) {
    let ready = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = await instagramJson<{ status_code?: string; status?: string }>(
        encodeURIComponent(container.id),
        accessToken,
        { fields: "status_code,status" },
      );
      if (status.status_code === "FINISHED") { ready = true; break; }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new Error(`Instagram media processing failed: ${status.status || status.status_code}`);
      }
    }
    if (!ready) throw new Error("Instagram media is still processing; retry shortly.");
  }

  const published = await instagramJson<{ id?: string }>(
    `${encodeURIComponent(connection.provider_account_id)}/media_publish`,
    accessToken,
    { creation_id: container.id },
    { method: "POST" },
  );
  if (!published.id) throw new Error("Instagram did not return the published media ID.");
  const details: { permalink?: string } = await instagramJson<{ permalink?: string }>(
    encodeURIComponent(published.id),
    accessToken,
    { fields: "permalink" },
  ).catch(() => ({} as { permalink?: string }));
  return {
    providerPostId: published.id,
    permalink: details.permalink || null,
    response: published,
  };
}

export async function instagramAccountMetrics(connection: InstagramConnectionRef, accessToken: string) {
  if (!connection.provider_account_id) throw new Error("Instagram account ID is missing.");
  const body = await instagramJson<Record<string, unknown>>(
    encodeURIComponent(connection.provider_account_id),
    accessToken,
    { fields: "id,username,followers_count,media_count" },
  );
  return {
    followers: numeric(body.followers_count),
    following: null,
    posts: numeric(body.media_count),
    views: null,
    reach: null,
    raw_metrics: body,
  };
}

export async function instagramPostMetrics(postId: string, accessToken: string): Promise<InstagramMetricBundle> {
  const media = await instagramJson<Record<string, unknown>>(
    encodeURIComponent(postId),
    accessToken,
    { fields: "id,permalink,like_count,comments_count" },
  );
  let insights: { data?: Array<{ name?: string; value?: unknown; values?: Array<{ value?: unknown }> }> } = {};
  try {
    insights = await instagramJson<typeof insights>(
      `${encodeURIComponent(postId)}/insights`,
      accessToken,
      { metric: "views,reach,saved,shares,total_interactions" },
    );
  } catch {
    try {
      insights = await instagramJson<typeof insights>(
        `${encodeURIComponent(postId)}/insights`,
        accessToken,
        { metric: "reach,saved,shares,total_interactions" },
      );
    } catch {}
  }
  const metricMap = Object.fromEntries((insights.data || []).map((row) => [row.name, row.values?.[0]?.value ?? row.value]));
  return {
    metrics: {
      views: numeric(metricMap.views),
      reach: numeric(metricMap.reach),
      likes: numeric(media.like_count),
      comments: numeric(media.comments_count),
      shares: numeric(metricMap.shares),
      saves: numeric(metricMap.saved),
    },
    raw: { media, insights },
    permalink: typeof media.permalink === "string" ? media.permalink : null,
  };
}
