import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { processSocialPublishJob, socialPublishingPaused } from "./social-publishing";
import type { SocialProvider } from "./social-oauth";

type ClaimablePublishJob = {
  id: string;
  status: "queued" | "retrying";
  provider: SocialProvider;
};

async function loadClaimableJob(jobId: string): Promise<ClaimablePublishJob | null> {
  const { data, error } = await supabaseAdmin
    .from("social_publish_jobs")
    .select("id,status,provider")
    .eq("id", jobId)
    .in("status", ["queued", "retrying"])
    .maybeSingle();
  if (error) throw error;
  return data as ClaimablePublishJob | null;
}

async function claimPublishJob(job: ClaimablePublishJob) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("social_publish_jobs")
    .update({ status: "publishing", updated_at: now })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function releasePausedClaim(job: ClaimablePublishJob) {
  const { error } = await supabaseAdmin
    .from("social_publish_jobs")
    .update({ status: job.status, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "publishing");
  if (error) console.error("Social publish paused-claim release failed", { jobId: job.id, error: error.message });
}

export async function claimAndProcessSocialPublishJob(jobId: string) {
  const job = await loadClaimableJob(jobId);
  if (!job) return { skipped: true, reason: "claimed_elsewhere" };
  if (await socialPublishingPaused(job.provider)) return { skipped: true, reason: "publishing_paused" };

  const claimed = await claimPublishJob(job);
  if (!claimed) return { skipped: true, reason: "claimed_elsewhere" };

  const result = await processSocialPublishJob(job.id);
  if ((result as { skipped?: boolean }).skipped) await releasePausedClaim(job);
  return result;
}

export async function processDueSocialPublishJobsWithClaims(limit = 10) {
  if (await socialPublishingPaused()) return { processed: 0, published: 0, failed: 0, skipped: 0, paused: true };

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
  let skipped = 0;
  for (const row of data || []) {
    try {
      const result = await claimAndProcessSocialPublishJob(row.id);
      if ((result as { published?: boolean }).published) published += 1;
      else if ((result as { skipped?: boolean }).skipped) skipped += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: (data || []).length, published, failed, skipped, paused: false };
}
