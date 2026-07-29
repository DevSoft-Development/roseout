import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationSearchProfile } from "./profileRepository";

type ClaimedItem = {
  id: string;
  run_id: string;
  location_id: string;
  attempts?: number | null;
  max_attempts?: number | null;
};

type RunItemState = {
  status: string;
  attempts?: number | null;
  max_attempts?: number | null;
  result?: { needs_review?: boolean } | null;
};

async function reconcileRun(runId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_search_profile_run_items")
    .select("status,attempts,max_attempts,result")
    .eq("run_id", runId);

  if (error) throw new Error(`Profile run reconciliation failed: ${error.message}`);

  const items = (data ?? []) as RunItemState[];
  const succeeded = items.filter((item) => item.status === "completed").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const cancelled = items.filter((item) => item.status === "cancelled").length;
  const failed = items.filter(
    (item) => item.status === "failed" && Number(item.attempts ?? 0) >= Number(item.max_attempts ?? 3),
  ).length;
  const needsReview = items.filter(
    (item) => item.status === "completed" && item.result?.needs_review === true,
  ).length;
  const processed = succeeded + skipped + failed + cancelled;
  const remaining = Math.max(0, items.length - processed);
  const completed = items.length > 0 && remaining === 0;
  const now = new Date().toISOString();

  const update = {
    processed_count: processed,
    succeeded_count: succeeded,
    failed_count: failed,
    skipped_count: skipped,
    needs_review_count: needsReview,
    status: completed ? (failed === items.length ? "failed" : "completed") : "running",
    completed_at: completed ? now : null,
    updated_at: now,
  };

  const result = await supabaseAdmin
    .from("location_search_profile_runs")
    .update(update)
    .eq("id", runId);

  if (result.error) throw new Error(`Profile run update failed: ${result.error.message}`);

  return { ...update, target_count: items.length, remaining };
}

async function reconcileActiveRuns() {
  const { data, error } = await supabaseAdmin
    .from("location_search_profile_runs")
    .select("id")
    .in("status", ["pending", "running", "cancelling"])
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) throw new Error(`Active profile run lookup failed: ${error.message}`);

  const summaries = [];
  for (const run of data ?? []) summaries.push(await reconcileRun(run.id));
  return summaries;
}

export async function processProfileRunBatch(workerId: string, limit = 50) {
  const claimed = await supabaseAdmin.rpc("claim_location_search_profile_items", {
    p_worker: workerId,
    p_limit: Math.min(250, Math.max(1, limit)),
    p_lease_seconds: 120,
  });

  if (claimed.error) throw new Error(claimed.error.message);

  const items = (claimed.data ?? []) as ClaimedItem[];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      const profile = await refreshLocationSearchProfile(item.location_id, `run:${item.run_id}`);
      const update = await supabaseAdmin
        .from("location_search_profile_run_items")
        .update({
          status: "completed",
          result: { needs_review: profile.needs_review },
          completed_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (update.error) throw new Error(update.error.message);
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Profile processing failed";
      const attempts = Number(item.attempts ?? 1);
      const maxAttempts = Number(item.max_attempts ?? 3);
      const terminal = attempts >= maxAttempts;
      const update = await supabaseAdmin
        .from("location_search_profile_run_items")
        .update({
          status: "failed",
          last_error: { message },
          available_at: terminal
            ? new Date().toISOString()
            : new Date(Date.now() + Math.min(300000, 1000 * 2 ** attempts)).toISOString(),
          completed_at: terminal ? new Date().toISOString() : null,
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (update.error) throw new Error(update.error.message);
      failed += 1;
    }
  }

  const runIds = [...new Set(items.map((item) => item.run_id))];
  const reconciled = [];
  for (const runId of runIds) reconciled.push(await reconcileRun(runId));
  if (!items.length) reconciled.push(...(await reconcileActiveRuns()));

  return {
    processed: items.length,
    succeeded,
    failed,
    skipped,
    retried: items.filter((item) => Number(item.attempts ?? 0) > 1).length,
    runs: reconciled,
  };
}
