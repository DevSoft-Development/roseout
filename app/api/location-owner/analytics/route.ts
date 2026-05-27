import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { average, normalizeEventName, outingLocationId, rangeToStartIso, type AnalyticsEventRow, type AnalyticsLocationRow, type AnalyticsRange, type OutingRow } from "@/lib/analytics/new-business-analytics";

type OwnerSummary = {
  reserve_clicks: number;
  call_clicks: number;
  outing_starts: number;
  completed_outings: number;
  completion_rate: number;
  average_rating: number;
  matched_vibe_percentage: number;
  would_go_again_percentage: number;
};

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const dateRange = (new URL(req.url).searchParams.get("date_range") ?? "30d") as AnalyticsRange;
    const fromIso = rangeToStartIso(dateRange);

    const ownerAccess = await getLocationOwnerAccess(userId);
    const locationIds = ownerAccess.ownedLocationIds;

    const { data: locations } = locationIds.length
      ? await supabase.from("locations").select("id,name,restaurant_name,activity_name,city,state").in("id", locationIds)
      : { data: [] as AnalyticsLocationRow[] };

    if (!locationIds.length) {
      const empty: OwnerSummary = { reserve_clicks: 0, call_clicks: 0, outing_starts: 0, completed_outings: 0, completion_rate: 0, average_rating: 0, matched_vibe_percentage: 0, would_go_again_percentage: 0 };
      return NextResponse.json({ ok: true, date_range: dateRange, summary: empty, locations: [], recent_activity: [] });
    }

    let eventsQ = supabase.from("analytics_events").select("id,event_name,event_type,location_id,outing_id,user_id,source,page_path,metadata,created_at").in("location_id", locationIds);
    let outingsQ = supabase.from("outings").select("id,location_id,source_location_id,status,reservation_clicked_at,call_clicked_at,completed_at,rating,matched_vibe,would_go_again,created_at").or(`location_id.in.(${locationIds.join(",")}),source_location_id.in.(${locationIds.join(",")})`);
    if (fromIso) {
      eventsQ = eventsQ.gte("created_at", fromIso);
      outingsQ = outingsQ.gte("created_at", fromIso);
    }

    const [{ data: events }, { data: outings }] = await Promise.all([eventsQ, outingsQ]);
    const ev = (events ?? []) as AnalyticsEventRow[];
    const out = (outings ?? []).filter((o) => locationIds.includes(outingLocationId(o as OutingRow) || "")) as OutingRow[];

    const reserveClicks = ev.filter((e) => ["reserve_clicked", "reservation_clicked", "external_reservation_clicked"].includes(normalizeEventName(e))).length;
    const callClicks = ev.filter((e) => ["call_clicked", "phone_click", "phone_clicked"].includes(normalizeEventName(e))).length;
    const outingStarts = ev.filter((e) => normalizeEventName(e) === "outing_started").length;
    const completed = out.filter((o) => o.status === "completed" || !!o.completed_at);

    const summary: OwnerSummary = {
      reserve_clicks: reserveClicks,
      call_clicks: callClicks,
      outing_starts: outingStarts,
      completed_outings: completed.length,
      completion_rate: outingStarts > 0 ? completed.length / outingStarts : 0,
      average_rating: average(completed.map((o) => o.rating)),
      matched_vibe_percentage: completed.length ? completed.filter((o) => o.matched_vibe === true).length / completed.length : 0,
      would_go_again_percentage: completed.length ? completed.filter((o) => o.would_go_again === true).length / completed.length : 0,
    };

    return NextResponse.json({ ok: true, date_range: dateRange, summary, locations: locations ?? [], recent_activity: ev.slice(-25).reverse() });
  } catch (error) {
    console.error("THEOUTHAVEN_OWNER_ANALYTICS_FAILED", error);
    return NextResponse.json({ ok: false, error: "owner_analytics_failed" }, { status: 500 });
  }
}
