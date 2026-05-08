"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

type Reservation = {
  id: string;
  location_id: string;
  location_type: string;
  bookable_item_id: string | null;
  bookable_item_name: string | null;
  bookable_item_type: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  status: string;
  special_request: string | null;
  customer_confirmed_at: string | null;
  customer_cancelled_at: string | null;
};

function formatStatus(status: string) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export default function ReservationConfirmationPage() {
  const params = useParams();
  const token = String(params.token || "");

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  async function loadReservation() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/reserve/confirmation?token=${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load reservation.");
      }

      setReservation(data.reservation);
    } catch (err: any) {
      setError(err?.message || "Unable to load reservation.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "confirm" | "cancel") {
    try {
      setActing(action);
      setError("");

      const response = await fetch("/api/reserve/confirmation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update reservation.");
      }

      setReservation(data.reservation);
    } catch (err: any) {
      setError(err?.message || "Unable to update reservation.");
    } finally {
      setActing("");
    }
  }

  useEffect(() => {
    if (token) loadReservation();
  }, [token]);

  const isCancelled = reservation?.status === "cancelled";
  const isCustomerConfirmed = Boolean(reservation?.customer_confirmed_at);

  const rescheduleHref = reservation
    ? `/reserve/location/${reservation.location_id}?type=${
        reservation.location_type
      }&rescheduleToken=${token}&date=${reservation.reservation_date}&partySize=${
        reservation.party_size
      }&item=${reservation.bookable_item_id || ""}`
    : "/create";

  return (
    <>
      <TheOutHavenHeader />

      <main className="min-h-screen bg-black pt-24 text-white">
        <section className="relative overflow-hidden px-5 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.35),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(127,29,29,0.35),transparent_28%),#000]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/85 to-black" />

          <div className="relative z-10 mx-auto max-w-3xl">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
            >
              <ArrowLeft size={16} />
              Back to TheOutHaven
            </Link>

            <div className="mt-8 rounded-[2.5rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              {loading ? (
                <div className="flex min-h-[420px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto animate-spin text-red-400" />
                    <p className="mt-4 text-sm font-bold text-white/60">
                      Loading reservation...
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex min-h-[420px] items-center justify-center text-center">
                  <div>
                    <XCircle className="mx-auto text-red-400" size={52} />
                    <h1 className="mt-5 text-3xl font-black">
                      Reservation not found
                    </h1>
                    <p className="mt-3 text-sm text-white/55">{error}</p>
                  </div>
                </div>
              ) : reservation ? (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">
                    TheOutHaven Reserve
                  </p>

                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                        Manage Reservation
                      </h1>
                      <p className="mt-3 text-sm leading-7 text-white/60">
                        View your reservation details, confirm you’re attending,
                        cancel, or reschedule your booking.
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide ${
                        isCancelled
                          ? "bg-red-500/15 text-red-200"
                          : reservation.status === "confirmed"
                            ? "bg-emerald-500/15 text-emerald-200"
                            : "bg-yellow-500/15 text-yellow-100"
                      }`}
                    >
                      <ShieldCheck size={14} />
                      {formatStatus(reservation.status)}
                    </span>
                  </div>

                  <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/35 p-5">
                    <h2 className="text-2xl font-black">
                      Hi, {reservation.customer_name}
                    </h2>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <InfoCard
                        icon={<CalendarDays size={18} />}
                        label="Date"
                        value={reservation.reservation_date}
                      />

                      <InfoCard
                        icon={<Clock size={18} />}
                        label="Time"
                        value={formatTime(reservation.reservation_time)}
                      />

                      <InfoCard
                        icon={<Users size={18} />}
                        label="Party"
                        value={`${reservation.party_size} guests`}
                      />
                    </div>

                    {reservation.bookable_item_name && (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">
                          Reserved
                        </p>
                        <p className="mt-2 text-lg font-black text-white">
                          {reservation.bookable_item_name}
                        </p>
                      </div>
                    )}

                    {reservation.special_request && (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">
                          Special Request
                        </p>
                        <p className="mt-2 text-sm leading-7 text-white/70">
                          {reservation.special_request}
                        </p>
                      </div>
                    )}
                  </div>

                  {isCancelled ? (
                    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center">
                      <XCircle className="mx-auto text-red-300" size={34} />
                      <p className="mt-3 font-black text-red-100">
                        This reservation has been cancelled.
                      </p>
                    </div>
                  ) : isCustomerConfirmed ? (
                    <>
                      <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center">
                        <CheckCircle2
                          className="mx-auto text-emerald-300"
                          size={34}
                        />
                        <p className="mt-3 font-black text-emerald-100">
                          You confirmed this reservation.
                        </p>
                      </div>

                      <div className="mt-6">
                        <Link
                          href={rescheduleHref}
                          className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"
                        >
                          <RefreshCw size={18} />
                          Reschedule Reservation
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <Link
                        href={rescheduleHref}
                        className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"
                      >
                        <RefreshCw size={18} />
                        Reschedule
                      </Link>

                      <button
                        type="button"
                        disabled={Boolean(acting)}
                        onClick={() => handleAction("confirm")}
                        className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {acting === "confirm" ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={18} />
                        )}
                        Confirm
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(acting)}
                        onClick={() => handleAction("cancel")}
                        className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-6 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {acting === "cancel" ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <XCircle size={18} />
                        )}
                        Cancel
                      </button>
                    </div>
                  )}

                  <p className="mt-6 text-center text-xs leading-6 text-white/40">
                    Rescheduling opens a new reservation form with your current
                    details prefilled. After creating the new reservation, you
                    can cancel this one if needed.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="text-red-300">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.25em] text-white/35">
        {label}
      </p>
      <p className="mt-1 font-black text-white">{value}</p>
    </div>
  );
}