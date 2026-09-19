import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import {
  contentApprovalHash,
  loadMarketingContent,
  syncApprovedSocialRecords,
} from "@/lib/marketing/content-operations";
import { claimAndProcessSocialPublishJob } from "@/lib/marketing/social-publish-claims";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bool(value: unknown) {
  return value === true || value === "1" || value === "true";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mediaUrl(value: unknown) {
  const raw = text(value);
  if (!raw) throw new Error("Choose an image or video before publishing.");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Media must be a valid public URL."); }
  if (parsed.protocol !== "https:") throw new Error("Instagram media must use a public HTTPS URL.");
  return parsed.toString();
}

function publishTime(value: unknown) {
  const raw = text(value);
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("The publish date/time is invalid.");
  if (date.getTime() < Date.now() - 60_000) throw new Error("The publish time cannot be in the past.");
  return date;
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
  const caption = text(body.caption);
  if (!caption) return NextResponse.json({ error: "Add a caption before publishing." }, { status: 400 });
  if (caption.length > 2200) return NextResponse.json({ error: "Instagram captions can be at most 2,200 characters." }, { status: 400 });

  let selectedMediaUrl: string;
  let scheduledAt: Date;
  try {
    selectedMediaUrl = mediaUrl(body.mediaUrl);
    scheduledAt = publishTime(body.publishAt);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Instagram post." }, { status: 400 });
  }

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider_account_id,username,status")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .eq("provider", "instagram")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) return NextResponse.json({ error: connectionError.message }, { status: 500 });
  if (!connection?.id) {
    return NextResponse.json({ error: "Connect this location's Instagram account before publishing." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const publishAt = scheduledAt.toISOString();
  const { data: created, error: createError } = await supabaseAdmin
    .from("marketing_content_items")
    .insert({
      scope: "location",
      location_id: locationId,
      source_type: "location",
      source_id: locationId,
      title: text(body.title) || `Instagram post · ${scheduledAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
      content_type: "social_post",
      owner_user_id: user.id,
      status: "draft",
      priority: "normal",
      publish_at: publishAt,
      approval_status: "not_submitted",
      selected_platforms: ["instagram"],
      media_urls: [selectedMediaUrl],
      caption,
      platform_copy: { instagram: caption },
      auto_publish: true,
      metadata: {
        created_from: "location_instagram_publisher",
        owner_self_approval: true,
        instagram_connection_id: connection.id,
      },
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (createError || !created?.id) {
    return NextResponse.json({ error: createError?.message || "Could not create Instagram content." }, { status: 500 });
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

    const { data: post } = await supabaseAdmin
      .from("social_posts")
      .select("id,social_connection_id")
      .eq("content_item_id", created.id)
      .eq("platform", "instagram")
      .maybeSingle();
    if (!post?.id || post.social_connection_id !== connection.id) {
      throw new Error("Instagram publishing safety check failed: location connection mismatch.");
    }

    const { data: job } = await supabaseAdmin
      .from("social_publish_jobs")
      .select("id,connection_id,status")
      .eq("social_post_id", post.id)
      .in("status", ["queued", "publishing", "retrying"])
      .maybeSingle();
    if (!job?.id || job.connection_id !== connection.id) {
      throw new Error("Instagram publishing safety check failed: job connection mismatch.");
    }

    const publishNow = scheduledAt.getTime() <= Date.now() + 30_000;
    if (!publishNow) {
      return NextResponse.json({
        ok: true,
        status: "scheduled",
        contentId: created.id,
        postId: post.id,
        jobId: job.id,
        publishAt,
        account: connection.username || null,
      });
    }

    const result = await claimAndProcessSocialPublishJob(job.id);
    if ((result as { skipped?: boolean }).skipped) {
      const reason = (result as { reason?: string }).reason || "publishing_paused";
      return NextResponse.json({ error: reason === "claimed_elsewhere" ? "Instagram publishing is already in progress." : "Instagram publishing is currently paused. The post remains queued." }, { status: 409 });
    }
    await ingestSocialMetrics(connection.id).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      status: "published",
      contentId: created.id,
      postId: post.id,
      jobId: job.id,
      account: connection.username || null,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram publishing failed.";
    await supabaseAdmin.from("marketing_content_items").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", created.id);
    return NextResponse.json({ error: message, contentId: created.id }, { status: 500 });
  }
}
