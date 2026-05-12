import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ReserveLiveRefresh from "@/components/ReserveLiveRefresh";

type ReservationItem = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  party_size: number | null;
  reservation_date: string;
  reservation_time: string;
  status: string | null;
  location_id: string | null;
  location_type: string | null;
  bookable_item_name: string | null;
  bookable_item_type: string | null;
  special_request: string | null;
  created_at: string | null;
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatTime(value: string) {
  const clean = String(value || "").slice(0, 5);
  const [hourRaw, minuteRaw = "00"] = clean.split(":");
  const hour = Number(hourRaw);

  if (!Number.isFinite(hour)) return clean || "—";

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusClass(status?: string | null) {
  const value = status || "pending";

  if (value === "confirmed") return "bg-emerald-50 text-emerald-700";
  if (value === "arrived") return "bg-blue-50 text-blue-700";
  if (value === "cancelled" || value === "declined") return "bg-red-50 text-red-700";
  if (value === "completed") return "bg-neutral-100 text-neutral-700";
  if (value === "no_show") return "bg-zinc-900 text-white";

  return "bg-amber-50 text-amber-700";
}

function statusLabel(status?: string | null) {
  return String(status || "pending")
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateKey(value: Date) {
  return value.toISOString().split("T")[0];
}

function getReservationDateTime(reservation: ReservationItem) {
  const time = String(reservation.reservation_time || "00:00").slice(0, 5);
  return new Date(`${reservation.reservation_date}T${time}:00`);
}

function estimateCapacityNeeded(partySize: number | null | undefined) {
  const party = Number(partySize || 0);
  if (party <= 4) return 1;
  if (party <= 8) return 2;
  return Math.ceil(party / 4);
}

export default async function ReserveDashboardPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const now = new Date();
  const today = dateKey(now);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = dateKey(weekEnd);
  const totalCapacitySlots = 20;

  const [
    totalReservationsResult,
    todayReservationsResult,
    upcomingReservationsResult,
    pendingReservationsResult,
    confirmedReservationsResult,
    reservationListResult,
  ] = await Promise.all([
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("reservation_date", today),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .gte("reservation_date", today),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("location_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),
    supabase
      .from("location_reservations")
      .select(
        "id, customer_name, customer_email, customer_phone, party_size, reservation_date, reservation_time, status, location_id, location_type, bookable_item_name, bookable_item_type, special_request, created_at"
      )
      .gte("reservation_date", today)
      .lte("reservation_date", weekEndKey)
      .order("reservation_date", { ascending: true })
      .order("reservation_time", { ascending: true })
      .limit(60),
  ]);

  const safeReservations = (reservationListResult.data || []) as ReservationItem[];
  const todaysReservations = safeReservations.filter(
    (item) => item.reservation_date === today
  );

  const activeStatuses = ["pending", "confirmed", "arrived"];
  const capacityBookedNow = todaysReservations
    .filter((item) => {
      const reservationTime = getReservationDateTime(item);
      const reservationEnd = new Date(reservationTime.getTime() + 90 * 60000);
      return (
        activeStatuses.includes(String(item.status || "pending")) &&
        now >= reservationTime &&
        now <= reservationEnd
      );
    })
    .reduce((sum, item) => sum + estimateCapacityNeeded(item.party_size), 0);

  const availableCapacitySlots = Math.max(
    0,
    totalCapacitySlots - capacityBookedNow
  );

  const availabilityPercentage = Math.round(
    (availableCapacitySlots / totalCapacitySlots) * 100
  );

  const groupedByDay = safeReservations.reduce<Record<string, ReservationItem[]>>(
    (acc, item) => {
      acc[item.reservation_date] = acc[item.reservation_date] || [];
      acc[item.reservation_date].push(item);
      return acc;
    },
    {}
  );

  const pendingReservations = Number(pendingReservationsResult.count || 0);
  const confirmedReservations = Number(confirmedReservationsResult.count || 0);

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
                The latest Reserve command center uses the active
                location-reservations pipeline, so admin counts, tickets, and
                booking operations stay aligned with customer confirmations.
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
                href="/admin/dashboard/support"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Support Tickets
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-5">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Total
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(totalReservationsResult.count)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Today
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(todayReservationsResult.count)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Upcoming
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {formatNumber(upcomingReservationsResult.count)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Pending
            </p>
            <p className="mt-2 text-3xl font-black text-amber-200">
              {formatNumber(pendingReservations)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Open Now
            </p>
            <p className="mt-2 text-3xl font-black">
              {availableCapacitySlots}/{totalCapacitySlots}
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[430px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              Live Capacity
            </p>
            <h2 className="mt-2 text-2xl font-black">Availability overview</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Estimated live capacity is based on active reservations happening
              right now. Pending, confirmed, and arrived reservations count
              toward in-use capacity.
            </p>

            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
                    Available
                  </p>
                  <p className="mt-2 text-4xl font-black">
                    {availabilityPercentage}%
                  </p>
                </div>
                <p className="text-sm font-bold text-white/45">
                  {availableCapacitySlots} of {totalCapacitySlots} slots
                </p>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-rose-400"
                  style={{ width: `${availabilityPercentage}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/reserve/dashboard/reservations?status=pending"
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                  Pending
                </p>
                <p className="mt-2 text-2xl font-black text-amber-200">
                  {formatNumber(pendingReservations)}
                </p>
              </Link>
              <Link
                href="/reserve/dashboard/reservations?status=confirmed"
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/[0.1]"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                  Confirmed
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-300">
                  {formatNumber(confirmedReservations)}
                </p>
              </Link>
            </div>
          </aside>

          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/75 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-700">
                  Today&apos;s service flow
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Reservations for {formatDate(today)}
                </h2>
              </div>
              <Link
                href="/reserve/dashboard/reservations?filter=today"
                className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white transition hover:bg-rose-600"
              >
                Open today
              </Link>
            </div>

            <div className="divide-y divide-black/10">
              {todaysReservations.slice(0, 8).map((reservation) => (
                <div
                  key={reservation.id}
                  className="grid gap-4 p-5 md:grid-cols-[120px_1fr_130px] md:items-center"
                >
                  <div>
                    <p className="text-2xl font-black">
                      {formatTime(reservation.reservation_time)}
                    </p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-black/35">
                      Party {reservation.party_size || 1}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-black">
                      {reservation.customer_name || "Guest reservation"}
                    </h3>
                    <p className="mt-1 text-sm text-black/50">
                      {reservation.bookable_item_name || "General reservation"} · {reservation.location_type || "location"}
                    </p>
                    {reservation.special_request && (
                      <p className="mt-2 rounded-2xl bg-black/[0.04] px-3 py-2 text-xs font-bold text-black/50">
                        {reservation.special_request}
                      </p>
                    )}
                  </div>

                  <span className={`rounded-full px-3 py-2 text-center text-xs font-black uppercase tracking-wide ${statusClass(reservation.status)}`}>
                    {statusLabel(reservation.status)}
                  </span>
                </div>
              ))}

              {todaysReservations.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-lg font-black">No reservations today</p>
                  <p className="mt-2 text-sm text-black/45">
                    New bookings from TheOutHaven Reserve will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#120d0b] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
                Seven-day calendar
              </p>
              <h2 className="mt-2 text-2xl font-black">Upcoming reservations</h2>
            </div>
            <Link
              href="/reserve/dashboard/reservations?filter=upcoming"
              className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              View all
            </Link>
          </div>

          <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(groupedByDay).map(([day, items]) => (
              <div key={day} className="border-b border-white/10 p-5 md:border-r">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-white/40">
                  {formatDate(day)}
                </p>
                <p className="mt-1 text-2xl font-black">
                  {formatNumber(items.length)}
                </p>

                <div className="mt-4 space-y-2">
                  {items.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href="/reserve/dashboard/reservations"
                      className="block rounded-2xl bg-white/[0.06] p-3 transition hover:bg-white/[0.1]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black">{formatTime(item.reservation_time)}</p>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/45">
                        {item.customer_name || "Guest"} · party {item.party_size || 1}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {safeReservations.length === 0 && (
              <div className="p-8 text-sm font-bold text-white/45">
                Upcoming reservations will appear here when customers book
                through TheOutHaven Reserve.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
