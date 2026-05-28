import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminRole } from "@/lib/admin-auth";
import { AnalyticsRange, buildAnalyticsSummary, buildDailySeries, buildFunnel, buildInsights, buildRecentActivity, getEventLocationId, getOutingLocationId, getRangeStart, type AnalyticsEventRow, type OutingRow } from "@/lib/analytics/new-business-analytics";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("location_id") || "";
  const range = (searchParams.get("range") || "30d") as AnalyticsRange;
  const admin = searchParams.get("admin") === "1";
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  if (admin) await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  else {
    const supabase = await createClient(); const { data:{user} } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ success:false,error:"Unauthorized" },{status:401});
    const { data: loc } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
    const email = String(user.email||"").toLowerCase();
    if (!loc || !(loc.owner_user_id===user.id || String(loc.owner_email||"").toLowerCase()===email || String(loc.claimed_by_email||"").toLowerCase()===email)) return NextResponse.json({ success:false,error:"Forbidden" },{status:403});
  }
  const from = getRangeStart(range);
  let eq = supabaseAdmin.from("analytics_events").select("*");
  let oq = supabaseAdmin.from("outings").select("*");
  let lq = supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (from) { eq = eq.gte("created_at", from); oq = oq.gte("created_at", from); }
  const [{data:events=[]},{data:outings=[]},{data:location}] = await Promise.all([eq,oq,lq]);
  const ev=(events as AnalyticsEventRow[]).filter(e=>getEventLocationId(e)===locationId);
  const out=(outings as OutingRow[]).filter(o=>getOutingLocationId(o)===locationId);
  const summary = buildAnalyticsSummary(ev,out);
  return NextResponse.json({ success:true, range, plan: location?.plan || (location?.is_pro?"pro":"standard"), location, summary, daily: buildDailySeries(ev), funnel: buildFunnel(summary), insights: buildInsights(summary), recent_activity: buildRecentActivity(ev) });
}
