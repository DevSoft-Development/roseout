import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

type ActivityEvent = {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_type: string;
  event_name: string | null;
  page_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AnalyticsEvent = {
  id: string;
  item_id: string | null;
  item_type: string | null;
  event_type: string | null;
  page_path: string | null;
  created_at: string;
};

type SearchLog = {
  id?: string | null;
  query: string | null;
  created_at: string;
};

type ConversionRow = {
  id: string;
  user_id?: string | null;
  status?: string | null;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  subscription_status: string | null;
  role: string | null;
};

type RestaurantProfile = {
  id: string;
  restaurant_name?: string | null;
  name?: string | null;
  click_count?: number | null;
  view_count?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type SessionStat = {
  session_id: string | null;
  user_id: string | null;
  user: UserProfile | null;
  current_page: string | null;
  last_event_type: string | null;
  last_event_name: string | null;
  last_seen: string;
  events_count: number;
  events: ActivityEvent[];
};

type UserStat = {
  user_id: string;
  user: UserProfile | null;
  events_count: number;
  searches: number;
  clicks: number;
  conversions: number;
  saved_plan_clicks: number;
  last_seen: string;
  likely_to_convert_score: number;
};

type LiveSummary = {
  searches: number;
  clicks: number;
  views: number;
  saved_plans: number;
  reservations: number;
  sources: {
    user_activity_events: number;
    analytics_events: number;
    search_logs: number;
    saved_plans: number;
    location_reservations: number;
  };
};

type RestaurantStat = {
  restaurant_id: string;
  restaurant_name: string;
  clicks: number;
  conversions: number;
  last_clicked: string;
};

type TopPage = {
  page: string;
  count: number;
};

function emptyQuery<T>() {
  return { data: [] as T[], error: null };
}

function toMetadata(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isSearchEvent(eventType: string | null | undefined) {
  return Boolean(eventType && eventType.toLowerCase().includes("search"));
}

function isClickEvent(eventType: string | null | undefined) {
  if (!eventType) return false;

  return (
    eventType === "click" ||
    eventType === "button_click" ||
    eventType === "restaurant_click" ||
    eventType === "activity_click" ||
    eventType === "plan_click" ||
    eventType.toLowerCase().includes("click")
  );
}

function isConversionEvent(eventType: string | null | undefined) {
  if (!eventType) return false;

  return ["conversion", "reservation", "booking", "checkout"].some((signal) =>
    eventType.toLowerCase().includes(signal)
  );
}
function makeSyntheticEvent({
  id,
  eventType,
  eventName,
  pagePath,
  metadata,
  createdAt,
  userId = null,
}: {
  id: string;
  eventType: string;
  eventName: string;
  pagePath: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  userId?: string | null;
}): ActivityEvent {
  return {
    id,
    user_id: userId,
    session_id: null,
    event_type: eventType,
    event_name: eventName,
    page_path: pagePath,
    metadata,
    created_at: createdAt,
  };
}

export async function GET() {
  const { error, supabase } = await requireAdminApiRole([
    "superuser",
    "admin",
    "viewer",
  ]);

  if (error) return error;

  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

    const [
      activityResult,
      analyticsResult,
      searchResult,
      savedPlansResult,
      reservationsResult,
    ] = await Promise.all([
      supabase
        .from("user_activity_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("analytics_events")
        .select("id,item_id,item_type,event_type,page_path,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("search_logs")
        .select("id,query,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("saved_plans")
        .select("id,user_id,title,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("location_reservations")
        .select("id,user_id,status,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (activityResult.error) {
      return Response.json(
        { error: activityResult.error.message },
        { status: 500 }
      );
    }

    const safeEvents = (activityResult.data || []) as ActivityEvent[];
    const analyticsEvents = analyticsResult.error
      ? []
      : ((analyticsResult.data || []) as AnalyticsEvent[]);
    const searchLogs = searchResult.error
      ? []
      : ((searchResult.data || []) as SearchLog[]);
    const savedPlans = savedPlansResult.error
      ? []
      : ((savedPlansResult.data || []) as ConversionRow[]);
    const reservations = reservationsResult.error
      ? []
      : ((reservationsResult.data || []) as ConversionRow[]);

    const userIds = Array.from(
      new Set(
        [
          ...safeEvents.map((event) => event.user_id),
          ...savedPlans.map((plan) => plan.user_id || null),
          ...reservations.map((reservation) => reservation.user_id || null),
        ].filter(Boolean)
      )
    );

    const { data: users } = userIds.length
      ? await supabase
          .from("users")
          .select("id,email,full_name,subscription_status,role")
          .in("id", userIds)
      : emptyQuery<UserProfile>();

    const userMap = new Map(
      ((users || []) as UserProfile[]).map((user) => [user.id, user])
    );

    const restaurantIds = Array.from(
      new Set(
        analyticsEvents
          .filter(
            (event) => event.item_type === "restaurant" && event.item_id
          )
          .map((event) => String(event.item_id))
      )
    );

    const { data: restaurants } = restaurantIds.length
      ? await supabase
          .from("restaurants")
          .select("id,restaurant_name,name,click_count,view_count,updated_at,created_at")
          .in("id", restaurantIds)
      : emptyQuery<RestaurantProfile>();

    const { data: topRestaurantFallback } = await supabase
      .from("restaurants")
      .select("id,restaurant_name,name,click_count,view_count,updated_at,created_at")
      .order("click_count", { ascending: false })
      .limit(10);

    const restaurantNameMap = new Map(
      ((restaurants || []) as RestaurantProfile[]).map((restaurant) => [
        String(restaurant.id),
        restaurant.restaurant_name || restaurant.name || "Unknown Restaurant",
      ])
    );

    const sessionMap = new Map<string, SessionStat>();
    const userStats = new Map<string, UserStat>();
    const restaurantStats = new Map<string, RestaurantStat>();
    const pageStats = new Map<string, number>();
    const unifiedEvents: ActivityEvent[] = [...safeEvents];

    function recordPage(event: ActivityEvent) {
      const page = event.page_path || "Unknown page";
      pageStats.set(page, (pageStats.get(page) || 0) + 1);
    }

    function recordSession(event: ActivityEvent) {
      const metadata = toMetadata(event.metadata);
      const sessionKey = event.session_id || event.user_id || event.id;
      const profile = event.user_id ? userMap.get(event.user_id) : null;
      let session = sessionMap.get(sessionKey);

      if (!session) {
        session = {
          session_id: event.session_id,
          user_id: event.user_id,
          user: profile || null,
          current_page: event.page_path,
          last_event_type: event.event_type,
          last_event_name: event.event_name,
          last_seen: event.created_at,
          events_count: 0,
          events: [],
        };
        sessionMap.set(sessionKey, session);
      }

      session.events_count += 1;

      if (new Date(event.created_at) > new Date(session.last_seen)) {
        session.current_page = event.page_path;
        session.last_event_type = event.event_type;
        session.last_event_name = event.event_name;
        session.last_seen = event.created_at;
      }

      if (session.events.length < 10) {
        session.events.push({ ...event, metadata });
      }
    }

    function recordUserStat(event: ActivityEvent) {
      if (!event.user_id) return;

      const eventType = event.event_type || "activity";
      const profile = userMap.get(event.user_id) || null;
      let stat = userStats.get(event.user_id);

      if (!stat) {
        stat = {
          user_id: event.user_id,
          user: profile,
          events_count: 0,
          searches: 0,
          clicks: 0,
          conversions: 0,
          saved_plan_clicks: 0,
          last_seen: event.created_at,
          likely_to_convert_score: 0,
        };
        userStats.set(event.user_id, stat);
      }

      stat.events_count += 1;

      if (isSearchEvent(eventType)) stat.searches += 1;
      if (isClickEvent(eventType)) stat.clicks += 1;
      if (eventType === "plan_click") stat.saved_plan_clicks += 1;
      if (isConversionEvent(eventType)) stat.conversions += 1;

      if (new Date(event.created_at) > new Date(stat.last_seen)) {
        stat.last_seen = event.created_at;
      }
    }

    function recordRestaurantStat(event: ActivityEvent) {
      const eventType = event.event_type || "activity";
      const metadata = toMetadata(event.metadata);
      const restaurantId =
        metadata.restaurant_id ||
        metadata.restaurantId ||
        metadata.location_id ||
        metadata.id;

      if (!restaurantId || (!isClickEvent(eventType) && !isConversionEvent(eventType))) {
        return;
      }

      const key = String(restaurantId);
      const restaurantName = String(
        metadata.restaurant_name ||
          metadata.restaurantName ||
          metadata.location_name ||
          metadata.name ||
          restaurantNameMap.get(key) ||
          "Unknown Restaurant"
      );
      let stat = restaurantStats.get(key);

      if (!stat) {
        stat = {
          restaurant_id: key,
          restaurant_name: restaurantName,
          clicks: 0,
          conversions: 0,
          last_clicked: event.created_at,
        };
        restaurantStats.set(key, stat);
      }

      if (isClickEvent(eventType)) stat.clicks += 1;
      if (isConversionEvent(eventType)) stat.conversions += 1;

      if (new Date(event.created_at) > new Date(stat.last_clicked)) {
        stat.last_clicked = event.created_at;
      }
    }

    function recordEvent(event: ActivityEvent) {
      recordPage(event);
      recordSession(event);
      recordUserStat(event);
      recordRestaurantStat(event);
    }

    function addSyntheticEvent(event: ActivityEvent) {
      unifiedEvents.push(event);
      recordEvent(event);
    }

    let activityConversions = 0;
    let activitySearches = 0;
    let activityClicks = 0;

    for (const event of safeEvents) {
      const eventType = event.event_type || "activity";

      recordEvent(event);

      if (isSearchEvent(eventType)) activitySearches += 1;
      if (isClickEvent(eventType)) activityClicks += 1;
      if (isConversionEvent(eventType)) activityConversions += 1;
    }

    let analyticsClicks = 0;
    let analyticsViews = 0;

    for (const event of analyticsEvents) {
      const itemType = event.item_type || "item";
      const itemId = event.item_id ? String(event.item_id) : "unknown";
      const eventType = event.event_type || "analytics";
      const eventName = `${itemType} ${eventType}`;

      if (eventType === "view") analyticsViews += 1;
      if (isClickEvent(eventType)) analyticsClicks += 1;

      addSyntheticEvent(
        makeSyntheticEvent({
          id: `analytics-${event.id}`,
          eventType:
            itemType === "restaurant" && isClickEvent(eventType)
              ? "restaurant_click"
              : eventType,
          eventName,
          pagePath: event.page_path,
          metadata: {
            item_id: itemId,
            item_type: itemType,
          },
          createdAt: event.created_at,
        })
      );

      if (itemType === "restaurant" && isClickEvent(eventType) && itemId) {
        let stat = restaurantStats.get(itemId);

        if (!stat) {
          stat = {
            restaurant_id: itemId,
            restaurant_name:
              restaurantNameMap.get(itemId) || "Unknown Restaurant",
            clicks: 0,
            conversions: 0,
            last_clicked: event.created_at,
          };
          restaurantStats.set(itemId, stat);
        }

        stat.clicks += 1;

        const restaurantName = restaurantNameMap.get(itemId);

        if (restaurantName) {
          stat.restaurant_name = restaurantName;
        }

        if (new Date(event.created_at) > new Date(stat.last_clicked)) {
          stat.last_clicked = event.created_at;
        }
      }
    }

    for (const log of searchLogs) {
      addSyntheticEvent(
        makeSyntheticEvent({
          id: `search-${log.id || log.created_at}-${log.query || "query"}`,
          eventType: "search",
          eventName: log.query || "Search submitted",
          pagePath: "/create",
          metadata: { query: log.query },
          createdAt: log.created_at,
        })
      );
    }

    for (const plan of savedPlans) {
      addSyntheticEvent(
        makeSyntheticEvent({
          id: `saved-plan-${plan.id}`,
          eventType: "conversion",
          eventName: "Saved Plan Created",
          pagePath: "/user/saved",
          metadata: { plan_id: plan.id },
          createdAt: plan.created_at,
          userId: plan.user_id || null,
        })
      );
    }

    for (const reservation of reservations) {
      addSyntheticEvent(
        makeSyntheticEvent({
          id: `reservation-${reservation.id}`,
          eventType: "conversion",
          eventName: "Reservation Created",
          pagePath: "/reserve",
          metadata: {
            reservation_id: reservation.id,
            status: reservation.status || null,
          },
          createdAt: reservation.created_at,
          userId: reservation.user_id || null,
        })
      );
    }

    for (const restaurant of (topRestaurantFallback || []) as RestaurantProfile[]) {
      const key = String(restaurant.id);
      const existing = restaurantStats.get(key);
      const clicks = Number(restaurant.click_count || 0);
      const lastClicked =
        restaurant.updated_at || restaurant.created_at || new Date().toISOString();

      if (!existing) {
        restaurantStats.set(key, {
          restaurant_id: key,
          restaurant_name:
            restaurant.restaurant_name || restaurant.name || "Unknown Restaurant",
          clicks,
          conversions: 0,
          last_clicked: lastClicked,
        });
      } else if (existing.clicks === 0 && clicks > 0) {
        existing.clicks = clicks;
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

    const conversionCount =
      activityConversions + savedPlans.length + reservations.length;
    const searchCount = activitySearches + searchLogs.length;
    const clickCount = activityClicks + analyticsClicks;
    const viewCount = analyticsViews;
    const totalEvents = unifiedEvents.length;
    const summary: LiveSummary = {
      searches: searchCount,
      clicks: clickCount,
      views: viewCount,
      saved_plans: savedPlans.length,
      reservations: reservations.length,
      sources: {
        user_activity_events: safeEvents.length,
        analytics_events: analyticsEvents.length,
        search_logs: searchLogs.length,
        saved_plans: savedPlans.length,
        location_reservations: reservations.length,
      },
    };

    const topPages: TopPage[] = Array.from(pageStats.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const scoredUsers = Array.from(userStats.values()).map((stat) => {
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
    });

    const mostActiveUsers = [...scoredUsers]
      .sort((a, b) => b.events_count - a.events_count)
      .slice(0, 10);

    const likelyToConvert = [...scoredUsers]
      .filter((user) => user.likely_to_convert_score > 0)
      .sort(
        (a, b) => b.likely_to_convert_score - a.likely_to_convert_score
      )
      .slice(0, 8);

    const mostClickedRestaurants = Array.from(restaurantStats.values())
      .sort(
        (a, b) => b.clicks + b.conversions * 3 - (a.clicks + a.conversions * 3)
      )
      .slice(0, 10);

    const conversionDenominator = clickCount + searchCount;
    const conversionRate =
      conversionDenominator > 0
        ? Math.round((conversionCount / conversionDenominator) * 100)
        : 0;

    return Response.json({
      sessions,
      live_now: liveNow.length,
      total_sessions: sessions.length,
      total_events: totalEvents,
      top_pages: topPages,
      events: unifiedEvents.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      most_active_users: mostActiveUsers,
      most_clicked_restaurants: mostClickedRestaurants,
      likely_to_convert: likelyToConvert,
      conversions: conversionCount,
      conversion_rate: conversionRate,
      ...summary,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
