import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminSaasAnalytics = {
  overview: Record<string, number>;
  search: { topSearches: { label: string; count: number }[]; noResultSearches: number };
  locations: { top: any[]; upgradeOpportunities: any[]; highViewsLowConversions: any[] };
  operations: Record<string, number>;
  recentActivity: any[];
  unavailable: string[];
};

async function count(table: string, filter?: (query: any) => any) {
  let query = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: value, error } = await query;
  return { value: value || 0, error };
}

export async function getAdminSaasAnalytics(): Promise<AdminSaasAnalytics> {
  const unavailable: string[] = [];
  const safeCount = async (label: string, table: string, filter?: (query: any) => any) => {
    const result = await count(table, filter);
    if (result.error) unavailable.push(label);
    return result.error ? 0 : result.value;
  };

  const [totalUsers, totalLocations, searchableLocations, claimedLocations, pendingClaims, openSupportTickets, logs, crm] = await Promise.all([
    safeCount("users", "profiles"),
    safeCount("locations", "locations"),
    safeCount("searchable locations", "locations", (q) => q.eq("is_searchable", true)),
    safeCount("claimed locations", "locations", (q) => q.eq("is_claimed", true)),
    safeCount("pending claims", "business_claims", (q) => q.or("status.eq.pending,verification_status.eq.pending")),
    safeCount("open support", "support_tickets", (q) => q.not("status", "in", "(closed,resolved)")),
    supabaseAdmin.from("admin_system_logs").select("*").order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("admin_crm_locations_view").select("*").order("opportunity_score", { ascending: false }).limit(25),
  ]);

  const analyticsEvents = await supabaseAdmin.from("analytics_events").select("event_name, metadata, created_at").gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(2000);
  if (analyticsEvents.error) unavailable.push("analytics events");

  const events = analyticsEvents.error ? [] : analyticsEvents.data || [];
  const totalSearches = events.filter((event: any) => String(event.event_name || "").includes("search")).length;
  const noResultSearches = events.filter((event: any) => String(event.event_name || "").includes("no_result") || Number(event.metadata?.result_count || 1) === 0).length;
  const phoneClicks = events.filter((event: any) => String(event.event_name || "").includes("phone") || String(event.event_name || "").includes("call")).length;
  const websiteClicks = events.filter((event: any) => String(event.event_name || "").includes("website")).length;
  const reservations = events.filter((event: any) => String(event.event_name || "").includes("reserve") || String(event.event_name || "").includes("reservation")).length;
  const completedOutings = events.filter((event: any) => String(event.event_name || "").includes("outing_complete")).length;

  const topSearchMap = new Map<string, number>();
  for (const event of events) {
    const label = String((event as any).metadata?.query || (event as any).metadata?.search || "").trim().toLowerCase();
    if (label) topSearchMap.set(label, (topSearchMap.get(label) || 0) + 1);
  }

  const crmRows = crm.error ? [] : crm.data || [];
  if (crm.error) unavailable.push("CRM analytics view");

  return {
    overview: {
      totalUsers,
      activeUsers: 0,
      newUsers: 0,
      totalLocations,
      searchableLocations,
      claimedLocations,
      unclaimedLocations: Math.max(totalLocations - claimedLocations, 0),
      proLocations: crmRows.filter((row: any) => String(row.plan_status || "").toLowerCase().includes("pro")).length,
      totalSearches,
      noResultSearches,
      reservations,
      phoneClicks,
      websiteClicks,
      completedOutings,
      supportTicketsOpen: openSupportTickets,
      pendingClaims,
      dataQualityIssues: crmRows.filter((row: any) => !row.is_searchable || !row.description || !row.phone).length,
    },
    search: {
      topSearches: [...topSearchMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, count: value })),
      noResultSearches,
    },
    locations: {
      top: [...crmRows].sort((a: any, b: any) => Number(b.profile_views_30d || 0) - Number(a.profile_views_30d || 0)).slice(0, 10),
      upgradeOpportunities: crmRows.filter((row: any) => Number(row.opportunity_score || 0) >= 70).slice(0, 10),
      highViewsLowConversions: crmRows.filter((row: any) => Number(row.profile_views_30d || 0) > 100 && Number(row.conversion_rate_30d || 0) < 0.05).slice(0, 10),
    },
    operations: {
      openClaims: pendingClaims,
      openSupportTickets,
      systemErrors: logs.error ? 0 : (logs.data || []).filter((log: any) => ["error", "critical"].includes(log.level)).length,
      timeSensitiveActions: crmRows.filter((row: any) => row.follow_up_date).length,
    },
    recentActivity: logs.error ? [] : logs.data || [],
    unavailable,
  };
}
