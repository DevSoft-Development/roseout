import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createDataForSeoReviewTask } from "@/lib/location-intelligence/v2/dataforseo";
import { dueReviewRefreshes } from "@/lib/location-intelligence/v2/reviews";

function locationName(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "").trim();
}

export async function submitDueDataForSeoReviewRefreshes(limit = 25) {
  const due = await dueReviewRefreshes(limit);
  const results: Array<{ locationId: string; submitted: boolean; taskId?: string; error?: string }> = [];

  for (const item of due as Array<Record<string, any>>) {
    if (String(item.provider) !== "dataforseo") continue;
    const locationId = String(item.location_id || "");
    if (!locationId) continue;

    try {
      const [{ data: location, error: locationError }, { data: identity, error: identityError }] = await Promise.all([
        supabaseAdmin
          .from("locations")
          .select("id,name,restaurant_name,activity_name,city,state")
          .eq("id", locationId)
          .single(),
        supabaseAdmin
          .from("location_external_identities")
          .select("external_id")
          .eq("location_id", locationId)
          .eq("provider", "google")
          .eq("is_current", true)
          .maybeSingle(),
      ]);
      if (locationError) throw new Error(locationError.message);
      if (identityError) throw new Error(identityError.message);

      const name = locationName(location || {});
      const googlePlaceId = String(identity?.external_id || "").trim();
      if (!name || !googlePlaceId) throw new Error("review_refresh_identity_incomplete");

      const geo = [location?.city, location?.state, "United States"].filter(Boolean).join(",");
      const task = await createDataForSeoReviewTask({
        googlePlaceId,
        locationName: geo || "United States",
        depth: 100,
        sortBy: "newest",
        tag: `toh:${locationId}`,
      });

      const { error: updateError } = await supabaseAdmin
        .from("location_review_refresh_state")
        .update({
          metadata: { taskId: task.id, submittedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("location_id", locationId)
        .eq("provider", "dataforseo");
      if (updateError) throw new Error(updateError.message);

      results.push({ locationId, submitted: true, taskId: task.id });
    } catch (error) {
      results.push({
        locationId,
        submitted: false,
        error: error instanceof Error ? error.message : "review_refresh_submit_failed",
      });
    }
  }

  return results;
}
