"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type LocationOption = {
  id: string;
  type: string;
  name: string;
  city?: string;
  state?: string;
};

type Reservation = {
  id: string;
  location_id: string;
  location_type: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  party_size?: number | null;
  reservation_date: string;
  reservation_time: string;
  status?: string | null;
  bookable_item_id?: string | null;
  bookable_item_name?: string | null;
  special_request?: string | null;
};

type LayoutItem = {
  id: string;
  item_name?: string | null;
  item_type?: string | null;
  capacity_max?: number | null;
  capacity?: number | null;
  layout_x?: number | null;
  layout_y?: number | null;
  layout_width?: number | null;
  layout_height?: number | null;
  status?: string | null;
};

type WaitlistItem = {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  party_size?: number | null;
  status?: string | null;
  estimated_wait_minutes?: number | null;
  created_at?: string | null;
};

type LiveData = {
  locations: LocationOption[];
  reservations: Reservation[];
  waitlist: WaitlistItem[];
  items: LayoutItem[];
};

const todayKey = () => new Date().toISOString().split("T")[0];

function formatTime(value?: string | null) {
  const clean = String(value || "00:00").slice(0, 5);
  const [hourRaw, minute = "00"] = clean.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return clean;
  return `${hour % 12 || 12}:${minute.padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function normalizeStatus(status?: string | null) {
  return String(status || "pending").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function statusTone(status?: string | null) {
  const value = String(status || "pending");
  if (["arrived", "seated", "occupied"].includes(value)) return "border-sky-300/30 bg-sky-400/10 text-sky-100";
  if (value === "completed") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (["cancelled", "declined", "no_show"].includes(value)) return "border-red-300/30 bg-red-400/10 text-red-100";
  if (value === "confirmed") return "border-amber-200/30 bg-amber-300/10 text-amber-100";
  return "border-white/10 bg-white/10 text-white/70";
}

export default function AdminReserveLiveClient() {
  const [date, setDate] = useState(todayKey());
  const [live, setLive] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LocationOption | null>(null);
  const [data, setData] = useState<LiveData>({ locations: [], reservations: [], waitlist: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const filteredLocations = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return data.locations.slice(0, 24);
    return data.locations.filter((location) => {
      return [location.name, location.city, location.state, location.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    }).slice(0, 40);
  }, [data.locations, search]);

  const stats = useMemo(() => {
    const reservations = data.reservations;
    const active = reservations.filter((r) => ["pending", "confirmed", "arrived", "seated", "occupied"].includes(String(r.status || "pending")));
    const seated = reservations.filter((r) => ["arrived", "seated", "occupied"].includes(String(r.status || ""))).length;
    const completed = reservations.filter((r) => r.status === "completed").length;
    const noShow = reservations.filter((r) => r.status === "no_show").length;
    const capacity = data.items.reduce((sum, item) => sum + Number(item.capacity || item.capacity_max || 2), 0);
    const occupied = active.reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0);
    const occupancy = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
    return { total: reservations.length, active: active.length, seated, completed, noShow, occupancy, waitlist: data.waitlist.length };
  }, [data]);

  async function load(location = selected) {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ date });
      if (location?.id) {
        params.set("locationId", location.id);
        params.set("type", location.type);
      }
      const response = await fetch(`/api/reserve/portal/layout?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load live reserve data.");
      setData({
        locations: result.locations || [],
        reservations: result.reservations || [],
        waitlist: result.waitlist || [],
        items: result.items || [],
      });
      if (!location && !selected && result.locations?.[0]) setSelected(result.locations[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load live reserve data.");
    } finally {
      setLoading(false);
    }
  }

  async function updateReservation(reservation: Reservation, status: string) {
    try {
      setUpdating(`${reservation.id}-${status}`);
      setError("");
      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_reservation_status", reservation_id: reservation.id, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update reservation.");
      await load(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update reservation.");
    } finally {
      setUpdating("");
    }
  }

  async function notifyWaitlist(item: WaitlistItem) {
    try {
      setUpdating(`waitlist-${item.id}`);
      const response = await fetch("/api/reserve/portal/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify_waitlist", waitlist_id: item.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to notify waitlist guest.");
      await load(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to notify waitlist guest.");
    } finally {
      setUpdating("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load(selected);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selected?.id, selected?.type]);

  useEffect(() => {
    if (!live || !selected?.id) return;
    const channel = supabase
      .channel(`admin-reserve-live-${selected.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_reservations", filter: `location_id=eq.${selected.id}` }, () => load(selected))
      .on("postgres_changes", { event: "*", schema: "public", table: "reservation_waitlist", filter: `location_id=eq.${selected.id}` }, () => load(selected))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, selected?.id]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070304] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_10%,rgba(225,6,42,0.34),transparent_32%),linear-gradient(135deg,#1a080b,#070304_62%,#130d09)] p-5 shadow-2xl sm:p-7">
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-red-300">Admin-wide Reserve</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Live Operations Command</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-white/60">
                Search every location, open its live floor, and operate reservations, waitlist, occupancy, and hostess actions from one premium admin view.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
              <label className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none" />
              </label>
              <button onClick={() => setLive((v) => !v)} className={`rounded-2xl border p-4 text-left text-sm font-black ${live ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/50"}`}>
                {live ? "Live updates on" : "Live updates off"}
              </button>
              <button onClick={() => load(selected)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-black transition hover:bg-red-100">
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>
        </section>

        {error && <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm font-bold text-red-100">{error}</div>}

        <section className="mt-5 grid gap-5 xl:grid-cols-[340px_1fr]">
          <aside className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl backdrop-blur-xl xl:sticky xl:top-4 xl:self-start">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all locations..." className="w-full rounded-full border border-white/10 bg-black/35 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-red-300/50" />
            </div>
            <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {filteredLocations.map((location) => (
                <button key={`${location.type}-${location.id}`} onClick={() => setSelected(location)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === location.id ? "border-red-300/40 bg-red-500/15" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}>
                  <p className="truncate text-sm font-black text-white">{location.name}</p>
                  <p className="mt-1 text-xs font-bold text-white/45">{[location.city, location.state].filter(Boolean).join(", ") || location.type} · {location.type}</p>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric icon={<CalendarDays size={18} />} label="Reservations" value={stats.total} />
              <Metric icon={<Clock3 size={18} />} label="Active" value={stats.active} />
              <Metric icon={<Users size={18} />} label="Occupancy" value={`${stats.occupancy}%`} />
              <Metric icon={<ShieldCheck size={18} />} label="Seated" value={stats.seated} />
              <Metric icon={<CheckCircle2 size={18} />} label="Completed" value={stats.completed} />
              <Metric icon={<XCircle size={18} />} label="No-show" value={stats.noShow} />
            </section>

            <section className="grid gap-5 2xl:grid-cols-[1fr_420px]">
              <div className="rounded-[2rem] border border-white/10 bg-[#100709] p-5 shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">Live Floor Map</p>
                    <h2 className="mt-2 text-2xl font-black">{selected?.name || "Select a location"}</h2>
                  </div>
                  <Link href="/reserve/dashboard/layout" className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/65 hover:bg-white hover:text-black">Open layout builder</Link>
                </div>
                <div className="mt-5 grid min-h-[430px] grid-cols-2 gap-3 rounded-[1.5rem] border border-white/10 bg-black/35 p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {data.items.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center text-center text-white/45">
                      <LayoutGrid size={42} />
                      <p className="mt-3 text-sm font-bold">No layout items yet. Use layout builder to add tables, rooms, lanes, or stations.</p>
                    </div>
                  ) : data.items.map((item) => (
                    <div key={item.id} className={`rounded-2xl border p-4 ${statusTone(item.status)}`}>
                      <p className="text-xs font-black uppercase tracking-[0.18em] opacity-60">{item.item_type || "Table"}</p>
                      <p className="mt-2 text-lg font-black">{item.item_name || "Item"}</p>
                      <p className="mt-1 text-xs font-bold opacity-70">Cap. {item.capacity || item.capacity_max || 2} · {normalizeStatus(item.status)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <Panel title="Waitlist" subtitle={`${stats.waitlist} waiting/notified guests`}>
                  {data.waitlist.length === 0 ? <Empty label="No active waitlist guests." /> : data.waitlist.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{item.customer_name}</p>
                          <p className="mt-1 text-xs font-bold text-white/45">Party {item.party_size || 2} · {normalizeStatus(item.status)} · {item.estimated_wait_minutes || "—"} min</p>
                        </div>
                        <button onClick={() => notifyWaitlist(item)} disabled={updating === `waitlist-${item.id}`} className="rounded-full bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Bell size={14} /></button>
                      </div>
                    </div>
                  ))}
                </Panel>
              </div>
            </section>

            <Panel title="Reservation Panel" subtitle="Seat, complete, move, cancel, or mark no-show in operator mode.">
              {loading ? <Empty label="Loading live reservations..." /> : data.reservations.length === 0 ? <Empty label="No reservations found for this date/location." /> : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.reservations.map((reservation) => (
                    <article key={reservation.id} className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-black">{reservation.customer_name || "Guest"}</p>
                          <p className="mt-1 text-xs font-bold text-white/45">{formatTime(reservation.reservation_time)} · Party {reservation.party_size || 2} · {reservation.bookable_item_name || "Unassigned"}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(reservation.status)}`}>{normalizeStatus(reservation.status)}</span>
                      </div>
                      {reservation.special_request && <p className="mt-3 rounded-2xl bg-black/25 p-3 text-xs font-semibold leading-5 text-white/55">{reservation.special_request}</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Action label="Seat" busy={updating === `${reservation.id}-seated`} onClick={() => updateReservation(reservation, "seated")} />
                        <Action label="Complete" busy={updating === `${reservation.id}-completed`} onClick={() => updateReservation(reservation, "completed")} />
                        <Action label="Cancel" busy={updating === `${reservation.id}-cancelled`} onClick={() => updateReservation(reservation, "cancelled")} />
                        <Action label="No-show" busy={updating === `${reservation.id}-no_show`} onClick={() => updateReservation(reservation, "no_show")} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
      <div className="flex items-center gap-2 text-red-200">{icon}<span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{label}</span></div>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#100709] p-5 shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">{title}</p>
      <p className="mt-2 text-sm font-bold text-white/45">{subtitle}</p>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm font-bold text-white/40">{label}</div>;
}

function Action({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={busy} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/70 transition hover:bg-white hover:text-black disabled:opacity-50">{busy ? "..." : label}</button>;
}
