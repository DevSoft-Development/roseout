import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensurePublishingReminder, loadMarketingContent, resolveMarketingApprover, taskActorForUser } from "./content-operations";

export async function ensureDailyMarketingReminders() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const { data, error } = await supabaseAdmin
    .from("marketing_content_items")
    .select("id,owner_user_id")
    .in("status", ["approved", "scheduled", "publishing"])
    .eq("approval_status", "approved")
    .gte("publish_at", now.toISOString())
    .lte("publish_at", horizon.toISOString())
    .order("publish_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  let ensured = 0;
  for (const row of data || []) {
    const content = await loadMarketingContent(row.id).catch(() => null);
    if (!content) continue;
    let actor = content.owner_user_id ? await taskActorForUser(content.owner_user_id) : null;
    if (!actor) {
      const approver = await resolveMarketingApprover(null);
      actor = approver?.user_id ? await taskActorForUser(approver.user_id) : null;
    }
    if (!actor) continue;
    await ensurePublishingReminder(content, actor);
    ensured += 1;
  }
  return { scanned: (data || []).length, ensured };
}
