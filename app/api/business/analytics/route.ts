import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { average, normalizeEventName, outingLocationId, rangeToStartIso, type AnalyticsEventRow, type AnalyticsRange, type OutingRow } from "@/lib/analytics/new-business-analytics";

async function canViewLocation(user: any, locationId: string) {
  const { data } = await supabaseAdmin.from("locations").select("id, owner_user_id, owner_email, claimed_by_email").eq("id", locationId).maybeSingle();
  if (!data) return false;
  const email = String(user?.email || "").toLowerCase();
  return data.owner_user_id === user.id || String(data.owner_email || "").toLowerCase() === email || String(data.claimed_by_email || "").toLowerCase() === email;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("location_id") || "";
  const range = (searchParams.get("range") || "30d") as AnalyticsRange;
  if (!locationId) return NextResponse.json({ success: false, error: "Missing location_id" }, { status: 400 });
  if (!(await canViewLocation(user, locationId))) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const fromIso = rangeToStartIso(range);
  let eventsQ = supabaseAdmin.from("analytics_events").select("id,event_name,event_type,location_id,outing_id,user_id,source,page_path,metadata,created_at").eq("location_id", locationId);
  let outingsQ = supabaseAdmin.from("outings").select("id,location_id,source_location_id,status,reservation_clicked_at,call_clicked_at,completed_at,rating,matched_vibe,would_go_again,created_at").or(`location_id.eq.${locationId},source_location_id.eq.${locationId}`);
  if (fromIso) {
    eventsQ = eventsQ.gte("created_at", fromIso);
    outingsQ = outingsQ.gte("created_at", fromIso);
  }

  const [{ data: events }, { data: outings }] = await Promise.all([eventsQ, outingsQ]);
  const ev = (events ?? []) as AnalyticsEventRow[];
  const out = (outings ?? []).filter((o) => outingLocationId(o as OutingRow) === locationId) as OutingRow[];

  const summary = {
    profile_views: ev.filter((e) => ["profile_view", "location_profile_view", "profile_viewed"].includes(normalizeEventName(e))).length,
    search_appearances: ev.filter((e) => ["search_appearance", "location_impression", "search_match"].includes(normalizeEventName(e))).length,
    search_clicks: ev.filter((e) => ["search_click", "location_click", "restaurant_click", "activity_click"].includes(normalizeEventName(e))).length,
    reservation_starts: ev.filter((e) => ["reserve_clicked", "reservation_clicked", "external_reservation_clicked"].includes(normalizeEventName(e))).length,
    reservation_completions: out.filter((o) => o.status === "completed" || !!o.completed_at).length,
    phone_call_clicks: ev.filter((e) => ["call_clicked", "phone_click", "phone_clicked"].includes(normalizeEventName(e))).length,
    average_outing_rating: average(out.filter((o) => o.status === "completed" || !!o.completed_at).map((o) => o.rating)),
  };

  return NextResponse.json({
    success: true,
    summary,
    daily: [],
    hourly: [],
    heatmap: [],
    customer_insights: {},
    recent_activity: ev.slice(-30).reverse(),
  });
}
