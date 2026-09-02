import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { contentApprovalHash, loadMarketingContent, syncApprovedSocialRecords } from "@/lib/marketing/content-operations";
import { claimAndProcessSocialPublishJob } from "@/lib/marketing/social-publish-claims";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingPublish);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const content = await loadMarketingContent(id);
    if (content.approval_status !== "approved" || content.approved_version !== content.current_version || content.approval_hash !== contentApprovalHash(content)) {
      return NextResponse.json({ success: false, error: "Current content version is not approved." }, { status: 409 });
    }

    await syncApprovedSocialRecords(content);
    const { data: posts, error: postsError } = await supabaseAdmin
      .from("social_posts")
      .select("id,platform,social_connection_id")
      .eq("content_item_id", id)
      .in("platform", content.selected_platforms || []);
    if (postsError) throw postsError;

    const now = new Date().toISOString();
    const jobIds: string[] = [];
    const blockedResults: Array<Record<string, unknown>> = [];
    for (const post of posts || []) {
      if (!post.social_connection_id) continue;
      const { data: existing } = await supabaseAdmin
        .from("social_publish_jobs")
        .select("id,status")
        .eq("social_post_id", post.id)
        .in("status", ["queued", "retrying", "publishing"])
        .maybeSingle();

      if (existing?.id && existing.status === "publishing") {
        blockedResults.push({
          jobId: existing.id,
          ok: false,
          skipped: true,
          reason: "publishing_inflight",
        });
        continue;
      }

      if (existing?.id) {
        const { error } = await supabaseAdmin
          .from("social_publish_jobs")
          .update({ scheduled_at: now, status: "queued", next_retry_at: null, error_message: null, updated_at: now })
          .eq("id", existing.id)
          .in("status", ["queued", "retrying"]);
        if (error) throw error;
        jobIds.push(existing.id);
      } else {
        const { data: created, error } = await supabaseAdmin
          .from("social_publish_jobs")
          .insert({
            social_post_id: post.id,
            connection_id: post.social_connection_id,
            provider: post.platform === "youtube_shorts" ? "youtube" : post.platform,
            scheduled_at: now,
            status: "queued",
          })
          .select("id")
          .single();
        if (error) throw error;
        jobIds.push(created.id);
      }
    }

    if (!jobIds.length && !blockedResults.length) {
      return NextResponse.json({ success: false, error: "No connected social accounts are available for the selected platforms." }, { status: 409 });
    }

    const results: Array<Record<string, unknown>> = [...blockedResults];
    for (const jobId of jobIds) {
      try {
        const result = await claimAndProcessSocialPublishJob(jobId);
        const skipped = Boolean((result as { skipped?: boolean }).skipped);
        results.push({ jobId, ok: !skipped, skipped, result });
      } catch (error) {
        results.push({ jobId, ok: false, error: error instanceof Error ? error.message : "Publish failed" });
      }
    }

    return NextResponse.json({ success: results.some((row) => row.ok === true), results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Publish Now failed." }, { status: 500 });
  }
}
