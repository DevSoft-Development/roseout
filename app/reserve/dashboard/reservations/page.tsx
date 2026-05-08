"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { supabase } from "@/lib/supabase";

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

type Reservation = {
  id: string;
  location_id: string;
  location_type: string;
  bookable_item_name: string | null;
  bookable_item_type: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  special_request: string | null;
  created_at: string;
  arrived_at?: string | null;
  completed_at?: string | null;
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

function normalizeType(value: string | null) {
  const type = String(value || "restaurant").toLowerCase();
  if (type === "activities") return "activity";
  return type || "restaurant";
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

export default function ReservePortalReservationsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black p-10 text-white">
          Loading reservations...
        </main>
      }
    >
      <ReservePortalReservationsContent />
    </Suspense>
  );
}

function ReservePortalReservationsContent() {
  const searchParams = useSearchParams();

  const locationId = searchParams.get("locationId") || "";
  const locationType = normalizeType(searchParams.get("type"));

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeStatus, setActiveStatus] = useState<ReservationStatus | "all">(
    "pending"
  );
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const filteredReservations = useMemo(() => {
    if (activeStatus === "all") return reservations;
    return reservations.filter((item) => item.status === activeStatus);
  }, [reservations, activeStatus]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter((r) => r.status === "confirmed").length;
    const arrived = reservations.filter((r) => r.status === "arrived").length;
    const completed = reservations.filter((r) => r.status === "completed").length;
    const cancelled = reservations.filter((r) => r.status === "cancelled").length;
    const noShow = reservations.filter((r) => r.status === "no_show").length;
    const pending = reservations.filter((r) => r.status === "pending").length;

    const arrivalRate =
      total > 0 ? Math.round(((arrived + completed) / total) * 100) : 0;

    const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;

    return {
      total,
      pending,
      confirmed,
      arrived,
      completed,
      cancelled,
      noShow,
      arrivalRate,
      noShowRate,
    };
  }, [reservations]);

  async function loadReservations() {
    try {
      setLoading(true);
      setError("");

      if (!locationId) {
        throw new Error("Missing locationId in the URL.");
      }

      const response = await fetch(
        `/api/reserve/portal/reservations?locationId=${locationId}&type=${locationType}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load reservations.");
      }

      setReservations(data.reservations || []);
    } catch (err: any) {
      setError(err?.message || "Unable to load reservations.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(
    reservation: Reservation,
    status: ReservationStatus
  ) {
    try {
      setUpdatingId(reservation.id);
      setError("");

      const response = await fetch("/api/reserve/portal/reservations/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      setReservations((prev) =>
        prev.map((item) =>
          item.id === reservation.id ? data.reservation : item
        )
      );
    } catch (err: any) {
      setError(err?.message || "Unable to update reservation.");
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, locationType]);

  useEffect(() => {
    if (!locationId) return;

    const channel = supabase
      .channel(`reserve-portal-${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "location_reservations",
          filter: `location_id=eq.${locationId}`,
        },
        () => {
          loadReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  return (
    <>
      <TheOutHavenHeader />

      <main className="min-h-screen bg-black pt-24 text-white">
        <section className="relative overflow-hidden px-5 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.35),transparent_30%),#000]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/85 to-black" />

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
              >
                <ArrowLeft size={16} />
                Back
              </Link>

              <button
                onClick={loadReservations}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>

            <div className="mt-8">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
                TheOutHaven Reserve Portal
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
                Reservation Command Center
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">
                Track incoming bookings, arrival quality, completed visits,
                cancellations, and no-shows in realtime.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">
                {error}
              </div>
            )}

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-[2rem] bg-white p-6 text-black">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Reservation Overview
                    </p>
                    <h2 className="mt-2 text-4xl font-extrabold">
                      {stats.total} total reservations
                    </h2>
                    <p className="mt-2 text-sm font-medium text-neutral-500">
                      Live activity for this location.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black px-5 py-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
                      Arrival Rate
                    </p>
                    <p className="mt-1 text-3xl font-extrabold">
                      {stats.arrivalRate}%
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid gap-4 md:grid-cols-4">
                  <MiniMetric label="Pending" value={stats.pending} />
                  <MiniMetric label="Confirmed" value={stats.confirmed} />
                  <MiniMetric label="Arrived" value={stats.arrived} />
                  <MiniMetric label="Completed" value={stats.completed} />
                </div>
              </div>

              <div className="rounded-[2rem] bg-gradient-to-br from-red-700 via-red-600 to-black p-6 text-white">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">
                  Today’s Focus
                </p>

                <h2 className="mt-2 text-5xl font-extrabold">
                  {stats.pending}
                </h2>

                <p className="mt-2 text-sm font-semibold text-white/65">
                  Pending reservations need attention.
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <DarkMetric label="No-Shows" value={String(stats.noShow)} />
                  <DarkMetric label="No-Show Rate" value={`${stats.noShowRate}%`} />
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

                  <TrendingUp className="text-red-600" size={28} />
                </div>

                <div className="mt-6 space-y-4">
                  <PipelineRow
                    label="Pending"
                    value={stats.pending}
                    total={stats.total}
                  />
                  <PipelineRow
                    label="Confirmed"
                    value={stats.confirmed}
                    total={stats.total}
                  />
                  <PipelineRow
                    label="Arrived"
                    value={stats.arrived}
                    total={stats.total}
                  />
                  <PipelineRow
                    label="Completed"
                    value={stats.completed}
                    total={stats.total}
                  />
                  <PipelineRow
                    label="Cancelled"
                    value={stats.cancelled}
                    total={stats.total}
                  />
                  <PipelineRow
                    label="No Shows"
                    value={stats.noShow}
                    total={stats.total}
                  />
                </div>
              </div>

              <div className="rounded-[2rem] bg-white p-6 text-black">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Quick Filters
                </p>

                <h2 className="mt-3 text-2xl font-extrabold">
                  View reservations
                </h2>

                <div className="mt-5 grid gap-3">
                  <FilterButton
                    label="All"
                    count={stats.total}
                    active={activeStatus === "all"}
                    onClick={() => setActiveStatus("all")}
                  />

                  {statuses.map((status) => (
                    <FilterButton
                      key={status}
                      label={statusLabel(status)}
                      count={
                        reservations.filter((item) => item.status === status)
                          .length
                      }
                      active={activeStatus === status}
                      onClick={() => setActiveStatus(status)}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-8 overflow-hidden rounded-[2rem] bg-white text-black">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 p-5">
                <div>
                  <h2 className="text-xl font-bold">
                    {activeStatus === "all"
                      ? "All Reservations"
                      : `${statusLabel(activeStatus)} Reservations`}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {filteredReservations.length} reservation
                    {filteredReservations.length === 1 ? "" : "s"} shown
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto animate-spin text-red-600" />
                    <p className="mt-4 text-sm font-bold text-neutral-500">
                      Loading reservations...
                    </p>
                  </div>
                </div>
              ) : filteredReservations.length === 0 ? (
                <div className="flex min-h-[300px] items-center justify-center text-center">
                  <div>
                    <CalendarDays className="mx-auto text-neutral-300" size={44} />
                    <h2 className="mt-4 text-2xl font-black">
                      No reservations found.
                    </h2>
                    <p className="mt-2 text-sm text-neutral-500">
                      New TheOutHaven Reserve requests will appear here in realtime.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-neutral-200">
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
            </section>
          </div>
        </section>
      </main>
    </>
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
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-neutral-200 bg-neutral-50 text-black hover:bg-neutral-100"
      }`}
    >
      <span className="text-sm font-extrabold">{label}</span>
      <span
        className={`rounded-full px-2 py-1 text-xs font-black ${
          active ? "bg-white/20 text-white" : "bg-white text-neutral-700"
        }`}
      >
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
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
              {statusLabel(reservation.status)}
            </span>

            {reservation.bookable_item_name && (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-neutral-600">
                {reservation.bookable_item_name}
              </span>
            )}
          </div>

          <h3 className="mt-4 text-2xl font-extrabold">
            {reservation.customer_name}
          </h3>

          <div className="mt-3 grid gap-3 text-sm font-bold text-neutral-600 sm:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <CalendarDays size={16} className="text-red-600" />
              {reservation.reservation_date}
            </span>

            <span className="inline-flex items-center gap-2">
              <Clock size={16} className="text-red-600" />
              {formatTime(reservation.reservation_time)}
            </span>

            <span className="inline-flex items-center gap-2">
              <Users size={16} className="text-red-600" />
              {reservation.party_size} guests
            </span>
          </div>

          <div className="mt-4 text-sm leading-7 text-neutral-600">
            {reservation.customer_phone && (
              <p>Phone: {reservation.customer_phone}</p>
            )}
            {reservation.customer_email && (
              <p>Email: {reservation.customer_email}</p>
            )}
            {reservation.arrived_at && (
              <p>
                Arrived: {new Date(reservation.arrived_at).toLocaleString()}
              </p>
            )}
            {reservation.completed_at && (
              <p>
                Completed:{" "}
                {new Date(reservation.completed_at).toLocaleString()}
              </p>
            )}
            {reservation.special_request && (
              <p className="mt-1 font-medium text-neutral-800">
                Request: {reservation.special_request}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:max-w-[430px] lg:justify-end">
          <ActionButton
            label="Confirm"
            icon={<Check size={15} />}
            disabled={updating}
            onClick={() => onUpdate(reservation, "confirmed")}
          />

          <ActionButton
            label="Arrived"
            disabled={updating}
            onClick={() => onUpdate(reservation, "arrived")}
          />

          <ActionButton
            label="Completed"
            disabled={updating}
            onClick={() => onUpdate(reservation, "completed")}
          />

          <ActionButton
            label="Decline"
            icon={<X size={15} />}
            disabled={updating}
            onClick={() => onUpdate(reservation, "declined")}
          />

          <ActionButton
            label="No Show"
            disabled={updating}
            onClick={() => onUpdate(reservation, "no_show")}
          />

          <ActionButton
            label="Cancel"
            disabled={updating}
            onClick={() => onUpdate(reservation, "cancelled")}
          />
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
      className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-neutral-700 transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}