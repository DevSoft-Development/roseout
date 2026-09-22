import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

type RankingSignal = {
  location_id: string;
  location_type: "restaurants" | "activities";
  location_name: string;
  impressions: number;
  detail_views: number;
  website_clicks: number;
  directions_clicks: number;
  reservation_clicks: number;
  saves: number;
  searches_matched: number;
  theouthaven_score: number;
  trend_score: number;
  conversion_score: number;
  ranking_badge: string;
  last_activity_at: string | null;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getBadge(score: number, trendScore: number, conversionScore: number) {
  if (score >= 90) return "Top 10%";
  if (trendScore >= 75) return "Trending";
  if (conversionScore >= 70) return "High Intent";
  if (score >= 75) return "Popular";
  if (conversionScore >= 45 && score < 65) return "New Find";
  return "Standard";
}

export async function POST() {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoEdit);

  if (error) return error;

  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

    const { data: events, error: eventsError } = await supabase
      .from("user_activity_events")
      .select("event_type,event_name,metadata,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (eventsError) {
      return Response.json({ error: eventsError.message }, { status: 500 });
    }

    const map = new Map<string, RankingSignal>();

    for (const event of events || []) {
      const metadata = event.metadata || {};

      const locationId =
        metadata.location_id ||
        metadata.restaurant_id ||
        metadata.activity_id ||
        null;

      if (!locationId) continue;

      const locationType =
        metadata.location_type ||
        (metadata.activity_id ? "activities" : "restaurants");

      const normalizedType =
        locationType === "activities" || locationType === "activity"
          ? "activities"
          : "restaurants";

      const locationName =
        metadata.location_name ||
        metadata.restaurant_name ||
        metadata.activity_name ||
        "Unknown Location";

      const key = `${normalizedType}:${locationId}`;

      if (!map.has(key)) {
        map.set(key, {
          location_id: locationId,
          location_type: normalizedType,
          location_name: locationName,
          impressions: 0,
          detail_views: 0,
          website_clicks: 0,
          directions_clicks: 0,
          reservation_clicks: 0,
          saves: 0,
          searches_matched: 0,
          theouthaven_score: 0,
          trend_score: 0,
          conversion_score: 0,
          ranking_badge: "Standard",
          last_activity_at: event.created_at,
        });
      }

      const signal = map.get(key)!;

      if (
        !signal.last_activity_at ||
        new Date(event.created_at) > new Date(signal.last_activity_at)
      ) {
        signal.last_activity_at = event.created_at;
      }

      if (event.event_type === "location_impression") {
        signal.impressions += 1;
      }

      if (
        event.event_type === "restaurant_click" ||
        event.event_type === "activity_click"
      ) {
        if (
          event.event_name?.toLowerCase().includes("viewed") ||
          metadata.source === "restaurant_card" ||
          metadata.source === "activity_card"
        ) {
          signal.detail_views += 1;
        } else {
          signal.website_clicks += 1;
        }
      }

      if (event.event_type === "map_click") {
        signal.directions_clicks += 1;
      }

      if (event.event_type === "conversion") {
        signal.reservation_clicks += 1;
      }

      if (event.event_type === "save" || event.event_type === "plan_click") {
        signal.saves += 1;
      }

      if (event.event_type === "search_match") {
        signal.searches_matched += 1;
      }
    }

    const rows = Array.from(map.values()).map((signal) => {
      const totalIntent =
        signal.detail_views +
        signal.website_clicks +
        signal.directions_clicks +
        signal.reservation_clicks +
        signal.saves;

      const conversionRate =
        signal.detail_views > 0
          ? signal.reservation_clicks / signal.detail_views
          : signal.reservation_clicks > 0
            ? 1
            : 0;

      const engagementScore =
        signal.impressions > 0
          ? (totalIntent / signal.impressions) * 45
          : totalIntent * 4;

      const actionScore =
        signal.detail_views * 4 +
        signal.website_clicks * 8 +
        signal.directions_clicks * 10 +
        signal.reservation_clicks * 18 +
        signal.saves * 12 +
        signal.searches_matched * 3;

      const conversionScore = clampScore(conversionRate * 100);

      const hoursSinceLastActivity = signal.last_activity_at
        ? Math.max(
            1,
            (Date.now() - new Date(signal.last_activity_at).getTime()) /
              1000 /
              60 /
              60
          )
        : 999;

      const velocityScore = clampScore(
        (signal.detail_views * 3 +
          signal.website_clicks * 6 +
          signal.directions_clicks * 8 +
          signal.reservation_clicks * 15) /
          Math.sqrt(hoursSinceLastActivity)
      );

      const theouthavenScore = clampScore(
        35 + engagementScore + actionScore * 0.8 + conversionScore * 0.25
      );

      const trendScore = clampScore(velocityScore);

      const badge = getBadge(theouthavenScore, trendScore, conversionScore);

      return {
        ...signal,
        theouthaven_score: theouthavenScore,
        trend_score: trendScore,
        conversion_score: conversionScore,
        ranking_badge: badge,
        updated_at: new Date().toISOString(),
      };
    });

    if (rows.length === 0) {
      return Response.json({
        success: true,
        updated: 0,
        message: "No ranking events found.",
      });
    }

    const { error: upsertError } = await supabase
      .from("location_ranking_signals")
      .upsert(rows, {
        onConflict: "location_id,location_type",
      });

    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 500 });
    }

    const restaurants = rows.filter((row) => row.location_type === "restaurants");
    const activities = rows.filter((row) => row.location_type === "activities");

    for (const row of restaurants) {
      await supabase
        .from("restaurants")
        .update({
          theouthaven_score: row.theouthaven_score,
          trend_score: row.trend_score,
          conversion_score: row.conversion_score,
          ranking_badge: row.ranking_badge,
        })
        .eq("id", row.location_id);
    }

    for (const row of activities) {
      await supabase
        .from("activities")
        .update({
          theouthaven_score: row.theouthaven_score,
          trend_score: row.trend_score,
          conversion_score: row.conversion_score,
          ranking_badge: row.ranking_badge,
        })
        .eq("id", row.location_id);
    }

    return Response.json({
      success: true,
      updated: rows.length,
      restaurants: restaurants.length,
      activities: activities.length,
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to recalculate rankings." },
      { status: 500 }
    );
  }
}
