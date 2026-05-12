import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

type SearchParams = { q?: string };

type RestaurantReserveRow = {
  id: string;
  restaurant_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
};

type ActivityReserveRow = {
  id: string;
  activity_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
};

type ReservationRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  party_size: number | null;
  reservation_time: string;
  status: string | null;
  location_id: string | null;
  location_type: string | null;
};

type ReserveLocation = {
  id: string;
  type: "restaurant" | "activity";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  reservationCount: number;
  nextReservation: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "No upcoming reservation";
  return new Date(value).toLocaleString();
}

function formatAddress(location: ReserveLocation) {
  return [location.address, location.city, location.state].filter(Boolean).join(", ") || "Address not listed";
}

export default async function AdminReservePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminRole(["superuser", "admin"]);

  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() || "";
  const now = new Date().toISOString();

  const [{ data: reservations }, { data: restaurants }, { data: activities }] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, name, email, phone, party_size, reservation_time, status, location_id, location_type")
      .gte("reservation_time", now)
      .order("reservation_time", { ascending: true })
      .limit(300),
    supabase
      .from("restaurants")
      .select("id, restaurant_name, address, city, state, status")
      .order("restaurant_name", { ascending: true })
      .limit(500),
    supabase
      .from("activities")
      .select("id, activity_name, address, city, state, status")
      .order("activity_name", { ascending: true })
      .limit(500),
  ]);

  const safeReservations = (reservations || []) as ReservationRow[];
  const reservationStats = safeReservations.reduce<Record<string, { count: number; next: string | null }>>((acc, reservation) => {
    if (!reservation.location_id) return acc;
    const key = `${reservation.location_type}:${reservation.location_id}`;
    const current = acc[key] || { count: 0, next: null };
    current.count += 1;
    current.next = !current.next || new Date(reservation.reservation_time) < new Date(current.next)
      ? reservation.reservation_time
      : current.next;
    acc[key] = current;
    return acc;
  }, {});

  const locations: ReserveLocation[] = [
    ...((restaurants || []) as RestaurantReserveRow[]).map((item) => {
      const stats = reservationStats[`restaurant:${item.id}`] || reservationStats[`restaurants:${item.id}`] || { count: 0, next: null };
      return {
        id: item.id,
        type: "restaurant" as const,
        name: item.restaurant_name,
        address: item.address,
        city: item.city,
        state: item.state,
        status: item.status,
        reservationCount: stats.count,
        nextReservation: stats.next,
      };
    }),
    ...((activities || []) as ActivityReserveRow[]).map((item) => {
      const stats = reservationStats[`activity:${item.id}`] || reservationStats[`activities:${item.id}`] || { count: 0, next: null };
      return {
        id: item.id,
        type: "activity" as const,
        name: item.activity_name,
        address: item.address,
        city: item.city,
        state: item.state,
        status: item.status,
        reservationCount: stats.count,
        nextReservation: stats.next,
      };
    }),
  ].filter((location) => {
    if (!q) return true;
    return [location.name, location.address, location.city, location.state, location.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">OutHaven Reserve</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Reservation command center</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            View all reserve-enabled locations at a glance, search individual locations, and jump into reservation details from inside the admin dashboard.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/reserve/dashboard" className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">Legacy reserve dashboard</Link>
            <Link href="/reserve/dashboard/reservations" className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg">All reservations</Link>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <form className="flex flex-col gap-3 md:flex-row">
            <input name="q" defaultValue={params.q || ""} placeholder="Search location name, address, city, or type..." className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300" />
            <button className="rounded-full bg-white px-6 py-3 text-sm font-black text-black hover:bg-rose-100">Search</button>
          </form>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => (
            <article key={`${location.type}-${location.id}`} className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl transition hover:-translate-y-0.5 hover:bg-white/[0.09]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">{location.type}</p>
                  <h2 className="mt-2 truncate text-xl font-black">{location.name || "Untitled location"}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/50">{formatAddress(location)}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-black">{location.status || "unknown"}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/25 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Upcoming</p>
                  <p className="mt-1 text-2xl font-black">{location.reservationCount}</p>
                </div>
                <div className="rounded-2xl bg-black/25 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Next</p>
                  <p className="mt-1 text-xs font-bold text-white/70">{formatDate(location.nextReservation)}</p>
                </div>
              </div>
              <Link href={`/reserve/location/${location.id}`} className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black text-white/70 hover:bg-white hover:text-black">
                View reserve setup
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
