import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import { getLocationName } from "@/lib/locationName";
import { getLocationScore, type LocationScoreFields } from "@/lib/locationScore";

const ADMIN_ANALYTICS_VERSION = "admin-analytics-dashboard-2026-05-12";

type LocationMetric = LocationScoreFields & {
  id: string;
  name: string | null;
  city: string | null;
  view_count: number | null;
  click_count: number | null;
  type: "restaurant" | "activity";
};

type AnalyticsEvent = {
  id: string;
  item_type: string | null;
  event_type: string | null;
  page_path: string | null;
  created_at: string | null;
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superadmin", "admin", "viewer"]);

  const [restaurantsResult, activitiesResult, recentEventsResult, reservationsResult] =
    await Promise.all([
      supabase
        .from("restaurants")
        .select("id, name, restaurant_name, city, view_count, click_count, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge")
        .order("view_count", { ascending: false })
        .limit(10),
      supabase
        .from("activities")
        .select("id, name, activity_name, city, view_count, click_count, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge")
        .order("view_count", { ascending: false })
        .limit(10),
      supabase
        .from("analytics_events")
        .select("id, item_type, event_type, page_path, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("location_reservations")
        .select("id, status, arrived_at, completed_at"),
    ]);

  const restaurants = restaurantsResult.data || [];
  const activities = activitiesResult.data || [];
  const recentEvents = (recentEventsResult.data || []) as AnalyticsEvent[];
  const reservations = reservationsResult.data || [];

  const locationMetrics: LocationMetric[] = [
    ...restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: getLocationName(restaurant, "Untitled restaurant"),
      city: restaurant.city,
      view_count: restaurant.view_count,
      click_count: restaurant.click_count,
      theouthaven_score: restaurant.theouthaven_score,
      roseout_score: restaurant.roseout_score,
      quality_score: restaurant.quality_score,
      trend_score: restaurant.trend_score,
      conversion_score: restaurant.conversion_score,
      review_score: restaurant.review_score,
      popularity_score: restaurant.popularity_score,
      ranking_badge: restaurant.ranking_badge,
      type: "restaurant" as const,
    })),
    ...activities.map((activity) => ({
      id: activity.id,
      name: getLocationName(activity, "Untitled activity"),
      city: activity.city,
      view_count: activity.view_count,
      click_count: activity.click_count,
      theouthaven_score: activity.theouthaven_score,
      roseout_score: activity.roseout_score,
      quality_score: activity.quality_score,
      trend_score: activity.trend_score,
      conversion_score: activity.conversion_score,
      review_score: activity.review_score,
      popularity_score: activity.popularity_score,
      ranking_badge: activity.ranking_badge,
      type: "activity" as const,
    })),
  ].sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0));

  const totalViews = locationMetrics.reduce(
    (sum, item) => sum + Number(item.view_count || 0),
    0
  );
  const totalClicks = locationMetrics.reduce(
    (sum, item) => sum + Number(item.click_count || 0),
    0
  );
  const clickRate = percent(totalClicks, totalViews);

  const reservationStats = {
    total: reservations.length,
    confirmed: reservations.filter((r) => r.status === "confirmed").length,
    arrived: reservations.filter((r) => r.status === "arrived").length,
    completed: reservations.filter((r) => r.status === "completed").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
    noShow: reservations.filter((r) => r.status === "no_show").length,
  };

  const arrivalRate = percent(
    reservationStats.arrived + reservationStats.completed,
    reservationStats.total
  );
  const noShowRate = percent(reservationStats.noShow, reservationStats.total);

  return (
    <main
      data-page-version={ADMIN_ANALYTICS_VERSION}
      className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-5 shadow-2xl sm:p-7">
          <div className="absolute right-[-60px] top-[-60px] h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.35em] text-rose-300">
                TheOutHaven Analytics
              </p>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                Analytics Dashboard
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Track discovery, conversion, Reserve performance, and recent
                platform events in the same premium admin theme as the control
                center.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/dashboard"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/dashboard/reservations"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg"
              >
                Reserve Metrics
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <MetricCard label="Total Views" value={formatNumber(totalViews)} />
          <MetricCard label="Total Clicks" value={formatNumber(totalClicks)} tone="text-rose-200" />
          <MetricCard label="Click Rate" value={`${clickRate}%`} tone="text-emerald-300" />
          <MetricCard label="Reservations" value={formatNumber(reservationStats.total)} tone="text-amber-200" />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="border-b border-black/10 bg-white/75 p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">
                Top Discovery Locations
              </p>
              <h2 className="mt-2 text-2xl font-black">Views, clicks, and score</h2>
            </div>
            <div className="divide-y divide-black/10">
              {locationMetrics.slice(0, 10).map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={`/locations/${item.type === "activity" ? "activities" : "restaurants"}/${item.id}`}
                  className="grid gap-3 p-5 transition hover:bg-rose-50 md:grid-cols-[1fr_120px_120px_120px] md:items-center"
                >
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-black/35">
                      {item.type} · {item.city || "City N/A"}
                    </p>
                    <h3 className="mt-1 text-lg font-black">{item.name || "Untitled location"}</h3>
                  </div>
                  <MiniStat label="Views" value={formatNumber(item.view_count)} />
                  <MiniStat label="Clicks" value={formatNumber(item.click_count)} />
                  <MiniStat label="Score" value={formatNumber(getLocationScore(item))} />
                </Link>
              ))}
              {locationMetrics.length === 0 && (
                <div className="p-8 text-sm font-bold text-black/45">
                  No location analytics yet.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              Reserve Quality
            </p>
            <h2 className="mt-2 text-2xl font-black">Arrival performance</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <DarkMetric label="Arrival Rate" value={`${arrivalRate}%`} />
              <DarkMetric label="No-show Rate" value={`${noShowRate}%`} />
              <DarkMetric label="Confirmed" value={formatNumber(reservationStats.confirmed)} />
              <DarkMetric label="Completed" value={formatNumber(reservationStats.completed)} />
              <DarkMetric label="Cancelled" value={formatNumber(reservationStats.cancelled)} />
              <DarkMetric label="No Shows" value={formatNumber(reservationStats.noShow)} />
            </div>
          </aside>
        </section>

        <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#120d0b] shadow-2xl">
          <div className="border-b border-white/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              Recent Events
            </p>
            <h2 className="mt-2 text-2xl font-black">Latest analytics activity</h2>
          </div>
          <div className="divide-y divide-white/10">
            {recentEvents.map((event) => (
              <div key={event.id} className="grid gap-3 p-5 md:grid-cols-[180px_1fr_220px] md:items-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
                  {event.event_type || "event"}
                </p>
                <p className="text-sm font-bold text-white/60">
                  {event.item_type || "platform"} · {event.page_path || "—"}
                </p>
                <time className="text-sm font-bold text-white/40">
                  {formatDate(event.created_at)}
                </time>
              </div>
            ))}
            {recentEvents.length === 0 && (
              <div className="p-8 text-sm font-bold text-white/45">
                No recent analytics events found.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.05] p-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-wide text-black/35">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}
