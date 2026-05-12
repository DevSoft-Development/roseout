import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type LocationMetric = {
  id: string;
  name: string;
  city: string | null;
  views: number;
  clicks: number;
  score: number;
  type: "Restaurant" | "Activity";
};

type AnalyticsEvent = {
  id: string;
  item_type: string | null;
  event_type: string | null;
  page_path: string | null;
  created_at: string | null;
};

type ReservationMetric = {
  id: string;
  status: string | null;
  arrived_at: string | null;
  completed_at: string | null;
};

function num(value: unknown) {
  return Number(value || 0);
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function barWidth(value: number, total: number) {
  return `${Math.max(4, pct(value, total))}%`;
}

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superuser", "admin", "viewer"]);

  const [
    { data: restaurants },
    { data: activities },
    { data: recentEvents },
    { data: reservations },
  ] = await Promise.all([
    supabase
      .from("restaurants")
      .select(
        "id, restaurant_name, city, view_count, click_count, theouthaven_score",
      )
      .order("view_count", { ascending: false })
      .limit(12),
    supabase
      .from("activities")
      .select(
        "id, activity_name, city, view_count, click_count, theouthaven_score",
      )
      .order("view_count", { ascending: false })
      .limit(12),
    supabase
      .from("analytics_events")
      .select("id, item_type, event_type, page_path, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("location_reservations")
      .select("id, status, arrived_at, completed_at"),
  ]);

  const locationMetrics: LocationMetric[] = [
    ...((restaurants || []).map((item) => ({
      id: item.id,
      name: item.restaurant_name || "Untitled restaurant",
      city: item.city || null,
      views: num(item.view_count),
      clicks: num(item.click_count),
      score: num(item.theouthaven_score),
      type: "Restaurant" as const,
    })) || []),
    ...((activities || []).map((item) => ({
      id: item.id,
      name: item.activity_name || "Untitled activity",
      city: item.city || null,
      views: num(item.view_count),
      clicks: num(item.click_count),
      score: num(item.theouthaven_score),
      type: "Activity" as const,
    })) || []),
  ].sort((a, b) => b.views - a.views);

  const reservationRows = (reservations || []) as ReservationMetric[];
  const eventRows = (recentEvents || []) as AnalyticsEvent[];
  const totalViews = locationMetrics.reduce((sum, item) => sum + item.views, 0);
  const totalClicks = locationMetrics.reduce(
    (sum, item) => sum + item.clicks,
    0,
  );
  const avgScore = locationMetrics.length
    ? Math.round(
        locationMetrics.reduce((sum, item) => sum + item.score, 0) /
          locationMetrics.length,
      )
    : 0;
  const topPerformer = locationMetrics[0];

  const reservationStats = {
    total: reservationRows.length,
    confirmed: reservationRows.filter((item) => item.status === "confirmed")
      .length,
    arrived: reservationRows.filter((item) => item.status === "arrived").length,
    completed: reservationRows.filter((item) => item.status === "completed")
      .length,
    cancelled: reservationRows.filter((item) => item.status === "cancelled")
      .length,
    noShow: reservationRows.filter((item) => item.status === "no_show").length,
  };

  const clickRate = pct(totalClicks, totalViews);
  const arrivalRate = pct(
    reservationStats.arrived + reservationStats.completed,
    reservationStats.total,
  );
  const noShowRate = pct(reservationStats.noShow, reservationStats.total);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_60%,#140f0a)] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">
                Analytics Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                A full performance view across discovery, reservations,
                engagement events, and location quality.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/locations"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
              >
                Locations
              </Link>
              <Link
                href="/admin/dashboard/reservations"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg"
              >
                Reservations
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Metric label="Total Views" value={totalViews} />
          <Metric label="Total Clicks" value={totalClicks} />
          <Metric label="Click Rate" value={`${clickRate}%`} />
          <Metric label="Avg Score" value={avgScore} />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl">
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">
                  Discovery leaderboard
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Top viewed locations
                </h2>
              </div>
              {topPerformer && (
                <div className="rounded-2xl bg-white px-4 py-3 text-black">
                  <p className="text-xs font-black uppercase tracking-wide text-black/45">
                    Top performer
                  </p>
                  <p className="mt-1 font-black">{topPerformer.name}</p>
                </div>
              )}
            </div>
            <div className="mt-5 space-y-3">
              {locationMetrics.slice(0, 10).map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{item.name}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-rose-200/70">
                        {item.type} · {item.city || "City N/A"}
                      </p>
                    </div>
                    <div className="text-right text-sm font-black text-white/70">
                      {item.views.toLocaleString()} views ·{" "}
                      {item.clicks.toLocaleString()} clicks
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-300"
                      style={{
                        width: barWidth(item.views, topPerformer?.views || 1),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] p-5 text-[#1b1210] shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-black/45">
              Reserve health
            </p>
            <h2 className="mt-2 text-5xl font-black">
              {reservationStats.total}
            </h2>
            <p className="mt-2 text-sm font-bold text-black/50">
              Total reservation records
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <LightMetric label="Arrival rate" value={`${arrivalRate}%`} />
              <LightMetric label="No-show rate" value={`${noShowRate}%`} />
              <LightMetric
                label="Confirmed"
                value={reservationStats.confirmed}
              />
              <LightMetric
                label="Cancelled"
                value={reservationStats.cancelled}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">
              Reservation pipeline
            </p>
            <div className="mt-5 space-y-4">
              <Pipeline
                label="Confirmed"
                value={reservationStats.confirmed}
                total={reservationStats.total}
              />
              <Pipeline
                label="Arrived"
                value={reservationStats.arrived}
                total={reservationStats.total}
              />
              <Pipeline
                label="Completed"
                value={reservationStats.completed}
                total={reservationStats.total}
              />
              <Pipeline
                label="Cancelled"
                value={reservationStats.cancelled}
                total={reservationStats.total}
              />
              <Pipeline
                label="No show"
                value={reservationStats.noShow}
                total={reservationStats.total}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] shadow-2xl">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">
                Live events
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Recent analytics activity
              </h2>
            </div>
            <div className="divide-y divide-white/10">
              {eventRows.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-3 p-4 md:grid-cols-[160px_1fr_150px] md:items-center"
                >
                  <span className="rounded-full bg-white/10 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-white/70">
                    {event.event_type || "event"}
                  </span>
                  <p className="truncate text-sm font-bold text-white/70">
                    {event.page_path || event.item_type || "Unknown path"}
                  </p>
                  <time className="text-sm font-bold text-white/40">
                    {formatDate(event.created_at)}
                  </time>
                </div>
              ))}
              {eventRows.length === 0 && (
                <p className="p-8 text-center text-sm font-bold text-white/45">
                  No analytics events yet.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function LightMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function Pipeline({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm font-black">
        <span>{label}</span>
        <span>{value.toLocaleString()}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-emerald-300"
          style={{ width: barWidth(value, total || 1) }}
        />
      </div>
    </div>
  );
}
