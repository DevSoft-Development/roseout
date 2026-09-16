import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const PROVIDERS = ["instagram", "facebook", "tiktok", "youtube"] as const;

function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, date: start.toISOString().slice(0, 10) };
}

function providerFromEvent(row: any) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const source = String(metadata.utm_source || row.source || "").toLowerCase();
  return PROVIDERS.find((provider) => source.includes(provider)) || null;
}

function isSiteVisit(name: string) {
  return /visit|page_view|landing/.test(name);
}
function isSearch(name: string) {
  return /search/.test(name);
}
function isSelection(name: string) {
  return /plan_selected|outing_open|result_selected/.test(name);
}
function isHighIntent(name: string) {
  return /reserve|reservation|call|direction|ticket|save|booking/.test(name);
}

export async function refreshSocialGrowthSnapshots() {
  const { start, end, date } = dayBounds();
  const previousStart = new Date(start.getTime() - 48 * 60 * 60 * 1000);
  const [connectionsResult, accountMetricsResult, postMetricsResult, analyticsResult, conversationsResult, wonResult] = await Promise.all([
    supabaseAdmin.from("marketing_social_connections").select("id,provider").eq("scope", "platform"),
    supabaseAdmin.from("social_account_metric_snapshots").select("connection_id,captured_at,followers,reach").gte("captured_at", previousStart.toISOString()).order("captured_at", { ascending: false }).limit(5000),
    supabaseAdmin.from("social_post_metric_snapshots").select("social_post_id,provider,captured_at,views,reach").gte("captured_at", start.toISOString()).lt("captured_at", end.toISOString()).order("captured_at", { ascending: false }).limit(10000),
    supabaseAdmin.from("analytics_events").select("event_name,event_type,source,metadata,occurred_at,created_at").gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString()).limit(20000),
    supabaseAdmin.from("social_community_conversations").select("provider,person_type,occasion,area,first_message_at").gte("first_message_at", start.toISOString()).lt("first_message_at", end.toISOString()).limit(10000),
    supabaseAdmin.from("crm_opportunities").select("lead_source,status,monthly_recurring_revenue,actual_close_date,updated_at,metadata").eq("status", "won").gte("updated_at", start.toISOString()).lt("updated_at", end.toISOString()).limit(5000),
  ]);

  const providerByConnection = new Map((connectionsResult.data || []).map((row: any) => [row.id, row.provider]));
  const accountByProvider = new Map<string, any[]>();
  for (const row of accountMetricsResult.data || []) {
    const provider = providerByConnection.get((row as any).connection_id);
    if (!provider) continue;
    const list = accountByProvider.get(provider) || [];
    list.push(row);
    accountByProvider.set(provider, list);
  }

  const latestPost = new Map<string, any>();
  for (const row of postMetricsResult.data || []) {
    const key = `${(row as any).provider}:${(row as any).social_post_id}`;
    if (!latestPost.has(key)) latestPost.set(key, row);
  }

  const analyticsByProvider = new Map<string, any[]>();
  for (const row of analyticsResult.data || []) {
    const metadata = (row as any).metadata && typeof (row as any).metadata === "object" ? (row as any).metadata : {};
    if (metadata.utm_medium !== "community" && !metadata.social_conversation_id) continue;
    const provider = providerFromEvent(row);
    if (!provider) continue;
    const list = analyticsByProvider.get(provider) || [];
    list.push(row);
    analyticsByProvider.set(provider, list);
  }

  const rows = [];
  for (const provider of PROVIDERS) {
    const accountRows = (accountByProvider.get(provider) || []).sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
    const todayRows = accountRows.filter((row) => new Date(row.captured_at) >= start && new Date(row.captured_at) < end);
    const previousRows = accountRows.filter((row) => new Date(row.captured_at) < start);
    const currentFollowers = Number(todayRows[0]?.followers ?? accountRows[0]?.followers ?? 0);
    const previousFollowers = Number(previousRows[0]?.followers ?? currentFollowers);
    const followerDelta = currentFollowers - previousFollowers;
    const providerPosts = [...latestPost.values()].filter((row: any) => row.provider === provider);
    const reach = providerPosts.reduce((sum, row: any) => sum + Number(row.reach ?? row.views ?? 0), 0);
    const events = analyticsByProvider.get(provider) || [];
    const conversations = (conversationsResult.data || []).filter((row: any) => row.provider === provider);
    const businessLeads = conversations.filter((row: any) => row.person_type === "business").length;
    const occasionCounts = new Map<string, number>();
    const areaCounts = new Map<string, number>();
    for (const row of conversations as any[]) {
      if (row.occasion) occasionCounts.set(row.occasion, (occasionCounts.get(row.occasion) || 0) + 1);
      if (row.area) areaCounts.set(row.area, (areaCounts.get(row.area) || 0) + 1);
    }
    const winner = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const won = (wonResult.data || []).filter((row: any) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const leadSource = String(row.lead_source || metadata.source || "").toLowerCase();
      const sourceProvider = String(metadata.social_provider || "").toLowerCase();
      return leadSource.includes("social") && (!sourceProvider || sourceProvider === provider);
    });
    const paidCustomers = won.length;
    const newMrr = won.reduce((sum, row: any) => sum + Number(row.monthly_recurring_revenue || 0), 0);
    const row = {
      snapshot_date: date,
      provider,
      followers_total: currentFollowers,
      followers_gained: Math.max(0, followerDelta),
      followers_lost: Math.max(0, -followerDelta),
      reach,
      profile_visits: 0,
      website_visits: events.filter((event: any) => isSiteVisit(String(event.event_name || event.event_type || "").toLowerCase())).length,
      outing_searches: events.filter((event: any) => isSearch(String(event.event_name || event.event_type || "").toLowerCase())).length,
      outing_selections: events.filter((event: any) => isSelection(String(event.event_name || event.event_type || "").toLowerCase())).length,
      high_intent_actions: events.filter((event: any) => isHighIntent(String(event.event_name || event.event_type || "").toLowerCase())).length,
      business_leads: businessLeads,
      paid_customers: paidCustomers,
      new_mrr: newMrr,
      top_theme: winner(occasionCounts),
      top_area: winner(areaCounts),
      metadata: { community_conversations: conversations.length, attributed_events: events.length },
    };
    const { error } = await supabaseAdmin.from("social_growth_daily_snapshots").upsert(row, { onConflict: "snapshot_date,provider" });
    if (error) throw error;
    rows.push(row);
  }
  return { date, providers: rows.length, rows };
}
