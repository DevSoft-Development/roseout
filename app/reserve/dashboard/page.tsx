import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ReserveLiveRefresh from "@/components/ReserveLiveRefresh";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reservations Dashboard",
  description:
    "Manage reservations and booking activity on TheOutHaven Reserve.",
  path: "/reserve/dashboard",
  noIndex: true,
});
type ReservationItem = {
  id: string;
  name: string | null;
  party_size: number | null;
  reservation_time: string;
  status: string | null;
  duration_minutes: number | null;
  location_id: string | null;
  location_type: string | null;
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusClass(status?: string | null) {
  const value = status || "pending";

  if (value === "confirmed") return "bg-emerald-50 text-emerald-700";
  if (value === "cancelled") return "bg-red-50 text-red-700";
  if (value === "seated") return "bg-black text-white";
  if (value === "completed") return "bg-neutral-100 text-neutral-700";

  return "bg-amber-50 text-amber-700";
}

function estimateCapacityNeeded(partySize: number | null | undefined) {
  const party = Number(partySize || 0);
  if (party <= 4) return 1;
  if (party <= 8) return 2;
  return Math.ceil(party / 4);
}

function getReservationDay(value: string) {
  return new Date(value).toISOString().split("T")[0];
}

function getDuration(
  reservation: ReservationItem,
  durationMap: Record<string, number>,
) {
  if (reservation.duration_minutes) return reservation.duration_minutes;

  const key = `${reservation.location_type}:${reservation.location_id}`;
  return durationMap[key] || 90;
}

export default async function ReserveDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const now = new Date();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const totalCapacitySlots = 20;

  const { count: totalReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true });

  const { count: todayReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("reservation_time", todayStart.toISOString())
    .lte("reservation_time", todayEnd.toISOString());

  const { count: upcomingReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("reservation_time", now.toISOString());

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, name, party_size, reservation_time, status, duration_minutes, location_id, location_type",
    )
    .gte("reservation_time", todayStart.toISOString())
    .lte("reservation_time", weekEnd.toISOString())
    .order("reservation_time", { ascending: true })
    .limit(40);

  const safeReservations = (reservations || []) as ReservationItem[];

  const restaurantIds = safeReservations
    .filter((item) => item.location_type === "restaurant" && item.location_id)
    .map((item) => item.location_id as string);

  const activityIds = safeReservations
    .filter((item) => item.location_type === "activity" && item.location_id)
    .map((item) => item.location_id as string);

  const { data: restaurants } = restaurantIds.length
    ? await supabase
        .from("restaurants")
        .select("id, default_duration_minutes")
        .in("id", restaurantIds)
    : { data: [] };

  const { data: activities } = activityIds.length
    ? await supabase
        .from("activities")
        .select("id, default_duration_minutes")
        .in("id", activityIds)
    : { data: [] };

  const durationMap: Record<string, number> = {};

  restaurants?.forEach((item) => {
    durationMap[`restaurant:${item.id}`] = item.default_duration_minutes || 90;
  });

  activities?.forEach((item) => {
    durationMap[`activity:${item.id}`] = item.default_duration_minutes || 90;
  });

  const todaysReservations = safeReservations.filter(
    (item) =>
      new Date(item.reservation_time) >= todayStart &&
      new Date(item.reservation_time) <= todayEnd,
  );

  const capacityBookedNow = todaysReservations
    .filter((item) => {
      const reservationTime = new Date(item.reservation_time);
      const duration = getDuration(item, durationMap);

      const reservationEnd = new Date(
        reservationTime.getTime() + duration * 60000,
      );

      return now >= reservationTime && now <= reservationEnd;
    })
    .reduce((sum, item) => sum + estimateCapacityNeeded(item.party_size), 0);

  const availableCapacitySlots = Math.max(
    0,
    totalCapacitySlots - capacityBookedNow,
  );

  const availabilityPercentage = Math.round(
    (availableCapacitySlots / totalCapacitySlots) * 100,
  );

  const groupedByDay = safeReservations.reduce<
    Record<string, ReservationItem[]>
  >((acc, item) => {
    const key = getReservationDay(item.reservation_time);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_60%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Reserve
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Reservations Dashboard
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Live booking overview, flexible duration settings, availability
                tracking, and calendar-style reservation previews.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ReserveLiveRefresh />

              <Link
                href="/reserve/dashboard/reservations"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]"
              >
                View Reservations
              </Link>

              <Link
                href="/support"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Support Tickets
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Total Reservations
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalReservations)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Today
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(todayReservations)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Upcoming
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {formatNumber(upcomingReservations)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Availability Open Now
            </p>
            <p className="mt-2 text-3xl font-black">
              {availableCapacitySlots}/{totalCapacitySlots}
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/10 bg-white/70 p-4">
              <div>
                <h2 className="text-lg font-black">Today’s Booking Flow</h2>
                <p className="mt-1 text-xs font-medium text-black/50">
                  Estimated availability uses each booking or location duration.
                </p>
              </div>

              <Link
                href="/reserve/dashboard/reservations?filter=today"
                className="rounded-full bg-black px-4 py-2 text-xs font-black text-white"
              >
                Today
              </Link>
            </div>

            {!todaysReservations.length ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">
                  🌹
                </div>
                <p className="mt-4 text-lg font-black">No reservations today</p>
                <p className="mt-1 text-sm text-black/50">
                  Today’s bookings will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/10">
                {todaysReservations.slice(0, 10).map((item) => {
                  const duration = getDuration(item, durationMap);

                  return (
                    <div
                      key={item.id}
                      className="grid gap-3 p-4 transition hover:bg-rose-50/70 md:grid-cols-[110px_1fr_110px_110px_120px]"
                    >
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-black/40">
                          Time
                        </p>
                        <p className="mt-1 font-black">
                          {formatTime(item.reservation_time)}
                        </p>
                      </div>

                      <div>
                        <p className="truncate font-black">
                          {item.name || "Guest"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-black/45">
                          Party of {item.party_size || 0}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-black/40">
                          Duration
                        </p>
                        <p className="mt-1 font-black">{duration} min</p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-black/40">
                          Capacity
                        </p>
                        <p className="mt-1 font-black">
                          {estimateCapacityNeeded(item.party_size)}
                        </p>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(
                            item.status,
                          )}`}
                        >
                          {item.status || "pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">Live Availability</h2>
                <p className="mt-1 text-xs text-white/45">
                  Based on active bookings and location duration settings.
                </p>
              </div>

              <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">
                {availableCapacitySlots} Open
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                    Current Availability
                  </p>
                  <p className="mt-2 text-4xl font-black">
                    {availabilityPercentage}%
                  </p>
                </div>

                <p className="text-sm font-bold text-white/50">
                  {capacityBookedNow} booked now
                </p>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-emerald-400"
                  style={{ width: `${availabilityPercentage}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/reserve/dashboard/reservations?filter=upcoming"
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Upcoming</p>
                <p className="mt-1 text-xs text-white/45">Future bookings</p>
              </Link>

              <Link
                href="/admin/activities"
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Location Durations</p>
                <p className="mt-1 text-xs text-white/45">Edit defaults</p>
              </Link>

              <Link
                href="/support"
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="font-black">Support Tickets</p>
                <p className="mt-1 text-xs text-white/45">
                  Submit, reply, view
                </p>
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-black/10 bg-white/70 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Reservation Calendar</h2>
              <p className="mt-1 text-xs font-medium text-black/50">
                Next 7 days grouped by booking date.
              </p>
            </div>

            <Link
              href="/reserve/dashboard/reservations"
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-4 py-2 text-xs font-black text-white"
            >
              Manage All
            </Link>
          </div>

          {!safeReservations.length ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">
                📅
              </div>
              <p className="mt-4 text-lg font-black">No upcoming bookings</p>
              <p className="mt-1 text-sm text-black/50">
                Upcoming reservations will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(groupedByDay).map(([day, items]) => (
                <div
                  key={day}
                  className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-black">{formatDate(day)}</p>
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-white">
                      {items.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {items.slice(0, 5).map((item) => {
                      const duration = getDuration(item, durationMap);
                      const capacity = estimateCapacityNeeded(item.party_size);

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl bg-[#f5eee8] p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-black">
                              {item.name || "Guest"}
                            </p>
                            <p className="shrink-0 text-xs font-black text-rose-700">
                              {formatTime(item.reservation_time)}
                            </p>
                          </div>

                          <p className="mt-1 text-xs font-bold text-black/45">
                            Party of {item.party_size || 0} · {duration} min ·{" "}
                            {capacity} capacity slot
                            {capacity > 1 ? "s" : ""}
                          </p>
                        </div>
                      );
                    })}

                    {items.length > 5 && (
                      <p className="pt-1 text-xs font-black text-black/40">
                        + {items.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
