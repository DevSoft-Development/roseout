import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superuser", "admin", "viewer"]);

  const refreshedAt = new Date();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, restaurant_name, city, view_count, click_count, roseout_score")
    .order("view_count", { ascending: false })
    .limit(10);

  const { data: activities } = await supabase
    .from("activities")
    .select("id, activity_name, city, view_count, click_count, roseout_score")
    .order("view_count", { ascending: false })
    .limit(10);

  const { data: recentEvents } = await supabase
    .from("analytics_events")
    .select("id, item_type, event_type, page_path, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: reservations } = await supabase
    .from("location_reservations")
    .select("id, status, arrived_at, completed_at");

  const totalRestaurantViews =
    restaurants?.reduce((sum, r) => sum + Number(r.view_count || 0), 0) || 0;

  const totalRestaurantClicks =
    restaurants?.reduce((sum, r) => sum + Number(r.click_count || 0), 0) || 0;

  const totalActivityViews =
    activities?.reduce((sum, a) => sum + Number(a.view_count || 0), 0) || 0;

  const totalActivityClicks =
    activities?.reduce((sum, a) => sum + Number(a.click_count || 0), 0) || 0;

  const reservationStats = {
    total: reservations?.length || 0,
    confirmed:
      reservations?.filter((r) => r.status === "confirmed").length || 0,
    arrived: reservations?.filter((r) => r.status === "arrived").length || 0,
    completed:
      reservations?.filter((r) => r.status === "completed").length || 0,
    cancelled:
      reservations?.filter((r) => r.status === "cancelled").length || 0,
    noShow: reservations?.filter((r) => r.status === "no_show").length || 0,
  };

  const arrivalRate =
    reservationStats.total > 0
      ? Math.round(
          ((reservationStats.arrived + reservationStats.completed) /
            reservationStats.total) *
            100,
        )
      : 0;

  const noShowRate =
    reservationStats.total > 0
      ? Math.round((reservationStats.noShow / reservationStats.total) * 100)
      : 0;

  const totalViews = totalRestaurantViews + totalActivityViews;
  const totalClicks = totalRestaurantClicks + totalActivityClicks;
  const clickRate =
    totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0;

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-yellow-500">
            RoseOut Admin
          </p>

          <h1 className="text-4xl font-extrabold tracking-tight">
            Analytics Dashboard
          </h1>

          <p className="mt-3 text-neutral-400">
            View discovery performance, reservation activity, arrival trends,
            and recent analytics events.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm shadow-lg shadow-black/20">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
            Live Dashboard
          </p>
          <p className="mt-1 font-bold text-white">No cached analytics page</p>
          <p className="mt-1 text-xs font-semibold text-white/45">
            Refreshed{" "}
            {refreshedAt.toLocaleString("en-US", {
              timeZone: "America/New_York",
            })}
          </p>
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[2rem] bg-white p-6 text-black">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">
                Discovery Overview
              </p>
              <h2 className="mt-2 text-3xl font-extrabold">
                {totalViews.toLocaleString()} total views
              </h2>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Restaurants and activities combined.
              </p>
            </div>

            <div className="rounded-2xl bg-black px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
                Click Rate
              </p>
              <p className="mt-1 text-3xl font-extrabold">{clickRate}%</p>
            </div>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-4">
            <MiniMetric label="Restaurant Views" value={totalRestaurantViews} />
            <MiniMetric
              label="Restaurant Clicks"
              value={totalRestaurantClicks}
            />
            <MiniMetric label="Activity Views" value={totalActivityViews} />
            <MiniMetric label="Activity Clicks" value={totalActivityClicks} />
          </div>
        </div>

        <div className="rounded-[2rem] bg-gradient-to-br from-red-700 via-red-600 to-black p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">
            Reserve Performance
          </p>

          <h2 className="mt-2 text-5xl font-extrabold">
            {reservationStats.total}
          </h2>

          <p className="mt-2 text-sm font-semibold text-white/65">
            Total reservations captured through RoseOut Reserve.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <DarkMetric label="Arrival Rate" value={`${arrivalRate}%`} />
            <DarkMetric label="No-Show Rate" value={`${noShowRate}%`} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 text-black lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">
                Reservation Pipeline
              </p>
              <h2 className="mt-2 text-2xl font-extrabold">
                Booking status breakdown
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <PipelineRow
              label="Confirmed"
              value={reservationStats.confirmed}
              total={reservationStats.total}
            />
            <PipelineRow
              label="Arrived"
              value={reservationStats.arrived}
              total={reservationStats.total}
            />
            <PipelineRow
              label="Completed"
              value={reservationStats.completed}
              total={reservationStats.total}
            />
            <PipelineRow
              label="Cancelled"
              value={reservationStats.cancelled}
              total={reservationStats.total}
            />
            <PipelineRow
              label="No Shows"
              value={reservationStats.noShow}
              total={reservationStats.total}
            />
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 text-black">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">
            Key Takeaway
          </p>

          <h2 className="mt-3 text-2xl font-extrabold">
            {arrivalRate >= 70
              ? "Strong arrival quality"
              : reservationStats.total > 0
                ? "Improve show-up rate"
                : "Ready for bookings"}
          </h2>

          <p className="mt-3 text-sm leading-6 text-neutral-500">
            {reservationStats.total === 0
              ? "Once locations start using RoseOut Reserve, this section will show booking quality and no-show trends."
              : `RoseOut has a ${arrivalRate}% arrival rate and ${noShowRate}% no-show rate across current reservations.`}
          </p>

          <div className="mt-6 rounded-2xl bg-neutral-100 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
              Best Sales Angle
            </p>
            <p className="mt-2 text-sm font-bold text-neutral-800">
              “RoseOut does not just send clicks. It tracks reservations,
              arrivals, and no-shows.”
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] bg-white text-black">
        <div className="border-b border-neutral-200 p-5">
          <h2 className="text-xl font-bold">Top Restaurants</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-5 py-4">Restaurant</th>
              <th className="px-5 py-4">City</th>
              <th className="px-5 py-4">Views</th>
              <th className="px-5 py-4">Clicks</th>
              <th className="px-5 py-4">Score</th>
            </tr>
          </thead>

          <tbody>
            {restaurants?.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200">
                <td className="px-5 py-4 font-bold">{r.restaurant_name}</td>
                <td className="px-5 py-4">{r.city || "N/A"}</td>
                <td className="px-5 py-4">{r.view_count || 0}</td>
                <td className="px-5 py-4">{r.click_count || 0}</td>
                <td className="px-5 py-4">{r.roseout_score || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] bg-white text-black">
        <div className="border-b border-neutral-200 p-5">
          <h2 className="text-xl font-bold">Top Activities</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-5 py-4">Activity</th>
              <th className="px-5 py-4">City</th>
              <th className="px-5 py-4">Views</th>
              <th className="px-5 py-4">Clicks</th>
              <th className="px-5 py-4">Score</th>
            </tr>
          </thead>

          <tbody>
            {activities?.map((a) => (
              <tr key={a.id} className="border-t border-neutral-200">
                <td className="px-5 py-4 font-bold">{a.activity_name}</td>
                <td className="px-5 py-4">{a.city || "N/A"}</td>
                <td className="px-5 py-4">{a.view_count || 0}</td>
                <td className="px-5 py-4">{a.click_count || 0}</td>
                <td className="px-5 py-4">{a.roseout_score || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 overflow-hidden rounded-[2rem] bg-white text-black">
        <div className="border-b border-neutral-200 p-5">
          <h2 className="text-xl font-bold">Recent Events</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-5 py-4">Type</th>
              <th className="px-5 py-4">Event</th>
              <th className="px-5 py-4">Page</th>
              <th className="px-5 py-4">Time</th>
            </tr>
          </thead>

          <tbody>
            {recentEvents?.map((event) => (
              <tr key={event.id} className="border-t border-neutral-200">
                <td className="px-5 py-4 capitalize">{event.item_type}</td>
                <td className="px-5 py-4 capitalize">{event.event_type}</td>
                <td className="px-5 py-4">{event.page_path || "N/A"}</td>
                <td className="px-5 py-4">
                  {event.created_at
                    ? new Date(event.created_at).toLocaleString()
                    : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-neutral-100 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function PipelineRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-neutral-700">{label}</p>
        <p className="text-sm font-extrabold text-neutral-900">
          {value} · {percent}%
        </p>
      </div>

      <div className="mt-2 h-3 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-red-600"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
