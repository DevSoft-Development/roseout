import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { refreshLocationSearchProfile } from "./profileRepository";

type ClaimedRefreshItem = {
  id: string;
  location_id: string;
  reason: string;
  attempts: number | null;
  max_attempts: number | null;
};

export async function processProfileRefreshQueue(workerId: string, limit = 50) {
  const claimed = await supabaseAdmin.rpc("claim_location_search_profile_refresh_queue", {
    p_worker: workerId,
    p_limit: Math.min(250, Math.max(1, limit)),
    p_lease_seconds: 120,
  });

  if (claimed.error) throw new Error(`Profile refresh queue claim failed: ${claimed.error.message}`);

  const items = (claimed.data ?? []) as ClaimedRefreshItem[];
  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  for (const item of items) {
    try {
      await refreshLocationSearchProfile(item.location_id, item.reason || "refresh_queue");
      const update = await supabaseAdmin
        .from("location_search_profile_refresh_queue")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          lease_expires_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("locked_by", workerId);
      if (update.error) throw new Error(update.error.message);
      succeeded += 1;
    } catch (error) {
      const attempts = Number(item.attempts ?? 1);
      const maxAttempts = Number(item.max_attempts ?? 5);
      const terminal = attempts >= maxAttempts;
      const message = error instanceof Error ? error.message : "Profile refresh failed";
      const update = await supabaseAdmin
        .from("location_search_profile_refresh_queue")
        .update({
          status: terminal ? "failed" : "pending",
          available_at: terminal
            ? new Date().toISOString()
            : new Date(Date.now() + Math.min(300000, 1000 * 2 ** attempts)).toISOString(),
          completed_at: terminal ? new Date().toISOString() : null,
          locked_at: null,
          locked_by: null,
          lease_expires_at: null,
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("locked_by", workerId);
      if (update.error) throw new Error(update.error.message);
      failed += 1;
      if (!terminal) retried += 1;
    }
  }

  return {
    processed: items.length,
    succeeded,
    failed,
    retried,
  };
}
