import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AnalyticsRange, buildAnalyticsSummary, buildDailySeries, buildFunnel, buildInsights, buildRecentActivity, getEventLocationId, getOutingLocationId, getRangeStart } from "@/lib/analytics/new-business-analytics";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const range = (params.get("range") || "30d") as AnalyticsRange;
  const locationId = params.get("location_id") || "";
  if (!locationId) return NextResponse.json({ success:false,error:"Missing location_id" },{status:400});
  const { data: location } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  const email = String(user.email || "").toLowerCase();
  if (!location || !(location.owner_user_id===user.id || String(location.owner_email||"").toLowerCase()===email || String(location.claimed_by_email||"").toLowerCase()===email)) return NextResponse.json({ success:false,error:"forbidden" },{status:403});
  const from = getRangeStart(range);
  let eq = supabaseAdmin.from("analytics_events").select("*"); let oq = supabaseAdmin.from("outings").select("*"); if(from){eq=eq.gte("created_at",from);oq=oq.gte("created_at",from);} const [{data:events=[]},{data:outings=[]}] = await Promise.all([eq,oq]);
  const ev=(events as any[]).filter(e=>getEventLocationId(e)===locationId); const out=(outings as any[]).filter(o=>getOutingLocationId(o)===locationId);
  const summary=buildAnalyticsSummary(ev,out);
  return NextResponse.json({ success:true, range, plan: location.plan || (location.is_pro?"pro":"standard"), location, summary, daily: buildDailySeries(ev), funnel: buildFunnel(summary), insights: buildInsights(summary), recent_activity: buildRecentActivity(ev) });
}
