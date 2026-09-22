import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import {
  contentApprovalHash,
  loadMarketingContent,
  normalizePlatforms,
  syncApprovedSocialRecords,
} from "@/lib/marketing/content-operations";
import { claimAndProcessSocialPublishJob } from "@/lib/marketing/social-publish-claims";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown) {
  return value === true || value === "1" || value === "true";
}

function publishTime(value: unknown) {
  const raw = text(value);
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("The publish date/time is invalid.");
  if (date.getTime() < Date.now() - 60_000) throw new Error("The publish time cannot be in the past.");
  return date;
}

function publicMediaUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Media must be a valid public URL."); }
  if (parsed.protocol !== "https:") throw new Error("Social media must use a public HTTPS URL.");
  return parsed.toString();
}

function isVideo(url: string) {
  return /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(url);
}

function platformName(value: string) {
  if (value === "instagram") return "Instagram";
  if (value === "facebook") return "Facebook";
  if (value === "tiktok") return "TikTok";
  return "YouTube";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: text(body.locationId) || undefined,
    adminLocationId: text(body.adminLocationId) || undefined,
    demoLocationId: text(body.demoLocationId) || undefined,
    sourceId: text(body.sourceId) || undefined,
    type: text(body.type) || undefined,
    demo: bool(body.demo),
    fromDemoCenter: bool(body.fromDemoCenter),
    allowDemoPreview: false,
    permission: "marketing.edit",
  });
  if (guard.error || !guard.access?.canonicalLocationId) {
    return NextResponse.json({ error: "You do not have access to this location." }, { status: guard.error?.status || 403 });
  }

  const locationId = String(guard.access.canonicalLocationId);
  const platforms = normalizePlatforms(body.platforms);
  if (!platforms.length) return NextResponse.json({ error: "Choose at least one social channel." }, { status: 400 });

  const caption = text(body.caption);
  const title = text(body.title);
  if (!caption) return NextResponse.json({ error: "Add post copy before publishing." }, { status: 400 });
  if (platforms.includes("instagram") && caption.length > 2200) {
    return NextResponse.json({ error: "Instagram captions can be at most 2,200 characters." }, { status: 400 });
  }

  let mediaUrl = "";
  let scheduledAt: Date;
  try {
    mediaUrl = publicMediaUrl(body.mediaUrl);
    scheduledAt = publishTime(body.publishAt);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid social post." }, { status: 400 });
  }

  if (platforms.includes("instagram") && !mediaUrl) {
    return NextResponse.json({ error: "Instagram requires an image or video." }, { status: 400 });
  }
  if ((platforms.includes("tiktok") || platforms.includes("youtube")) && (!mediaUrl || !isVideo(mediaUrl))) {
    return NextResponse.json({ error: "TikTok and YouTube require a public HTTPS video URL ending in mp4, mov, m4v, or webm." }, { status: 400 });
  }

  const { data: connections, error: connectionError } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,display_name,username,status,metadata")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .in("provider", platforms)
    .eq("status", "connected")
    .order("connected_at", { ascending: false });
  if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 });

  const connectionByProvider = new Map<string, any>();
  for (const connection of connections || []) {
    if (!connectionByProvider.has(String(connection.provider))) connectionByProvider.set(String(connection.provider), connection);
  }
  const missing = platforms.filter((provider) => !connectionByProvider.has(provider));
  if (missing.length) {
    return NextResponse.json({
      error: `Connect ${missing.map(platformName).join(", ")} for this location before publishing.`,
      missingPlatforms: missing,
    }, { status: 409 });
  }

  const platformCopyInput = body.platformCopy && typeof body.platformCopy === "object" ? body.platformCopy as Record<string, unknown> : {};
  const platformCopy = Object.fromEntries(platforms.map((provider) => [
    provider,
    text(platformCopyInput[provider]) || caption,
  ]));

  const tiktokConnection = connectionByProvider.get("tiktok");
  const tiktokMetadata = tiktokConnection?.metadata && typeof tiktokConnection.metadata === "object"
    ? tiktokConnection.metadata as Record<string, unknown>
    : {};
  const allowedPrivacy = Array.isArray(tiktokMetadata.privacy_level_options)
    ? tiktokMetadata.privacy_level_options.map(String)
    : [];
  const requestedPrivacy = text(body.tiktokPrivacyLevel);
  if (platforms.includes("tiktok")) {
    if (!requestedPrivacy) {
      return NextResponse.json({ error: "Choose a TikTok privacy level before publishing." }, { status: 400 });
    }
    if (allowedPrivacy.length && !allowedPrivacy.includes(requestedPrivacy)) {
      return NextResponse.json({ error: "That TikTok privacy level is not currently allowed for this creator." }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const publishAt = scheduledAt.toISOString();
  const metadata = {
    created_from: "location_social_composer",
    owner_self_approval: true,
    tiktok_privacy_level: requestedPrivacy || null,
    tiktok_disable_comment: bool(body.tiktokDisableComment),
    tiktok_disable_duet: bool(body.tiktokDisableDuet),
    tiktok_disable_stitch: bool(body.tiktokDisableStitch),
  };

  const { data: created, error: createError } = await supabaseAdmin
    .from("marketing_content_items")
    .insert({
      scope: "location",
      location_id: locationId,
      source_type: "location",
      source_id: locationId,
      title: title || `Social post · ${scheduledAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
      content_type: "social_post",
      owner_user_id: user.id,
      status: "draft",
      priority: "normal",
      publish_at: publishAt,
      approval_status: "not_submitted",
      selected_platforms: platforms,
      media_urls: mediaUrl ? [mediaUrl] : [],
      caption,
      platform_copy: platformCopy,
      auto_publish: true,
      metadata,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (createError || !created?.id) {
    return NextResponse.json({ error: createError?.message || "Could not create social content." }, { status: 500 });
  }

  try {
    const draft = await loadMarketingContent(created.id);
    const approvalHash = contentApprovalHash(draft);
    await supabaseAdmin
      .from("marketing_content_items")
      .update({
        status: "scheduled",
        approval_status: "approved",
        approved_by: user.id,
        approved_at: now,
        approved_version: draft.current_version,
        approval_hash: approvalHash,
        updated_at: now,
      })
      .eq("id", created.id);

    const approved = await loadMarketingContent(created.id);
    await syncApprovedSocialRecords(approved);

    const { data: posts, error: postsError } = await supabaseAdmin
      .from("social_posts")
      .select("id,platform,social_connection_id")
      .eq("content_item_id", created.id);
    if (postsError) throw postsError;

    const postByProvider = new Map((posts || []).map((post) => [String(post.platform), post]));
    const jobIds: string[] = [];
    for (const provider of platforms) {
      const post = postByProvider.get(provider);
      const connection = connectionByProvider.get(provider);
      if (!post?.id || post.social_connection_id !== connection?.id) {
        throw new Error(`${platformName(provider)} publishing safety check failed: location connection mismatch.`);
      }

      const { data: job, error: jobError } = await supabaseAdmin
        .from("social_publish_jobs")
        .select("id,connection_id,status")
        .eq("social_post_id", post.id)
        .in("status", ["queued", "publishing", "retrying"])
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job?.id || job.connection_id !== connection.id) {
        throw new Error(`${platformName(provider)} publishing safety check failed: job connection mismatch.`);
      }
      jobIds.push(job.id);
    }

    const publishNow = scheduledAt.getTime() <= Date.now() + 30_000;
    if (!publishNow) {
      return NextResponse.json({
        ok: true,
        status: "scheduled",
        contentId: created.id,
        platforms,
        jobIds,
        publishAt,
      });
    }

    const results = await Promise.allSettled(jobIds.map((jobId) => claimAndProcessSocialPublishJob(jobId)));
    const providerResults = platforms.map((provider, index) => {
      const result = results[index];
      if (result.status === "rejected") {
        return { provider, status: "failed", error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
      }
      const value = result.value as Record<string, unknown>;
      if (value.processing) return { provider, status: "processing", providerPostId: value.providerPostId || null };
      if (value.skipped) return { provider, status: "queued", reason: value.reason || "queued" };
      return { provider, status: "published", providerPostId: value.providerPostId || null, permalink: value.permalink || null };
    });
    const failed = providerResults.filter((result) => result.status === "failed");
    const processing = providerResults.filter((result) => result.status === "processing");
    const queued = providerResults.filter((result) => result.status === "queued");

    return NextResponse.json({
      ok: failed.length === 0,
      status: failed.length ? "partial" : processing.length || queued.length ? "processing" : "published",
      contentId: created.id,
      platforms,
      results: providerResults,
    }, { status: failed.length === platforms.length ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Social publishing failed.";
    await supabaseAdmin
      .from("marketing_content_items")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", created.id);
    return NextResponse.json({ error: message, contentId: created.id }, { status: 500 });
  }
}
