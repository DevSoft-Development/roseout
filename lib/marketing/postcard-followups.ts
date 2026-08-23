import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureCrmTaskForSource } from "@/lib/crm/tasks/service";
import { resolveMarketingApprover, taskActorForUser } from "./content-operations";

function addDays(value: string, days: number) {
  return new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function claimed(location: { is_claimed?: boolean | null; claimed?: boolean | null; claim_status?: string | null; claim_approved_at?: string | null }) {
  return Boolean(location.is_claimed || location.claimed || location.claim_approved_at || ["claimed", "approved", "verified"].includes(String(location.claim_status || "").toLowerCase()));
}

export async function ensurePostcardFollowupSequence() {
  const approver = await resolveMarketingApprover(null);
  const actor = approver?.user_id ? await taskActorForUser(approver.user_id) : null;
  if (!actor) return { scanned: 0, claimChecks: 0, outreachFollowups: 0, skipped: "No eligible admin actor" };

  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: items, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("id,batch_id,location_id,business_name,mailed_at,claimed_at")
    .not("mailed_at", "is", null)
    .lte("mailed_at", threshold)
    .order("mailed_at", { ascending: true })
    .limit(500);
  if (error) throw error;

  const locationIds = [...new Set((items || []).map((item) => item.location_id).filter(Boolean))] as string[];
  const { data: locations, error: locationError } = locationIds.length
    ? await supabaseAdmin.from("locations").select("id,name,business_name,restaurant_name,activity_name,is_claimed,claimed,claim_status,claim_approved_at,claim_last_follow_up_at").in("id", locationIds)
    : { data: [], error: null };
  if (locationError) throw locationError;
  const byLocation = new Map((locations || []).map((row) => [row.id, row]));

  let claimChecks = 0;
  let outreachFollowups = 0;
  for (const item of items || []) {
    if (!item.location_id || !item.mailed_at || item.claimed_at) continue;
    const location = byLocation.get(item.location_id);
    if (!location || claimed(location)) continue;
    const businessName = location.name || location.business_name || location.restaurant_name || location.activity_name || item.business_name || "location";

    const check = await ensureCrmTaskForSource({
      sourceSystem: "marketing",
      sourceRecordId: `postcard-claim-check:${item.id}`,
      taskType: "internal",
      location_id: item.location_id,
      title: `Check postcard claim status: ${businessName}`,
      description: `The claim postcard was mailed at least 7 days ago and this location is still unclaimed. Check scans/claim activity and confirm whether outreach should continue.`,
      status: "open",
      priority: "normal",
      queue_key: "claims",
      category: "marketing",
      subtype: "postcard_claim_check",
      workflow_key: "claim_postcard_follow_up",
      workflow_stage: "claim_check",
      due_at: addDays(item.mailed_at, 7),
      reminder_at: addDays(item.mailed_at, 7),
      metadata: { mailing_batch_id: item.batch_id, mailing_batch_item_id: item.id, deep_link: `/admin/dashboard/crm/locations/${item.location_id}` },
    }, actor);
    if (check.created) claimChecks += 1;

    if (new Date(item.mailed_at).getTime() <= Date.now() - 10 * 24 * 60 * 60 * 1000) {
      const followup = await ensureCrmTaskForSource({
        sourceSystem: "marketing",
        sourceRecordId: `postcard-outreach:${item.id}`,
        taskType: "internal",
        location_id: item.location_id,
        title: `Follow up after claim postcard: ${businessName}`,
        description: `The location remains unclaimed 10+ days after its postcard. Use the verified contact/social channels, record the outreach result, and respect any do-not-contact status.`,
        status: "open",
        priority: "normal",
        queue_key: "outreach",
        category: "marketing",
        subtype: "postcard_outreach_follow_up",
        workflow_key: "claim_postcard_follow_up",
        workflow_stage: "outreach_follow_up",
        due_at: addDays(item.mailed_at, 10),
        reminder_at: addDays(item.mailed_at, 10),
        metadata: { mailing_batch_id: item.batch_id, mailing_batch_item_id: item.id, deep_link: `/admin/dashboard/crm/locations/${item.location_id}` },
      }, actor);
      if (followup.created) outreachFollowups += 1;
    }
  }
  return { scanned: (items || []).length, claimChecks, outreachFollowups };
}
