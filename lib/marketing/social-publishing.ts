import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureCrmTaskForSource } from "@/lib/crm/tasks/service";
import { syncMicrosoft365TasksWithCrm } from "@/lib/microsoft-365/task-crm-sync";
import {
  contentApprovalHash,
  loadMarketingContent,
  resolveMarketingApprover,
  taskActorForUser,
} from "./content-operations";
import { loadSocialConnectionSecrets, storeSocialConnectionSecrets } from "./social-secrets";
import type { SocialProvider } from "./social-oauth";

type SocialPostRow = {
  id: string;
  content_item_id: string | null;
  social_connection_id: string | null;
  platform: string;
  caption: string | null;
  title: string | null;
  description: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  metadata: Record<string, unknown> | null;
};

type PublishJobRow = {
  id: string;
  social_post_id: string;
  connection_id: string | null;
  provider: SocialProvider;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  provider_post_id: string | null;
  provider_permalink: string | null;
};

type SocialConnectionRow = {
  id: string;
  provider: SocialProvider;
  provider_account_id: string | null;
  provider_business_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type ProviderPublishResult = {
  providerPostId: string | null;
  permalink: string | null;
  response: unknown;
  processing?: boolean;
};

function boolSetting(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return false;
}

export async function socialPublishingPaused(provider?: SocialProvider) {
  const keys = ["social_publishing_global_pause"];
  if (provider) keys.push(`social_publishing_pause_${provider}`);
  const { data } = await supabaseAdmin.from("marketing_settings").select("key,value").in("key", keys);
  const settings = new Map((data || []).map((row) => [row.key, row.value]));
  return boolSetting(settings.get("social_publishing_global_pause")) || (provider ? boolSetting(settings.get(`social_publishing_pause_${provider}`)) : false);
}

async function providerFetch<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Provider API ${response.status}: ${text.slice(0, 800)}`);
  return body as T;
}

function metaVersion() {
  const value = process.env.META_GRAPH_VERSION;
  if (!value) throw new Error("META_GRAPH_VERSION is not configured.");
  return value;
}

function isVideo(url: string | null) {
  return Boolean(url && /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(url));
}

async function publishInstagram(post: SocialPostRow, connection: SocialConnectionRow, accessToken: string): Promise<ProviderPublishResult> {
  if (!connection.provider_account_id) throw new Error("Instagram account ID is missing.");
  if (!post.media_url) throw new Error("Instagram publishing requires attached media.");
  const version = metaVersion();
  const createUrl = new URL(`https://graph.facebook.com/${version}/${connection.provider_account_id}/media`);
  createUrl.searchParams.set("access_token", accessToken);
  createUrl.searchParams.set("caption", post.caption || "");
  if (isVideo(post.media_url)) {
    createUrl.searchParams.set("media_type", "REELS");
    createUrl.searchParams.set("video_url", post.media_url);
    createUrl.searchParams.set("share_to_feed", "true");
  } else {
    createUrl.searchParams.set("image_url", post.media_url);
  }
  const container = await providerFetch<{ id: string }>(createUrl.toString(), { method: "POST" });
  if (!container.id) throw new Error("Instagram did not return a media container ID.");

  if (isVideo(post.media_url)) {
    let ready = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = await providerFetch<{ status_code?: string; status?: string }>(`https://graph.facebook.com/${version}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
      if (status.status_code === "FINISHED") { ready = true; break; }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new Error(`Instagram media processing failed: ${status.status || status.status_code}`);
    }
    if (!ready) throw new Error("Instagram media is still processing; retry shortly.");
  }

  const publishUrl = new URL(`https://graph.facebook.com/${version}/${connection.provider_account_id}/media_publish`);
  publishUrl.searchParams.set("creation_id", container.id);
  publishUrl.searchParams.set("access_token", accessToken);
  const published = await providerFetch<{ id: string }>(publishUrl.toString(), { method: "POST" });
  const permalinkResponse: { permalink?: string } = published.id
    ? await providerFetch<{ permalink?: string }>(`https://graph.facebook.com/${version}/${published.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`).catch(() => ({} as { permalink?: string }))
    : {};
  const permalink = permalinkResponse.permalink || null;
  return { providerPostId: published.id || container.id, permalink, response: published };
}

async function publishFacebook(post: SocialPostRow, connection: SocialConnectionRow, accessToken: string): Promise<ProviderPublishResult> {
  if (!connection.provider_account_id) throw new Error("Facebook Page ID is missing.");
  const version = metaVersion();
  let endpoint = `https://graph.facebook.com/${version}/${connection.provider_account_id}/feed`;
  const body = new URLSearchParams({ access_token: accessToken });
  if (post.media_url && isVideo(post.media_url)) {
    endpoint = `https://graph.facebook.com/${version}/${connection.provider_account_id}/videos`;
    body.set("file_url", post.media_url);
    body.set("description", post.caption || post.description || "");
  } else if (post.media_url) {
    endpoint = `https://graph.facebook.com/${version}/${connection.provider_account_id}/photos`;
    body.set("url", post.media_url);
    body.set("caption", post.caption || "");
  } else {
    body.set("message", post.caption || post.description || post.title || "");
  }
  const published = await providerFetch<{ id?: string; post_id?: string }>(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const id = published.post_id || published.id || null;
  return { providerPostId: id, permalink: id ? `https://www.facebook.com/${id.replace("_", "/posts/")}` : null, response: published };
}

async function refreshTikTok(connection: SocialConnectionRow, refreshToken: string) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const token = await providerFetch<{ access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string }>("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await storeSocialConnectionSecrets({ connectionId: connection.id, accessToken: token.access_token, refreshToken: token.refresh_token || refreshToken, tokenType: token.token_type || "Bearer", scopes: token.scope ? token.scope.split(",").map((item) => item.trim()).filter(Boolean) : [], expiresAt });
  await supabaseAdmin.from("marketing_social_connections").update({ token_expires_at: expiresAt, last_refreshed_at: new Date().toISOString(), status: "connected", last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  return token.access_token;
}

async function refreshGoogle(connection: SocialConnectionRow, refreshToken: string) {
  const body = new URLSearchParams({ client_id: process.env.GOOGLE_SOCIAL_CLIENT_ID || "", client_secret: process.env.GOOGLE_SOCIAL_CLIENT_SECRET || "", grant_type: "refresh_token", refresh_token: refreshToken });
  const token = await providerFetch<{ access_token: string; expires_in?: number; token_type?: string; scope?: string }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await storeSocialConnectionSecrets({ connectionId: connection.id, accessToken: token.access_token, refreshToken, tokenType: token.token_type || "Bearer", scopes: token.scope ? token.scope.split(" ").filter(Boolean) : [], expiresAt });
  await supabaseAdmin.from("marketing_social_connections").update({ token_expires_at: expiresAt, last_refreshed_at: new Date().toISOString(), status: "connected", last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  return token.access_token;
}

async function accessTokenForConnection(connection: SocialConnectionRow) {
  const secrets = await loadSocialConnectionSecrets(connection.id);
  const expiresAt = secrets.expiresAt ? new Date(secrets.expiresAt).getTime() : null;
  if (!expiresAt || expiresAt > Date.now() + 5 * 60 * 1000) return secrets.accessToken;
  if (connection.provider === "tiktok" && secrets.refreshToken) return refreshTikTok(connection, secrets.refreshToken);
  if (connection.provider === "youtube" && secrets.refreshToken) return refreshGoogle(connection, secrets.refreshToken);
  throw new Error("Social OAuth token expired. Reconnect this account.");
}

async function publishTikTok(post: SocialPostRow, job: PublishJobRow, accessToken: string): Promise<ProviderPublishResult> {
  if (!post.media_url) throw new Error("TikTok publishing requires a video URL.");
  if (job.provider_post_id) {
    const status = await providerFetch<{ data?: { status?: string; publicaly_available_post_id?: string[]; publicly_available_post_id?: string[]; fail_reason?: string } }>("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ publish_id: job.provider_post_id }),
    });
    const providerStatus = status.data?.status || "PROCESSING_UPLOAD";
    if (["FAILED", "PUBLISH_FAILED"].includes(providerStatus)) throw new Error(status.data?.fail_reason || "TikTok publish failed.");
    const postId = status.data?.publicly_available_post_id?.[0] || status.data?.publicaly_available_post_id?.[0] || null;
    if (!postId && !["PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"].includes(providerStatus)) {
      return { providerPostId: job.provider_post_id, permalink: null, response: status, processing: true };
    }
    return { providerPostId: postId || job.provider_post_id, permalink: postId ? `https://www.tiktok.com/@/video/${postId}` : null, response: status };
  }

  const initialized = await providerFetch<{ data?: { publish_id?: string }; error?: { code?: string; message?: string } }>("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: (post.caption || post.title || "").slice(0, 2200),
        privacy_level: process.env.TIKTOK_DEFAULT_PRIVACY || "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: post.media_url },
    }),
  });
  const publishId = initialized.data?.publish_id;
  if (!publishId) throw new Error(initialized.error?.message || "TikTok did not return a publish ID.");
  return { providerPostId: publishId, permalink: null, response: initialized, processing: true };
}

async function publishYouTube(post: SocialPostRow, accessToken: string): Promise<ProviderPublishResult> {
  if (!post.media_url) throw new Error("YouTube publishing requires a video URL.");
  const mediaResponse = await fetch(post.media_url);
  if (!mediaResponse.ok) throw new Error(`Could not download YouTube media (${mediaResponse.status}).`);
  const media = Buffer.from(await mediaResponse.arrayBuffer());
  const contentType = mediaResponse.headers.get("content-type") || "video/mp4";
  const boundary = `theouthaven_${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    snippet: { title: (post.title || post.caption || "TheOutHaven").slice(0, 100), description: post.description || post.caption || "" },
    status: { privacyStatus: process.env.YOUTUBE_DEFAULT_PRIVACY || "public", selfDeclaredMadeForKids: false },
  });
  const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, media, suffix]);
  const published = await providerFetch<{ id?: string }>("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": `multipart/related; boundary=${boundary}`, "content-length": String(body.length) }, body });
  return { providerPostId: published.id || null, permalink: published.id ? `https://www.youtube.com/watch?v=${published.id}` : null, response: published };
}

async function createFailedPublishTask(post: SocialPostRow, job: PublishJobRow, errorMessage: string) {
  if (!post.content_item_id) return;
  const content = await loadMarketingContent(post.content_item_id).catch(() => null);
  if (!content) return;
  let assignee = content.owner_user_id;
  let actor = assignee ? await taskActorForUser(assignee) : null;
  if (!actor) {
    const approver = await resolveMarketingApprover(null);
    assignee = approver?.user_id || null;
    actor = assignee ? await taskActorForUser(assignee) : null;
  }
  if (!actor || !assignee) return;

  await ensureCrmTaskForSource({
    sourceSystem: "marketing",
    sourceRecordId: `publish-failure:${job.id}`,
    taskType: "internal",
    assigned_to_user_id: assignee,
    location_id: content.location_id,
    title: `Publishing failed: ${content.title} (${job.provider})`,
    description: `${errorMessage}\n\nOpen /admin/dashboard/marketing/content/${content.id} and /admin/dashboard/marketing/social-accounts to resolve the failure, then retry.`,
    status: "open",
    priority: "urgent",
    queue_key: "content",
    category: "marketing",
    subtype: "publishing_failure",
    workflow_key: "marketing_social_publish",
    workflow_stage: "failed",
    due_at: new Date().toISOString(),
    reminder_at: new Date().toISOString(),
    metadata: { marketing_content_item_id: content.id, social_publish_job_id: job.id, provider: job.provider, deep_link: `/admin/dashboard/marketing/content/${content.id}` },
  }, actor);
  await syncMicrosoft365TasksWithCrm(assignee).catch(() => undefined);
}

async function loadJobContext(jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin.from("social_publish_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobError || !job) throw jobError || new Error("Publish job not found.");
  const { data: post, error: postError } = await supabaseAdmin.from("social_posts").select("*").eq("id", job.social_post_id).maybeSingle();
  if (postError || !post) throw postError || new Error("Social post not found.");
  if (!job.connection_id) throw new Error("No social account connection is assigned to this job.");
  const { data: connection, error: connectionError } = await supabaseAdmin.from("marketing_social_connections").select("*").eq("id", job.connection_id).maybeSingle();
  if (connectionError || !connection) throw connectionError || new Error("Social connection not found.");
  return { job: job as PublishJobRow, post: post as SocialPostRow, connection: connection as SocialConnectionRow };
}

export async function processSocialPublishJob(jobId: string) {
  const { job, post, connection } = await loadJobContext(jobId);
  if (await socialPublishingPaused(job.provider)) return { skipped: true, reason: "publishing_paused" };
  if (connection.status !== "connected") throw new Error(`${job.provider} account is not connected.`);

  if (!post.content_item_id) throw new Error("Social post is not linked to a master content item.");
  const content = await loadMarketingContent(post.content_item_id);
  const currentHash = contentApprovalHash(content);
  if (content.approval_status !== "approved" || Number(content.approved_version) !== Number(content.current_version) || content.approval_hash !== currentHash) {
    throw new Error("Publishing blocked: current content version is not approved.");
  }

  const now = new Date().toISOString();
  await supabaseAdmin.from("social_publish_jobs").update({ status: "publishing", attempt_count: Number(job.attempt_count || 0) + 1, last_attempt_at: now, updated_at: now }).eq("id", job.id);
  await supabaseAdmin.from("marketing_content_items").update({ status: "publishing", updated_at: now }).eq("id", content.id);

  try {
    const accessToken = await accessTokenForConnection(connection);
    let result: ProviderPublishResult;
    if (job.provider === "instagram") result = await publishInstagram(post, connection, accessToken);
    else if (job.provider === "facebook") result = await publishFacebook(post, connection, accessToken);
    else if (job.provider === "tiktok") result = await publishTikTok(post, job, accessToken);
    else result = await publishYouTube(post, accessToken);

    if (result.processing) {
      const nextRetryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await supabaseAdmin.from("social_publish_jobs").update({ status: "retrying", provider_post_id: result.providerPostId, provider_response: result.response, next_retry_at: nextRetryAt, updated_at: new Date().toISOString() }).eq("id", job.id);
      return { processing: true, providerPostId: result.providerPostId };
    }

    await supabaseAdmin.from("social_publish_jobs").update({ status: "published", provider_post_id: result.providerPostId, provider_permalink: result.permalink, provider_response: result.response, error_message: null, next_retry_at: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    await supabaseAdmin.from("social_posts").update({ status: "posted", platform_post_id: result.providerPostId, platform_permalink: result.permalink, posted_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", post.id);
    await supabaseAdmin.from("marketing_social_connections").update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);

    const { count } = await supabaseAdmin.from("social_publish_jobs").select("id", { count: "exact", head: true }).eq("social_post_id", post.id).neq("status", "published");
    if (!count) {
      const { count: contentPending } = await supabaseAdmin.from("social_posts").select("id", { count: "exact", head: true }).eq("content_item_id", content.id).neq("status", "posted");
      if (!contentPending) await supabaseAdmin.from("marketing_content_items").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", content.id);
    }
    return { published: true, providerPostId: result.providerPostId, permalink: result.permalink };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Number(job.attempt_count || 0) + 1;
    const permanent = attempts >= 5 || /not approved|reconnect|not connected/i.test(message);
    const nextRetryAt = permanent ? null : new Date(Date.now() + Math.min(60, 2 ** attempts * 2) * 60 * 1000).toISOString();
    await supabaseAdmin.from("social_publish_jobs").update({ status: permanent ? "failed" : "retrying", error_message: message, next_retry_at: nextRetryAt, updated_at: new Date().toISOString() }).eq("id", job.id);
    await supabaseAdmin.from("social_posts").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", post.id);
    await supabaseAdmin.from("marketing_social_connections").update({ last_error: message, status: /reconnect|expired/i.test(message) ? "reauthorization_required" : connection.status, updated_at: new Date().toISOString() }).eq("id", connection.id);
    if (permanent) await createFailedPublishTask(post, job, message);
    throw error;
  }
}

export async function processDueSocialPublishJobs(limit = 10) {
  if (await socialPublishingPaused()) return { processed: 0, published: 0, failed: 0, paused: true };
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("social_publish_jobs")
    .select("id")
    .in("status", ["queued", "retrying"])
    .lte("scheduled_at", now)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let published = 0;
  let failed = 0;
  for (const row of data || []) {
    try {
      const result = await processSocialPublishJob(row.id);
      if ((result as any).published) published += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: (data || []).length, published, failed, paused: false };
}