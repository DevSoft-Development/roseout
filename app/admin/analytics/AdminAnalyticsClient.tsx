"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EventItem = {
  id: string;
  user_id: string | null;
  session_id: string | null;
  event_type: string;
  event_name: string | null;
  page_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type LiveSession = {
  session_id: string | null;
  user_id: string | null;
  user: {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
    subscription_status: string | null;
  } | null;
  current_page: string | null;
  last_event_type: string | null;
  last_event_name: string | null;
  last_seen: string;
  events_count: number;
  events: EventItem[];
};

type ActiveUser = {
  user_id: string;
  user: {
    email: string | null;
    full_name: string | null;
    role: string | null;
    subscription_status: string | null;
  } | null;
  events_count: number;
  searches: number;
  clicks: number;
  conversions: number;
  saved_plan_clicks: number;
  last_seen: string;
  likely_to_convert_score: number;
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

export default function AdminAnalyticsClient() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [liveNow, setLiveNow] = useState(0);
  const [conversions, setConversions] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [searches, setSearches] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [views, setViews] = useState(0);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [mostActiveUsers, setMostActiveUsers] = useState<ActiveUser[]>([]);
  const [likelyToConvert, setLikelyToConvert] = useState<ActiveUser[]>([]);
  const [mostClickedRestaurants, setMostClickedRestaurants] = useState<
    RestaurantStat[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(
    null
  );

  const loadSessions = useCallback(async function loadSessions() {
    try {
      const res = await fetch("/api/admin/analytics/live", {
        cache: "no-store",
      });

      const data = await res.json();

      setSessions(data.sessions || []);
      setEvents(data.events || []);
      setLiveNow(data.live_now || 0);
      setConversions(data.conversions || 0);
      setConversionRate(data.conversion_rate || 0);
      setTotalSessions(data.total_sessions || data.sessions?.length || 0);
      setTotalEvents(data.total_events || data.events?.length || 0);
      setSearches(data.searches || 0);
      setClicks(data.clicks || 0);
      setViews(data.views || 0);
      setTopPages(data.top_pages || []);
      setNow(Date.now());
      setMostActiveUsers(data.most_active_users || []);
      setLikelyToConvert(data.likely_to_convert || []);
      setMostClickedRestaurants(data.most_clicked_restaurants || []);

      setSelectedSession((current) => {
        if (!current) return current;

        const updated = (data.sessions || []).find(
          (session: LiveSession) =>
            session.session_id === current.session_id ||
            session.user_id === current.user_id
        );

        return updated || current;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();

    const timer = setInterval(loadSessions, 5000);

    return () => clearInterval(timer);
  }, [loadSessions]);

  const statCards = useMemo(
    () => [
      {
        label: "Live Now",
        value: liveNow,
        tone: "rose" as const,
        helper: "Active in last 5 minutes",
      },
      {
        label: "Sessions 24h",
        value: totalSessions,
        helper: "Unique tracked sessions",
      },
      {
        label: "Events 24h",
        value: totalEvents,
        helper: "All tracked event sources",
      },
      {
        label: "Views",
        value: views,
        helper: "Discovery impressions",
      },
      {
        label: "Searches",
        value: searches,
        helper: "Planner queries submitted",
      },
      {
        label: "Clicks",
        value: clicks,
        helper: "CTA and listing actions",
      },
      {
        label: "Conversions",
        value: conversions,
        tone: "green" as const,
        helper: "Saved plans + reservations",
      },
      {
        label: "Conv. Rate",
        value: `${conversionRate}%`,
        helper: "Conversions per action",
      },
    ],
    [
      clicks,
      conversionRate,
      conversions,
      liveNow,
      searches,
      totalEvents,
      totalSessions,
      views,
    ]
  );

  const activePages = useMemo(() => {
    if (topPages.length > 0) return topPages.slice(0, 5);

    const counts = new Map<string, number>();

    [
      ...sessions.map((session) => session.current_page),
      ...events.map((event) => event.page_path),
    ]
      .filter(Boolean)
      .forEach((page) => {
        const safePage = page || "Unknown page";
        counts.set(safePage, (counts.get(safePage) || 0) + 1);
      });

    return Array.from(counts.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [events, sessions, topPages]);

  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.25),transparent_35%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl px-6 py-10">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            RoseOut Intelligence
          </p>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-6xl">
                Analytics Command Center
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
                Track live users, discovery views, searches, clicks, conversions,
                and users most likely to book or save a plan.
              </p>
            </div>

            <button
              onClick={loadSessions}
              className="rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-rose-100"
            >
              Refresh Now
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              tone={stat.tone}
              helper={stat.helper}
            />
          ))}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-4">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25 xl:col-span-2">
            <SectionHeader
              eyebrow="Sessions"
              title="Active User Feed"
              badge="Auto-refreshing"
            />

            {loading ? (
              <EmptyBox message="Loading live sessions..." />
            ) : sessions.length === 0 ? (
              <EmptyBox message="No live activity yet." />
            ) : (
              <div className="space-y-3">
                {sessions.slice(0, 12).map((session) => {
                  const isLive =
                    now - new Date(session.last_seen).getTime() <=
                    1000 * 60 * 5;

                  return (
                    <button
                      key={session.session_id || session.user_id || session.last_seen}
                      onClick={() => setSelectedSession(session)}
                      className="w-full rounded-[1.5rem] border border-white/10 bg-black/25 p-5 text-left transition hover:border-rose-400/40 hover:bg-rose-500/10"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                isLive ? "bg-emerald-400" : "bg-white/25"
                              }`}
                            />

                            <p className="truncate text-lg font-black">
                              {session.user?.full_name ||
                                session.user?.email ||
                                "Guest Session"}
                            </p>
                          </div>

                          <p className="mt-1 truncate text-sm text-white/45">
                            {session.user?.email ||
                              session.session_id ||
                              "No email"}
                          </p>

                          <p className="mt-3 inline-flex max-w-full rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/60">
                            <span className="truncate">
                              {session.current_page || "Unknown page"}
                            </span>
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
                            Last Action
                          </p>

                          <p className="mt-1 text-sm font-bold text-white">
                            {session.last_event_name ||
                              session.last_event_type ||
                              "Activity"}
                          </p>

                          <p className="mt-2 text-xs text-white/35">
                            {timeAgo(session.last_seen)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge>{session.events_count} events</Badge>
                        <Badge>{session.user?.subscription_status || "guest"}</Badge>
                        <Badge>{session.user?.role || "user"}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <SectionHeader eyebrow="Users" title="Most Active" />

            <div className="mt-5 space-y-3">
              {mostActiveUsers.length === 0 ? (
                <p className="text-sm text-white/45">No user data yet.</p>
              ) : (
                mostActiveUsers.slice(0, 8).map((item, index) => (
                  <MiniUserCard
                    key={item.user_id}
                    index={index}
                    user={item}
                    metric={`${item.events_count} events`}
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-rose-400/20 bg-gradient-to-br from-rose-500/15 via-fuchsia-500/10 to-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <SectionHeader eyebrow="AI Signal" title="Likely to Convert" />

            <div className="mt-5 space-y-3">
              {likelyToConvert.length === 0 ? (
                <p className="text-sm text-white/45">No conversion signals yet.</p>
              ) : (
                likelyToConvert.slice(0, 8).map((item, index) => (
                  <MiniUserCard
                    key={item.user_id}
                    index={index}
                    user={item}
                    metric={`${item.likely_to_convert_score}% score`}
                    showScore
                  />
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <SectionHeader eyebrow="Restaurants" title="Most Clicked" />

            <div className="mt-5 space-y-3">
              {mostClickedRestaurants.length === 0 ? (
                <p className="text-sm text-white/45">
                  Track restaurant clicks to populate this panel.
                </p>
              ) : (
                mostClickedRestaurants.map((restaurant, index) => (
                  <div
                    key={restaurant.restaurant_id}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-rose-300">
                          #{index + 1}
                        </p>

                        <p className="mt-1 truncate text-sm font-black">
                          {restaurant.restaurant_name}
                        </p>

                        <p className="mt-1 text-xs text-white/35">
                          Last clicked {timeAgo(restaurant.last_clicked)}
                        </p>
                      </div>

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                        {restaurant.clicks} clicks
                      </span>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Badge>{restaurant.conversions} conversions</Badge>
                      <Badge>ID: {restaurant.restaurant_id}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <SectionHeader eyebrow="Pages" title="Top Active Pages" />

            <div className="mt-5 space-y-3">
              {activePages.length === 0 ? (
                <p className="text-sm text-white/45">No page data yet.</p>
              ) : (
                activePages.map((item) => (
                  <div key={item.page} className="rounded-2xl bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-bold text-white">
                        {item.page}
                      </p>

                      <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black">
                        {item.count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <SectionHeader eyebrow="Stream" title="Recent Events" />

            <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-sm text-white/45">No recent events yet.</p>
              ) : (
                events.slice(0, 20).map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {event.event_name || event.event_type}
                        </p>

                        <p className="mt-1 truncate text-xs text-white/45">
                          {event.page_path || "Unknown page"}
                        </p>
                      </div>

                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/50">
                        {event.event_type}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-white/30">
                      {timeAgo(event.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {selectedSession && (
          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
                  Session Detail
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  {selectedSession.user?.full_name ||
                    selectedSession.user?.email ||
                    "Guest Session"}
                </h2>
              </div>

              <button
                onClick={() => setSelectedSession(null)}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 hover:bg-white hover:text-black"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <InfoBox
                label="Current Page"
                value={selectedSession.current_page || "Unknown"}
              />

              <InfoBox
                label="Last Seen"
                value={timeAgo(selectedSession.last_seen)}
              />

              <InfoBox
                label="Session ID"
                value={selectedSession.session_id || "None"}
              />
            </div>

            <div className="mt-6 space-y-3">
              {selectedSession.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-black">
                        {event.event_name || event.event_type}
                      </p>

                      <p className="mt-1 text-sm text-white/45">
                        {event.page_path || "Unknown page"}
                      </p>
                    </div>

                    <p className="text-xs text-white/35">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>

                  {event.metadata &&
                    Object.keys(event.metadata).length > 0 && (
                      <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-white/50">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function SectionHeader({
  eyebrow,
  title,
  badge,
}: {
  eyebrow: string;
  title: string;
  badge?: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
          {eyebrow}
        </p>

        <h2 className="mt-2 text-2xl font-black">{title}</h2>
      </div>

      {badge && (
        <div className="rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-300">
          {badge}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: string | number;
  tone?: "rose" | "green";
  helper: string;
}) {
  const accentClass =
    tone === "rose"
      ? "bg-rose-400"
      : tone === "green"
        ? "bg-emerald-400"
        : "bg-white/35";

  return (
    <div className="flex min-h-[142px] flex-col justify-between rounded-2xl border border-white/10 bg-[#111014] p-5 shadow-xl shadow-black/20 ring-1 ring-white/[0.03]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
            {label}
          </p>

          <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        </div>

        <h2 className="mt-5 text-4xl font-black leading-none tracking-[-0.04em] text-white tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </h2>
      </div>

      <p className="mt-4 border-t border-white/10 pt-3 text-xs font-semibold leading-5 text-white/40">
        {helper}
      </p>
    </div>
  );
}

function MiniUserCard({
  index,
  user,
  metric,
  showScore,
}: {
  index: number;
  user: ActiveUser;
  metric: string;
  showScore?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-rose-300">#{index + 1}</p>

          <p className="mt-1 truncate text-sm font-black">
            {user.user?.full_name || user.user?.email || "Unknown User"}
          </p>

          <p className="mt-1 truncate text-xs text-white/40">
            {user.user?.email || user.user_id}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            showScore
              ? "bg-rose-500 text-white"
              : "bg-white text-black"
          }`}
        >
          {metric}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <SmallMetric label="Searches" value={user.searches} />
        <SmallMetric label="Clicks" value={user.clicks} />
        <SmallMetric label="Conv." value={user.conversions} />
      </div>

      <p className="mt-3 text-xs text-white/30">
        Last seen {timeAgo(user.last_seen)}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-2">
      <p className="text-[9px] font-black uppercase tracking-wide text-white/30">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold capitalize text-white/55">
      {children}
    </span>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/25 p-10 text-center">
      <h3 className="text-xl font-black">{message}</h3>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">
        {label}
      </p>

      <p className="mt-2 break-all text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function timeAgo(dateString: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}