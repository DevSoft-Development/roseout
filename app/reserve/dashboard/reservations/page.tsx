"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

type LocationKind = "all" | "restaurant" | "activity";

type Reservation = {
  id: string;
  location_id: string;
  location_type: "restaurant" | "activity";
  location_name: string;
  location_city: string | null;
  location_state: string | null;
  bookable_item_name: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  special_request: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
};

type LocationSummary = {
  id: string;
  type: "restaurant" | "activity";
  name: string;
  city: string | null;
  state: string | null;
  total: number;
  pending: number;
  confirmed: number;
  nextReservation: string | null;
};

const statuses: ReservationStatus[] = [
  "pending",
  "confirmed",
  "arrived",
  "completed",
  "declined",
  "cancelled",
  "no_show",
];

function statusLabel(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatTime(time: string) {
  const clean = String(time || "").slice(0, 5);
  const [hourRaw, minute] = clean.split(":");
  const hour = Number(hourRaw);

  if (!Number.isFinite(hour)) return clean;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatLocationType(type: string) {
  return type === "activity" ? "Activity" : "Restaurant";
}

export default function ReserveDashboardReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [activeStatus, setActiveStatus] = useState<ReservationStatus | "all">(
    "all"
  );
  const [locationKind, setLocationKind] = useState<LocationKind>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const filteredReservations = useMemo(() => {
    if (activeStatus === "all") return reservations;
    return reservations.filter((item) => item.status === activeStatus);
  }, [reservations, activeStatus]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const pending = reservations.filter((r) => r.status === "pending").length;
    const confirmed = reservations.filter((r) => r.status === "confirmed").length;
    const arrived = reservations.filter((r) => r.status === "arrived").length;
    const completed = reservations.filter((r) => r.status === "completed").length;
    const cancelled = reservations.filter((r) => r.status === "cancelled").length;
    const noShow = reservations.filter((r) => r.status === "no_show").length;
    const restaurants = locations.filter((location) => location.type === "restaurant").length;
    const activities = locations.filter((location) => location.type === "activity").length;

    return { total, pending, confirmed, arrived, completed, cancelled, noShow, restaurants, activities };
  }, [reservations, locations]);

  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({ kind: locationKind });

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(
        `/api/reserve/dashboard/reservations?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load reservations.");
      }

      setReservations(data.reservations || []);
      setLocations(data.locations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [locationKind, search]);

  async function updateStatus(
    reservation: Reservation,
    status: ReservationStatus
  ) {
    try {
      setUpdatingId(reservation.id);
      setError("");

      const response = await fetch("/reserve/dashboard/reservations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: reservation.id,
          location_id: reservation.location_id,
          location_type: reservation.location_type,
          status,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update reservation.");
      }

      await loadReservations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update reservation.");
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReservations();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadReservations]);

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
                Reservations Command Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Bird’s-eye view of reservations across all restaurants and activities,
                with location filters and search for individual venues.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={loadReservations}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.02]"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <Link
                href="/reserve/dashboard"
                className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Back to Reserve
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            {error}
          </div>
        )}

        <section className="mt-5 grid gap-4 md:grid-cols-5">
          <Metric label="Reservations" value={stats.total} />
          <Metric label="Pending" value={stats.pending} />
          <Metric label="Confirmed" value={stats.confirmed} />
          <Metric label="Restaurants" value={stats.restaurants} />
          <Metric label="Activities" value={stats.activities} />
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <div className="grid gap-3 lg:grid-cols-[360px_1fr_auto] lg:items-center">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search location, customer, email, phone..."
                className="h-12 w-full rounded-full border border-white/10 bg-white/[0.07] pl-11 pr-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "restaurant", "activity"] as LocationKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setLocationKind(kind)}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
                    locationKind === kind
                      ? "border-rose-400 bg-rose-500 text-white"
                      : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {kind === "all" ? "All Locations" : `${kind}s`}
                </button>
              ))}
            </div>

            <p className="text-xs font-bold text-white/45">
              {locations.length} location{locations.length === 1 ? "" : "s"} shown
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Location Overview</h2>
              <p className="mt-1 text-sm text-white/45">
                Search or filter to narrow the bird’s-eye location list.
              </p>
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : locations.length === 0 ? (
            <EmptyState text="No matching locations found." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {locations.map((location) => (
                <div
                  key={`${location.type}-${location.id}`}
                  className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">{location.name}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-rose-200/70">
                        {formatLocationType(location.type)}
                      </p>
                      <p className="mt-2 text-sm text-white/45">
                        {[location.city, location.state].filter(Boolean).join(", ") || "No city listed"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
                      {location.total}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-white/[0.06] p-3">
                      <p className="text-white/40">Pending</p>
                      <p className="text-xl font-black">{location.pending}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.06] p-3">
                      <p className="text-white/40">Confirmed</p>
                      <p className="text-xl font-black">{location.confirmed}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-white/35">
                    Next: {location.nextReservation ? new Date(location.nextReservation).toLocaleString() : "No upcoming reservation"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white/45">
              Status Filters
            </p>
            <div className="mt-4 grid gap-2">
              <FilterButton
                label="All"
                count={reservations.length}
                active={activeStatus === "all"}
                onClick={() => setActiveStatus("all")}
              />
              {statuses.map((status) => (
                <FilterButton
                  key={status}
                  label={statusLabel(status)}
                  count={reservations.filter((item) => item.status === status).length}
                  active={activeStatus === status}
                  onClick={() => setActiveStatus(status)}
                />
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 bg-[#fffaf6] p-5">
              <div>
                <h2 className="text-xl font-black">
                  {activeStatus === "all" ? "All Reservations" : `${statusLabel(activeStatus)} Reservations`}
                </h2>
                <p className="mt-1 text-sm font-medium text-black/50">
                  {filteredReservations.length} reservation{filteredReservations.length === 1 ? "" : "s"} shown
                </p>
              </div>
            </div>

            {loading ? (
              <LoadingState dark />
            ) : filteredReservations.length === 0 ? (
              <EmptyState dark text="No matching reservations found." />
            ) : (
              <div className="divide-y divide-black/10">
                {filteredReservations.map((reservation) => (
                  <ReservationRow
                    key={reservation.id}
                    reservation={reservation}
                    updating={updatingId === reservation.id}
                    onUpdate={updateStatus}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function LoadingState({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-center">
      <div>
        <Loader2 className={`mx-auto animate-spin ${dark ? "text-rose-600" : "text-rose-300"}`} />
        <p className={`mt-4 text-sm font-bold ${dark ? "text-black/50" : "text-white/45"}`}>
          Loading reservations...
        </p>
      </div>
    </div>
  );
}

function EmptyState({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-center">
      <div>
        <CalendarDays className={`mx-auto ${dark ? "text-black/25" : "text-white/20"}`} size={44} />
        <p className={`mt-4 text-lg font-black ${dark ? "text-black" : "text-white"}`}>{text}</p>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-rose-500 bg-rose-600 text-white"
          : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="text-sm font-extrabold">{label}</span>
      <span className={`rounded-full px-2 py-1 text-xs font-black ${active ? "bg-white/20 text-white" : "bg-white/10 text-white/70"}`}>
        {count}
      </span>
    </button>
  );
}

function ReservationRow({
  reservation,
  updating,
  onUpdate,
}: {
  reservation: Reservation;
  updating: boolean;
  onUpdate: (reservation: Reservation, status: ReservationStatus) => void;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-5 lg:flex-row">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
              {statusLabel(reservation.status)}
            </span>
            <span className="rounded-full bg-black px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
              {formatLocationType(reservation.location_type)}
            </span>
            <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-black uppercase tracking-wide text-black/60">
              {reservation.location_name}
            </span>
            {reservation.bookable_item_name && (
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-black uppercase tracking-wide text-black/60">
                {reservation.bookable_item_name}
              </span>
            )}
          </div>

          <h3 className="mt-4 text-2xl font-extrabold">
            {reservation.customer_name || "Guest"}
          </h3>

          <div className="mt-3 grid gap-3 text-sm font-bold text-black/60 sm:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <CalendarDays size={16} className="text-rose-600" />
              {reservation.reservation_date}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock size={16} className="text-rose-600" />
              {formatTime(reservation.reservation_time)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Users size={16} className="text-rose-600" />
              {reservation.party_size} guests
            </span>
          </div>

          <div className="mt-4 text-sm leading-7 text-black/60">
            {reservation.customer_phone && <p>Phone: {reservation.customer_phone}</p>}
            {reservation.customer_email && <p>Email: {reservation.customer_email}</p>}
            {[reservation.location_city, reservation.location_state].filter(Boolean).length > 0 && (
              <p>Location: {[reservation.location_city, reservation.location_state].filter(Boolean).join(", ")}</p>
            )}
            {reservation.special_request && (
              <p className="mt-1 font-medium text-black">
                Request: {reservation.special_request}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:max-w-[430px] lg:justify-end">
          <ActionButton label="Confirm" icon={<Check size={15} />} disabled={updating} onClick={() => onUpdate(reservation, "confirmed")} />
          <ActionButton label="Arrived" disabled={updating} onClick={() => onUpdate(reservation, "arrived")} />
          <ActionButton label="Completed" disabled={updating} onClick={() => onUpdate(reservation, "completed")} />
          <ActionButton label="Decline" icon={<X size={15} />} disabled={updating} onClick={() => onUpdate(reservation, "declined")} />
          <ActionButton label="No Show" disabled={updating} onClick={() => onUpdate(reservation, "no_show")} />
          <ActionButton label="Cancel" disabled={updating} onClick={() => onUpdate(reservation, "cancelled")} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-black/70 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
