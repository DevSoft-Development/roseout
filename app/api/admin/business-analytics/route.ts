import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { average, normalizeEventName, outingLocationId, rangeToStartIso, type AnalyticsEventRow, type AnalyticsLocationRow, type AnalyticsRange, type OutingRow } from "@/lib/analytics/new-business-analytics";

export async function GET(request: NextRequest) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "30d") as AnalyticsRange;
  const locationId = searchParams.get("location_id") || "";
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const fromIso = rangeToStartIso(range);

  let locationsQ = supabaseAdmin.from("locations").select("*").order("created_at", { ascending: false }).limit(600);
  if (query) locationsQ = locationsQ.or(`name.ilike.%${query}%,restaurant_name.ilike.%${query}%,activity_name.ilike.%${query}%,city.ilike.%${query}%`);
  const { data: locations = [] } = await locationsQ;

  let eventsQ = supabaseAdmin.from("analytics_events").select("*");
  let outingsQ = supabaseAdmin.from("outings").select("*");
  if (fromIso) {
    eventsQ = eventsQ.gte("created_at", fromIso);
    outingsQ = outingsQ.gte("created_at", fromIso);
  }
  const [{ data: events = [] }, { data: outings = [] }] = await Promise.all([eventsQ, outingsQ]);

  const locationMap = new Map((locations as AnalyticsLocationRow[]).map((l) => [l.id, l]));
  const locationRows = (locations as AnalyticsLocationRow[]).map((location) => {
    const locEvents = (events as AnalyticsEventRow[]).filter((e) => e.location_id === location.id || e.metadata?.location_id === location.id);
    const locOutings = (outings as OutingRow[]).filter((o) => outingLocationId(o) === location.id);
    const profileViews = locEvents.filter((e) => ["profile_view", "location_profile_view", "profile_viewed"].includes(normalizeEventName(e))).length;
    const searchClicks = locEvents.filter((e) => ["search_click", "location_click", "restaurant_click", "activity_click"].includes(normalizeEventName(e))).length;
    const reserveClicks = locEvents.filter((e) => ["reserve_clicked", "reservation_clicked", "external_reservation_clicked"].includes(normalizeEventName(e))).length;
    const callClicks = locEvents.filter((e) => ["call_clicked", "phone_click", "phone_clicked"].includes(normalizeEventName(e))).length;
    const starts = locEvents.filter((e) => normalizeEventName(e) === "outing_started").length;
    const completed = locOutings.filter((o) => o.status === "completed" || !!o.completed_at);
    return {
      id: location.id,
      name: location.name || location.restaurant_name || location.activity_name || "Untitled location",
      city: location.city || location.borough || location.neighborhood || "—",
      category: location.primary_category || location.category || location.cuisine || location.activity_type || "uncategorized",
      profile_views: profileViews,
      search_clicks: searchClicks,
      reserve_clicks: reserveClicks,
      call_clicks: callClicks,
      outing_starts: starts,
      completed_outings: completed.length,
      completion_rate: starts > 0 ? completed.length / starts : 0,
      average_rating: average(completed.map((o) => o.rating)),
      plan: location.plan || (location.is_pro ? "pro" : "basic"),
    };
  });

  const allEvents = events as AnalyticsEventRow[];
  const allOutings = outings as OutingRow[];
  const totalStarts = allEvents.filter((e) => normalizeEventName(e) === "outing_started").length;
  const totalCompleted = allOutings.filter((o) => o.status === "completed" || !!o.completed_at).length;

  const categoryMap = new Map<string, number>();
  for (const e of allEvents) {
    const type = normalizeEventName(e);
    if (!["search_click", "search_match", "location_impression"].includes(type)) continue;
    const lid = e.location_id || (e.metadata?.location_id as string | undefined);
    const loc = lid ? locationMap.get(lid) : null;
    const key = loc?.primary_category || loc?.category || loc?.cuisine || loc?.activity_type || "uncategorized";
    categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
  }

  const topLocations = [...locationRows].sort((a, b) => b.search_clicks + b.reserve_clicks - (a.search_clicks + a.reserve_clicks)).slice(0, 8);
  const needAttention = [...locationRows].filter((l) => l.outing_starts > 5).sort((a, b) => a.completion_rate - b.completion_rate).slice(0, 8);

  const filteredLocation = locationId ? locationRows.find((l) => l.id === locationId) || null : null;
  const drilldownEvents = locationId ? allEvents.filter((e) => e.location_id === locationId).slice(-100).reverse() : [];

  return NextResponse.json({
    ok: true,
    range,
    summary: {
      total_locations: (locations || []).length,
      profile_views: allEvents.filter((e) => ["profile_view", "location_profile_view", "profile_viewed"].includes(normalizeEventName(e))).length,
      search_appearances: allEvents.filter((e) => ["search_appearance", "location_impression", "search_match"].includes(normalizeEventName(e))).length,
      search_clicks: allEvents.filter((e) => ["search_click", "location_click", "restaurant_click", "activity_click"].includes(normalizeEventName(e))).length,
      reserve_clicks: allEvents.filter((e) => ["reserve_clicked", "reservation_clicked", "external_reservation_clicked"].includes(normalizeEventName(e))).length,
      call_clicks: allEvents.filter((e) => ["call_clicked", "phone_click", "phone_clicked"].includes(normalizeEventName(e))).length,
      outing_starts: totalStarts,
      completed_outings: totalCompleted,
      completion_rate: totalStarts > 0 ? totalCompleted / totalStarts : 0,
    },
    top_locations: topLocations,
    locations_needing_attention: needAttention,
    most_searched_categories: [...categoryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([category, count]) => ({ category, count })),
    all_locations: locationRows,
    admin_location_drilldown: filteredLocation,
    recent_activity: allEvents.slice(-50).reverse(),
    drilldown_events: drilldownEvents,
  });
}
