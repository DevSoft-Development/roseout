import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import {
  platformCoreApiConfigured,
  readBusinessAnalyticsViaCoreApi,
} from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  AnalyticsRange,
  buildAnalyticsSummary,
  buildBirdsEyeLocations,
  buildBoroughBreakdown,
  buildCategoryBreakdown,
  buildCityBreakdown,
  buildContactMethodBreakdown,
  buildConversionBreakdown,
  buildDailySeries,
  buildEventBreakdown,
  buildMostSearchedCategories,
  buildPlanBreakdown,
  buildRecentActivity,
  buildSourceBreakdown,
  getRangeStart,
  type AnalyticsEventRow,
  type AnalyticsLocationRow,
  type OutingRow,
} from "@/lib/analytics/new-business-analytics";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export async function GET(request: NextRequest) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.analytics);

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "30d") as AnalyticsRange;
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const filtered = searchParams.get("filtered") === "1";

  if (platformCoreApiConfigured()) {
    try {
      return NextResponse.json(await readBusinessAnalyticsViaCoreApi({ range, q, filtered }));
    } catch {
      // Fail open to the existing Vercel/Supabase implementation during Core rollout.
    }
  }

  const from = getRangeStart(range);
  const [{ data: locations = [] }, { data: events = [] }, { data: outings = [] }] = await Promise.all([
    supabaseAdmin.from("locations").select("*").limit(1000),
    supabaseAdmin.from("analytics_events").select("*").gte("created_at", from || "1900-01-01"),
    supabaseAdmin.from("outings").select("*").gte("created_at", from || "1900-01-01"),
  ]);

  const allLoc = locations as AnalyticsLocationRow[];
  const e = events as AnalyticsEventRow[];
  const o = outings as OutingRow[];
  let working = allLoc;
  if (q) {
    working = working.filter((location) => [
      location.name,
      location.restaurant_name,
      location.activity_name,
      location.city,
      location.borough,
      location.neighborhood,
      location.state,
      location.primary_category,
      location.category,
      location.cuisine,
      location.activity_type,
      location.owner_email,
      location.claimed_by_email,
    ].some((value) => String(value || "").toLowerCase().includes(q)));
  }

  const birds = buildBirdsEyeLocations(working, e, o);
  const sorted = [...birds].sort((a, b) =>
    b.completed_outings - a.completed_outings
    || b.search_clicks - a.search_clicks
    || b.profile_views - a.profile_views,
  );
  const summary = buildAnalyticsSummary(e, o);
  const filteredSummary = buildAnalyticsSummary(
    e.filter((event) => working.some((location) => location.id === event.location_id || location.id === event.metadata?.location_id)),
    o.filter((outing) => working.some((location) => location.id === outing.location_id || location.id === outing.source_location_id)),
  );

  return NextResponse.json({
    success: true,
    range,
    summary,
    daily: buildDailySeries(e),
    top_locations: sorted.slice(0, 10),
    low_conversion_locations: [...sorted]
      .filter((row) => row.outing_starts > 0 && row.completion_rate < 0.25)
      .slice(0, 10),
    birds_eye_locations: sorted,
    most_searched_categories: buildMostSearchedCategories(e, allLoc).slice(0, 10),
    event_breakdown: buildEventBreakdown(e),
    source_breakdown: buildSourceBreakdown(e),
    contact_method_breakdown: buildContactMethodBreakdown(o),
    plan_breakdown: buildPlanBreakdown(allLoc),
    city_breakdown: buildCityBreakdown(allLoc),
    borough_breakdown: buildBoroughBreakdown(allLoc),
    category_breakdown: buildCategoryBreakdown(allLoc),
    conversion_breakdown: buildConversionBreakdown(sorted),
    recent_activity: buildRecentActivity(e),
    filtered,
    filtered_summary: filtered ? filteredSummary : null,
    filter_meta: { q, result_count: working.length, total_count: allLoc.length },
  });
}
