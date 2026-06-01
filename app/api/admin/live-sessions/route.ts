import { requireAdminApiRole } from "@/lib/admin-api-auth";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.logs);

  if (error) return error;

  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

    const { data: events, error: fetchError } = await supabase
      .from("user_activity_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (fetchError) {
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    const safeEvents = events || [];

    const userIds = Array.from(
      new Set(safeEvents.map((e) => e.user_id).filter(Boolean))
    );

    const { data: users } = userIds.length
      ? await supabase
          .from("users")
          .select("id,email,full_name,subscription_status,role")
          .in("id", userIds)
      : { data: [] };

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    const sessionMap = new Map<string, any>();
    const userStats = new Map<string, any>();
    const restaurantStats = new Map<string, any>();

    let conversions = 0;

    for (const event of safeEvents) {
      const sessionKey = event.session_id || event.user_id || event.id;
      const profile = event.user_id ? userMap.get(event.user_id) : null;

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          session_id: event.session_id,
          user_id: event.user_id,
          user: profile || null,
          current_page: event.page_path,
          last_event_type: event.event_type,
          last_event_name: event.event_name,
          last_seen: event.created_at,
          events_count: 0,
          events: [],
        });
      }

      const session = sessionMap.get(sessionKey);
      session.events_count += 1;

      if (session.events.length < 10) {
        session.events.push(event);
      }

      if (event.user_id) {
        if (!userStats.has(event.user_id)) {
          userStats.set(event.user_id, {
            user_id: event.user_id,
            user: profile || null,
            events_count: 0,
            searches: 0,
            clicks: 0,
            conversions: 0,
            saved_plan_clicks: 0,
            last_seen: event.created_at,
            likely_to_convert_score: 0,
          });
        }

        const stat = userStats.get(event.user_id);
        stat.events_count += 1;

        if (event.event_type === "search") stat.searches += 1;
        if (
          event.event_type === "button_click" ||
          event.event_type === "restaurant_click" ||
          event.event_type === "plan_click"
        ) {
          stat.clicks += 1;
        }
        if (event.event_type === "plan_click") stat.saved_plan_clicks += 1;
        if (event.event_type === "conversion") {
          stat.conversions += 1;
          conversions += 1;
        }

        if (new Date(event.created_at) > new Date(stat.last_seen)) {
          stat.last_seen = event.created_at;
        }
      }

      const restaurantId =
        event.metadata?.restaurant_id ||
        event.metadata?.restaurantId ||
        event.metadata?.id;

      const restaurantName =
        event.metadata?.name ||
        event.metadata?.restaurant_name ||
        event.metadata?.restaurantName ||
        "Unknown Restaurant";

      if (
        restaurantId &&
        ["restaurant_click", "conversion"].includes(event.event_type)
      ) {
        if (!restaurantStats.has(restaurantId)) {
          restaurantStats.set(restaurantId, {
            restaurant_id: restaurantId,
            restaurant_name: restaurantName,
            clicks: 0,
            conversions: 0,
            last_clicked: event.created_at,
          });
        }

        const stat = restaurantStats.get(restaurantId);

        if (event.event_type === "restaurant_click") stat.clicks += 1;
        if (event.event_type === "conversion") stat.conversions += 1;

        if (new Date(event.created_at) > new Date(stat.last_clicked)) {
          stat.last_clicked = event.created_at;
        }
      }
    }

    const sessions = Array.from(sessionMap.values()).sort(
      (a, b) =>
        new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
    );

    const liveNow = sessions.filter(
      (session) =>
        Date.now() - new Date(session.last_seen).getTime() <= 1000 * 60 * 5
    );

    const mostActiveUsers = Array.from(userStats.values())
      .map((stat) => {
        const score =
          stat.searches * 15 +
          stat.saved_plan_clicks * 12 +
          stat.clicks * 6 +
          stat.conversions * 25 +
          stat.events_count * 2;

        return {
          ...stat,
          likely_to_convert_score: Math.min(score, 100),
        };
      })
      .sort((a, b) => b.events_count - a.events_count)
      .slice(0, 10);

    const likelyToConvert = [...mostActiveUsers]
      .sort(
        (a, b) => b.likely_to_convert_score - a.likely_to_convert_score
      )
      .slice(0, 8);

    const mostClickedRestaurants = Array.from(restaurantStats.values())
      .sort((a, b) => b.clicks + b.conversions * 3 - (a.clicks + a.conversions * 3))
      .slice(0, 10);

    const conversionRate =
      safeEvents.length > 0
        ? Math.round((conversions / safeEvents.length) * 100)
        : 0;

    return Response.json({
      sessions,
      live_now: liveNow.length,
      total_sessions: sessions.length,
      events: safeEvents,
      most_active_users: mostActiveUsers,
      most_clicked_restaurants: mostClickedRestaurants,
      likely_to_convert: likelyToConvert,
      conversions,
      conversion_rate: conversionRate,
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
