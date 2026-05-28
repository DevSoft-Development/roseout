import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AnalyticsRange, buildAnalyticsSummary, buildBirdsEyeLocations, buildBoroughBreakdown, buildCategoryBreakdown, buildCityBreakdown, buildContactMethodBreakdown, buildConversionBreakdown, buildDailySeries, buildEventBreakdown, buildLocationRollups, buildMostSearchedCategories, buildPlanBreakdown, buildRecentActivity, buildSourceBreakdown, getRangeStart, normalizeCategory, type AnalyticsEventRow, type AnalyticsLocationRow, type OutingRow } from "@/lib/analytics/new-business-analytics";

export async function GET(request: NextRequest) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { searchParams } = new URL(request.url); const range=(searchParams.get("range")||"30d") as AnalyticsRange; const from=getRangeStart(range); const q=(searchParams.get("q")||"").toLowerCase().trim(); const filtered=searchParams.get("filtered")==="1";
  const [{data:locations=[]},{data:events=[]},{data:outings=[]}] = await Promise.all([supabaseAdmin.from("locations").select("*").limit(1000), supabaseAdmin.from("analytics_events").select("*").gte("created_at", from || "1900-01-01"), supabaseAdmin.from("outings").select("*").gte("created_at", from || "1900-01-01")]);
  const allLoc=locations as AnalyticsLocationRow[]; const e=events as AnalyticsEventRow[]; const o=outings as OutingRow[];
  let working = allLoc;
  if (q) working = working.filter(l=>[l.name,l.restaurant_name,l.activity_name,l.city,l.borough,l.neighborhood,l.state,l.primary_category,l.category,l.cuisine,l.activity_type,l.owner_email,l.claimed_by_email].some(v=>String(v||"").toLowerCase().includes(q)));
  const birds=buildBirdsEyeLocations(working,e,o);
  const sorted=[...birds].sort((a,b)=>b.completed_outings-a.completed_outings || b.search_clicks-a.search_clicks || b.profile_views-a.profile_views);
  const summary=buildAnalyticsSummary(e,o); const filteredSummary=buildAnalyticsSummary(e.filter(x=>working.some(l=>l.id===x.location_id||l.id===x.metadata?.location_id)), o.filter(x=>working.some(l=>l.id===x.location_id||l.id===x.source_location_id)));
  return NextResponse.json({ success:true, range, summary, daily:buildDailySeries(e), top_locations:sorted.slice(0,10), low_conversion_locations:[...sorted].filter(r=>r.outing_starts>0 && r.completion_rate<0.25).slice(0,10), birds_eye_locations:sorted, most_searched_categories:buildMostSearchedCategories(e,allLoc).slice(0,10), event_breakdown:buildEventBreakdown(e), source_breakdown:buildSourceBreakdown(e), contact_method_breakdown:buildContactMethodBreakdown(o), plan_breakdown:buildPlanBreakdown(allLoc), city_breakdown:buildCityBreakdown(allLoc), borough_breakdown:buildBoroughBreakdown(allLoc), category_breakdown:buildCategoryBreakdown(allLoc), conversion_breakdown:buildConversionBreakdown(sorted), recent_activity:buildRecentActivity(e), filtered, filtered_summary: filtered ? filteredSummary : null, filter_meta: { q, result_count: working.length, total_count: allLoc.length } });
}
