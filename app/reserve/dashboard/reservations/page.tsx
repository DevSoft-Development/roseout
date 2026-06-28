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
import AdminActingAsLocationBanner from "@/components/admin/AdminActingAsLocationBanner";
import AdminLocationSearch from "@/components/admin/AdminLocationSearch";
import { supabase } from "@/lib/supabase";
import ReserveShell from "@/components/reserve/ReserveShell";
import ReservePageHeader from "@/components/reserve/ReservePageHeader";
import ReserveMetricCard from "@/components/reserve/ReserveMetricCard";
import ReserveTabs from "@/components/reserve/ReserveTabs";
import ReserveEmptyState from "@/components/reserve/ReserveEmptyState";
import ReservationTimelineTable from "@/components/reserve/ReservationTimelineTable";

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "arrived"
  | "seated"
  | "waitlisted"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

type Reservation = {
  id: string;
  location_id: string;
  location_type: string;
  reservable_item_name: string | null;
  reservable_item_type: string | null;
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
  duration_minutes?: number | null;
  default_duration_minutes?: number | null;
  reservation_duration_minutes?: number | null;
  turn_time_minutes?: number | null;
};

const statuses: ReservationStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "arrived",
  "seated",
  "completed",
  "waitlisted",
  "declined",
  "cancelled",
  "no_show",
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getInitialStatus(value: string | null): ReservationStatus | "all" {
  if (!value) return "all";

  return statuses.includes(value as ReservationStatus)
    ? (value as ReservationStatus)
    : "all";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Needs Action",
    confirmed: "Ready",
    checked_in: "Guest Here",
    arrived: "Guest Here",
    seated: "Seated",
    completed: "Finished",
    declined: "Closed",
    cancelled: "Closed",
    no_show: "Missed",
  };

  return labels[status] || status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function suggestedNextAction(status: ReservationStatus) {
  if (status === "pending") return "Suggested next action: confirm or decline this request.";
  if (status === "confirmed") return "Suggested next action: check guests in when they arrive.";
  if (status === "checked_in" || status === "arrived") return "Suggested next action: complete the visit or mark no-show if needed.";
  return "This reservation is closed and no action is needed.";
}

function formatDuration(minutes: number | null | undefined) {
  const value = Number(minutes || 90);
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  const hourText = hours === 1 ? "1 hour" : `${hours} hours`;
  return remainder ? `${hourText} ${remainder} minutes` : hourText;
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

  const adminLocationId = searchParams.get("adminLocationId") || "";
  const locationId = adminLocationId || searchParams.get("locationId") || "";
  const locationType = normalizeType(searchParams.get("type"));
  const fromDemoCenter = searchParams.get("fromDemoCenter") === "1";
  const demoMode = searchParams.get("demo") === "1" || fromDemoCenter;

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeStatus, setActiveStatus] = useState<ReservationStatus | "all">(
    getInitialStatus(searchParams.get("status"))
  );
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [adminSummary, setAdminSummary] = useState<any>(null);

  const filteredReservations = useMemo(() => {
    if (activeStatus === "all") return reservations;
    return reservations.filter((item) => item.status === activeStatus);
  }, [reservations, activeStatus]);

  const stats = useMemo(() => {
    const total = reservations.length;
    const confirmed = reservations.filter((r) => r.status === "confirmed").length;
    const arrived = reservations.filter((r) => r.status === "checked_in" || r.status === "arrived").length;
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

      const reservationParams = new URLSearchParams();

      if (locationId) {
        reservationParams.set("locationId", locationId);
        reservationParams.set("type", locationType);
        if (adminLocationId) reservationParams.set("adminLocationId", adminLocationId);
      }

      const filter = searchParams.get("filter");
      const status = searchParams.get("status");

      if (filter) reservationParams.set("filter", filter);
      if (status) reservationParams.set("status", status);

      const query = reservationParams.toString();
      const response = await fetch(
        `/api/reserve/portal/reservations${query ? `?${query}` : ""}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load reservations.");
      }

      setReservations(data.reservations || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to load reservations."));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(
    reservation: Reservation,
    status: ReservationStatus
  ) {
    const confirmMessages: Partial<Record<ReservationStatus, string>> = {
      declined: "Decline this reservation request?",
      cancelled: "Cancel this reservation?",
      no_show: "Mark this reservation as no-show?",
    };

    if (confirmMessages[status] && !window.confirm(confirmMessages[status])) return;

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
          adminLocationId: adminLocationId || undefined,
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Unable to update reservation."));
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadReservations();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, locationType, adminLocationId, searchParams]);

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


  useEffect(() => {
    if (!adminLocationId) {
      setAdminSummary(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/admin/locations/${adminLocationId}/summary`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error || "You do not have permission to access this location.");
          setAdminSummary(null);
          return;
        }
        setAdminSummary(data);
        try {
          localStorage.setItem("theouthaven_admin_selected_location_id", adminLocationId);
        } catch {}
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load admin location context.");
      });

    return () => {
      cancelled = true;
    };
  }, [adminLocationId]);

  return (
    <>
      <TheOutHavenHeader />

      {adminLocationId && (
        <AdminActingAsLocationBanner
          locationId={adminLocationId}
          locationName={adminSummary?.location?.name}
          locationType={adminSummary?.location?.location_type}
          plan={adminSummary?.location?.plan}
          reservationAccess={adminSummary?.reservationAccess?.plan}
        />
      )}

      <ReserveShell>
        <ReservePageHeader
          eyebrow="Host dashboard"
          title="Daily Reservation Flow"
          subtitle="Run today’s bookings, guest arrivals, seating, and exceptions without technical reports or raw data."
          actions={
            <>
              <Link href={fromDemoCenter ? "/admin/dashboard/settings/demo-center" : `/reserve/dashboard${locationId ? `?${new URLSearchParams({ ...(adminLocationId ? { adminLocationId } : {}), locationId, type: locationType, ...(demoMode ? { demo: "1" } : {}), ...(fromDemoCenter ? { fromDemoCenter: "1" } : {}) }).toString()}` : ""}`} className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white/75">Back</Link>
              <button onClick={loadReservations} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"><RefreshCw size={16} /> Refresh</button>
            </>
          }
        />

        {adminLocationId && (
          <AdminActingAsLocationBanner
            locationId={adminLocationId}
            locationName={adminSummary?.location?.name}
            locationType={adminSummary?.location?.location_type}
            plan={adminSummary?.location?.plan}
            reservationAccess={adminSummary?.reservationAccess?.plan}
          />
        )}

        {adminLocationId && <AdminLocationSearch compact />}

        {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div>}

        <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
          <ReserveMetricCard label="Needs action" value={stats.pending} />
          <ReserveMetricCard label="Ready" value={stats.confirmed} />
          <ReserveMetricCard label="Guest arrived" value={stats.arrived} />
          <ReserveMetricCard label="Finished" value={stats.completed} />
          <ReserveMetricCard label="Cancelled" value={stats.cancelled} />
          <ReserveMetricCard label="No-shows" value={stats.noShow} />
          <ReserveMetricCard label="Arrival rate" value={`${stats.arrivalRate}%`} />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">Working list</p>
              <h2 className="mt-1 text-2xl font-black">Reservations first</h2>
              <p className="mt-2 text-sm text-white/55">Filter by status, then use row actions for supported status changes. Message, resource assignment, and moving times stay disabled unless a safe backend endpoint exists.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/35" placeholder="Search guest / phone" disabled />
              <input className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white" type="date" disabled />
              <select className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white" disabled><option>All resources</option></select>
            </div>
          </div>
          <div className="mt-5"><ReserveTabs active={activeStatus} onChange={(value) => setActiveStatus(value as ReservationStatus | "all")} tabs={[{ label: "All", value: "all", count: stats.total }, ...statuses.map((status) => ({ label: statusLabel(status), value: status, count: reservations.filter((item) => item.status === status).length }))]} /></div>
          <div className="mt-5">
            {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-10 text-center text-sm font-bold text-white/55"><Loader2 className="mx-auto mb-3 animate-spin text-red-500" />Loading reservations...</div> : filteredReservations.length === 0 ? <ReserveEmptyState title="You’re all caught up." message="No reservations match this view. New bookings and changes will appear here automatically." /> : <ReservationTimelineTable reservations={filteredReservations} updatingId={updatingId} onPrimaryAction={(reservation, status) => updateStatus(reservation as Reservation, status as ReservationStatus)} onCancel={(reservation) => updateStatus(reservation as Reservation, "cancelled")} onNoShow={(reservation) => updateStatus(reservation as Reservation, "no_show")} />}
          </div>
        </section>
      </ReserveShell>
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
  const duration = formatDuration(
    reservation.duration_minutes ||
      reservation.default_duration_minutes ||
      reservation.reservation_duration_minutes ||
      reservation.turn_time_minutes,
  );
  const closedStatuses: ReservationStatus[] = ["completed", "declined", "cancelled", "no_show"];
  const isClosed = closedStatuses.includes(reservation.status);

  return (
    <div className="p-5">
      <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
                {statusLabel(reservation.status)}
              </span>
              {reservation.reservable_item_name ? (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-neutral-600">
                  Reserved area: {reservation.reservable_item_name}
                </span>
              ) : null}
            </div>

            <h3 className="mt-4 text-2xl font-extrabold">
              {reservation.customer_name || "Guest"}
            </h3>

            <div className="mt-3 grid gap-3 text-sm font-bold text-neutral-600 sm:grid-cols-2 xl:grid-cols-4">
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={16} className="text-red-600" />
                Date: {reservation.reservation_date}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock size={16} className="text-red-600" />
                Time: {formatTime(reservation.reservation_time)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Users size={16} className="text-red-600" />
                Guest count: {reservation.party_size}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock size={16} className="text-red-600" />
                Duration: {duration}
              </span>
            </div>

            <p className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700">
              {suggestedNextAction(reservation.status)}
            </p>

            <div className="mt-4 text-sm leading-7 text-neutral-600">
              {reservation.customer_phone && <p>Phone: {reservation.customer_phone}</p>}
              {reservation.customer_email && <p>Email: {reservation.customer_email}</p>}
              {reservation.reservable_item_type && <p>Area type: {reservation.reservable_item_type.replaceAll("_", " ")}</p>}
              {reservation.special_request && (
                <p className="mt-1 font-medium text-neutral-800">Request: {reservation.special_request}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:max-w-[430px] lg:justify-end">
            {reservation.status === "pending" ? (
              <>
                <ActionButton label="Confirm" icon={<Check size={15} />} disabled={updating} onClick={() => onUpdate(reservation, "confirmed")} />
                <ActionButton label="Decline" icon={<X size={15} />} disabled={updating} onClick={() => onUpdate(reservation, "declined")} />
              </>
            ) : null}

            {reservation.status === "confirmed" ? (
              <>
                <ActionButton label="Mark Arrived" disabled={updating} onClick={() => onUpdate(reservation, "checked_in")} />
                <ActionButton label="Cancel" disabled={updating} onClick={() => onUpdate(reservation, "cancelled")} />
              </>
            ) : null}

            {(reservation.status === "checked_in" || reservation.status === "arrived") ? (
              <>
                <ActionButton label="Complete" disabled={updating} onClick={() => onUpdate(reservation, "completed")} />
                <ActionButton label="No Show" disabled={updating} onClick={() => onUpdate(reservation, "no_show")} />
              </>
            ) : null}

            {isClosed ? (
              <span className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-black uppercase tracking-wide text-neutral-500">
                Closed — read only
              </span>
            ) : null}
          </div>
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