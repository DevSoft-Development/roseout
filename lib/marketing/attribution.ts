import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

function eventType(row: Record<string, any>) {
  const name = String(row.canonical_event_name || row.event_name || row.event_type || "").toLowerCase();
  if (/sign.?up|register|account_created/.test(name)) return "signup";
  if (/outing.*complet|complet.*outing/.test(name)) return "completed_outing";
  if (/visit|page_view|landing/.test(name)) return "site_visit";
  return null;
}

function marketingSource(row: Record<string, any>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const source = String(row.source || metadata.utm_source || metadata.source || "").toLowerCase();
  return source.includes("marketing") || source.includes("social") || ["instagram", "facebook", "tiktok", "youtube"].some((provider) => source.includes(provider));
}

export async function syncMarketingAttributionFromAnalytics() {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("analytics_events")
    .select("id,event_name,event_type,canonical_event_name,user_id,anonymous_id,session_id,source,metadata,occurred_at,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;

  const rows = (data || []).flatMap((row: any) => {
    const type = eventType(row);
    if (!type || !marketingSource(row)) return [];
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return [{
      source_event_id: row.id,
      content_item_id: typeof metadata.content_item_id === "string" ? metadata.content_item_id : null,
      social_post_id: typeof metadata.social_post_id === "string" ? metadata.social_post_id : null,
      campaign_id: typeof metadata.campaign_id === "string" ? metadata.campaign_id : null,
      event_type: type,
      user_id: row.user_id || null,
      anonymous_id: row.anonymous_id || null,
      session_id: row.session_id || null,
      source: row.source || metadata.utm_source || null,
      medium: metadata.utm_medium || metadata.medium || null,
      campaign: metadata.utm_campaign || metadata.campaign || null,
      metadata,
      occurred_at: row.occurred_at || row.created_at,
    }];
  });
  if (rows.length) {
    const { error: upsertError } = await supabaseAdmin.from("marketing_attribution_events").upsert(rows, { onConflict: "source_event_id", ignoreDuplicates: true });
    if (upsertError) throw upsertError;
  }
  return { scanned: data?.length || 0, attributed: rows.length };
}
