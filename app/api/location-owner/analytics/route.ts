import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const RANGE_TO_DAYS: Record<string, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get("date_range") ?? "30d";
    const days = RANGE_TO_DAYS[dateRange] ?? 30;
    const fromIso = days ? new Date(Date.now() - days * 86400000).toISOString() : null;

    const { data: locations } = await supabase.from("locations").select("id,name").eq("owner_user_id", userId);
    const locationIds = (locations ?? []).map((row) => row.id);
    if (locationIds.length === 0) {
      return NextResponse.json({ ok: true, date_range: dateRange, summary: { reserve_clicks: 0, call_clicks: 0, outing_starts: 0, completed_outings: 0, completion_rate: 0, average_rating: 0, matched_vibe_percentage: 0, would_go_again_percentage: 0 }, locations: [], recent_activity: [] });
    }

    let eventQ = supabase.from("analytics_events").select("event_name,location_id,created_at").in("location_id", locationIds);
    let outingQ = supabase.from("outings").select("id,status,rating,matched_vibe,would_go_again,source_location_id,location_id,created_at").or(`location_id.in.(${locationIds.join(",")}),source_location_id.in.(${locationIds.join(",")})`);
    if (fromIso) { eventQ = eventQ.gte("created_at", fromIso); outingQ = outingQ.gte("created_at", fromIso); }
    const [{ data: events }, { data: outings }] = await Promise.all([eventQ, outingQ]);

    const reserveClicks = (events ?? []).filter((e) => e.event_name === "reserve_clicked").length;
    const callClicks = (events ?? []).filter((e) => e.event_name === "call_clicked").length;
    const outingStarts = (events ?? []).filter((e) => e.event_name === "outing_started").length;
    const completed = (outings ?? []).filter((o) => o.status === "completed");
    const ratings = completed.map((o) => Number(o.rating)).filter((v) => Number.isFinite(v) && v > 0);

    console.info("THEOUTHAVEN_OWNER_ANALYTICS_LOADED", { user_id: userId, location_count: locationIds.length, date_range: dateRange });
    return NextResponse.json({
      ok: true,
      date_range: dateRange,
      summary: {
        reserve_clicks: reserveClicks,
        call_clicks: callClicks,
        outing_starts: outingStarts,
        completed_outings: completed.length,
        completion_rate: outingStarts > 0 ? completed.length / outingStarts : 0,
        average_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
        matched_vibe_percentage: completed.length > 0 ? completed.filter((o) => o.matched_vibe === true).length / completed.length : 0,
        would_go_again_percentage: completed.length > 0 ? completed.filter((o) => o.would_go_again === true).length / completed.length : 0,
      },
      locations: (locations ?? []).map((loc) => ({ location_id: loc.id, name: loc.name })),
      recent_activity: (events ?? []).slice(0, 20),
    });
  } catch {
    console.error("THEOUTHAVEN_OWNER_ANALYTICS_FAILED");
    return NextResponse.json({ ok: false, error: "owner_analytics_failed" }, { status: 500 });
  }
}
