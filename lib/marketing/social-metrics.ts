import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  instagramAccessToken,
  instagramAccountMetrics,
  instagramPostMetrics,
  type InstagramConnectionRef,
} from "./instagram-business-api";
import { loadSocialConnectionSecrets } from "./social-secrets";
import type { SocialProvider } from "./social-oauth";

type Metrics = {
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  watch_time_seconds?: number | null;
  completion_rate?: number | null;
  profile_visits?: number | null;
  clicks?: number | null;
};

type MetricConnection = InstagramConnectionRef & {
  provider: SocialProvider;
};

async function providerJson<T>(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Metrics API ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text || "{}") as T;
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function metaVersion() {
  if (!process.env.META_GRAPH_VERSION) throw new Error("META_GRAPH_VERSION is not configured.");
  return process.env.META_GRAPH_VERSION;
}

async function postMetrics(provider: SocialProvider, postId: string, accessToken: string): Promise<{ metrics: Metrics; raw: unknown }> {
  if (provider === "youtube") {
    const body = await providerJson<{ items?: Array<{ statistics?: Record<string, string> }> }>(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(postId)}`, accessToken);
    const stats = body.items?.[0]?.statistics || {};
    return { metrics: { views: number(stats.viewCount), likes: number(stats.likeCount), comments: number(stats.commentCount) }, raw: body };
  }
  if (provider === "tiktok") {
    const body = await providerJson<{ data?: { videos?: Array<Record<string, unknown>> } }>("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", accessToken, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filters: { video_ids: [postId] } }) });
    const stats = body.data?.videos?.[0] || {};
    return { metrics: { views: number(stats.view_count), likes: number(stats.like_count), comments: number(stats.comment_count), shares: number(stats.share_count) }, raw: body };
  }
  if (provider === "instagram") {
    const result = await instagramPostMetrics(postId, accessToken);
    return { metrics: result.metrics, raw: result.raw };
  }
  const version = metaVersion();
  const body = await providerJson<any>(`https://graph.facebook.com/${version}/${encodeURIComponent(postId)}?fields=shares,reactions.limit(0).summary(true),comments.limit(0).summary(true),insights.metric(post_impressions,post_clicks)&access_token=${encodeURIComponent(accessToken)}`, accessToken);
  const insightMap = Object.fromEntries((body.insights?.data || []).map((row: any) => [row.name, row.values?.[0]?.value]));
  return { metrics: { views: number(insightMap.post_impressions), likes: number(body.reactions?.summary?.total_count), comments: number(body.comments?.summary?.total_count), shares: number(body.shares?.count), clicks: number(insightMap.post_clicks) }, raw: body };
}

async function accountMetrics(connection: MetricConnection, accessToken: string) {
  if (!connection.provider_account_id) throw new Error(`${connection.provider} account ID is missing.`);
  if (connection.provider === "youtube") {
    const body = await providerJson<any>(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(connection.provider_account_id)}`, accessToken);
    const stats = body.items?.[0]?.statistics || {};
    return { followers: number(stats.subscriberCount), following: null, posts: number(stats.videoCount), views: number(stats.viewCount), reach: null, raw_metrics: body };
  }
  if (connection.provider === "tiktok") {
    const body = await providerJson<any>("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,following_count,likes_count,video_count", accessToken);
    const user = body.data?.user || {};
    return { followers: number(user.follower_count), following: number(user.following_count), posts: number(user.video_count), views: null, reach: null, raw_metrics: body };
  }
  if (connection.provider === "instagram") {
    return instagramAccountMetrics(connection, accessToken);
  }
  const version = metaVersion();
  const body = await providerJson<any>(`https://graph.facebook.com/${version}/${encodeURIComponent(connection.provider_account_id)}?fields=followers_count,fan_count&access_token=${encodeURIComponent(accessToken)}`, accessToken);
  return { followers: number(body.followers_count ?? body.fan_count), following: null, posts: null, views: null, reach: null, raw_metrics: body };
}

async function accessTokenForMetrics(connection: MetricConnection) {
  if (connection.provider === "instagram") return instagramAccessToken(connection);
  const secrets = await loadSocialConnectionSecrets(connection.id);
  return secrets.accessToken;
}

export async function ingestSocialMetrics(connectionId?: string) {
  let query = supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,provider_account_id,status")
    .eq("status", "connected");
  if (connectionId) query = query.eq("id", connectionId);
  const { data: connections, error } = await query;
  if (error) throw error;

  let accounts = 0;
  let posts = 0;
  let errors = 0;

  for (const rawConnection of connections || []) {
    const connection = rawConnection as MetricConnection;
    try {
      if (!connection.provider_account_id) continue;
      const provider = connection.provider;
      const accessToken = await accessTokenForMetrics(connection);
      const account = await accountMetrics(connection, accessToken);
      await supabaseAdmin.from("social_account_metric_snapshots").insert({ connection_id: connection.id, ...account, captured_at: new Date().toISOString() });
      accounts += 1;

      const { data: socialPosts } = await supabaseAdmin
        .from("social_posts")
        .select("id,platform_post_id")
        .eq("social_connection_id", connection.id)
        .eq("status", "posted")
        .not("platform_post_id", "is", null)
        .order("posted_at", { ascending: false })
        .limit(100);
      for (const post of socialPosts || []) {
        try {
          const result = await postMetrics(provider, post.platform_post_id, accessToken);
          await supabaseAdmin.from("social_post_metric_snapshots").insert({ social_post_id: post.id, provider, captured_at: new Date().toISOString(), ...result.metrics, raw_metrics: result.raw });
          await supabaseAdmin.from("social_posts").update({ last_metrics_sync_at: new Date().toISOString() }).eq("id", post.id);
          posts += 1;
        } catch {
          errors += 1;
        }
      }
      await supabaseAdmin.from("marketing_social_connections").update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
    } catch (caught) {
      errors += 1;
      await supabaseAdmin.from("marketing_social_connections").update({ last_error: caught instanceof Error ? caught.message : "Metrics sync failed", updated_at: new Date().toISOString() }).eq("id", connection.id);
    }
  }
  return { connections: (connections || []).length, accounts, posts, errors };
}
