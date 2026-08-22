"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
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
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  deposit_status?: string | null;
};

function formatStatus(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(time: string) {
  const clean = String(time || "").slice(0, 5);
  const [hourRaw, minute] = clean.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return clean;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export default function ReservationConfirmationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = String(params.token || "");
  const depositResult = searchParams.get("deposit");

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  async function loadReservation() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/reserve/confirmation?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load reservation.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update reservation.");
      setReservation(data.reservation);
    } catch (err: any) {
      setError(err?.message || "Unable to update reservation.");
    } finally {
      setActing("");
    }
  }

  async function handleDeposit() {
    if (!reservation) return;
    try {
      setActing("deposit");
      setError("");
      const response = await fetch("/api/reservations/create-deposit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: reservation.id, customer_token: token }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkout_url) throw new Error(data.error || "Unable to start deposit payment.");
      window.location.assign(data.checkout_url);
    } catch (err: any) {
      setError(err?.message || "Unable to start deposit payment.");
      setActing("");
    }
  }

  useEffect(() => {
    if (token) loadReservation();
  }, [token]);

  const isCancelled = reservation?.status === "cancelled";
  const isCustomerConfirmed = Boolean(reservation?.customer_confirmed_at);
  const depositRequired = Boolean(reservation?.deposit_required && Number(reservation?.deposit_amount || 0) > 0);
  const depositPaid = reservation?.deposit_status === "paid";

  const rescheduleHref = reservation
    ? `/reserve/location/${reservation.location_id}?type=${reservation.location_type}&rescheduleToken=${token}&date=${reservation.reservation_date}&partySize=${reservation.party_size}`
    : "/create";
  const calendarHref = reservation ? `/api/reserve/calendar/${reservation.id}` : "#";
  const googleCalendarHref = reservation
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`TheOutHaven reservation${reservation.bookable_item_name ? `: ${reservation.bookable_item_name}` : ""}`)}&details=${encodeURIComponent(`Reservation for ${reservation.customer_name}, party of ${reservation.party_size}.`)}&dates=${reservation.reservation_date.replaceAll("-", "")}T${reservation.reservation_time.slice(0, 5).replace(":", "")}00/${reservation.reservation_date.replaceAll("-", "")}T${reservation.reservation_time.slice(0, 5).replace(":", "")}00`
    : "#";

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-black pt-24 text-white">
        <section className="relative overflow-hidden px-5 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.35),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(127,29,29,0.35),transparent_28%),#000]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/85 to-black" />
          <div className="relative z-10 mx-auto max-w-3xl">
            <Link href="/create" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black">
              <ArrowLeft size={16} /> Back to TheOutHaven
            </Link>

            <div className="mt-8 rounded-[2.5rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              {loading ? (
                <div className="flex min-h-[420px] items-center justify-center text-center">
                  <div><Loader2 className="mx-auto animate-spin text-red-400" /><p className="mt-4 text-sm font-bold text-white/60">Loading reservation...</p></div>
                </div>
              ) : error && !reservation ? (
                <div className="flex min-h-[420px] items-center justify-center text-center">
                  <div><XCircle className="mx-auto text-red-400" size={52} /><h1 className="mt-5 text-3xl font-black">Reservation not found</h1><p className="mt-3 text-sm text-white/55">{error}</p></div>
                </div>
              ) : reservation ? (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">TheOutHaven Reserve</p>
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Manage Reservation</h1>
                      <p className="mt-3 text-sm leading-7 text-white/60">View your reservation details, pay any required deposit, confirm attendance, cancel, or reschedule.</p>
                    </div>
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide ${isCancelled ? "bg-red-500/15 text-red-200" : reservation.status === "confirmed" ? "bg-emerald-500/15 text-emerald-200" : "bg-yellow-500/15 text-yellow-100"}`}>
                      <ShieldCheck size={14} /> {formatStatus(reservation.status)}
                    </span>
                  </div>

                  {depositResult === "success" ? (
                    <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">Payment submitted successfully. Stripe is confirming the payment now; this page will show Paid after the webhook finishes.</div>
                  ) : depositResult === "cancelled" ? (
                    <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-100">Deposit checkout was cancelled. Your reservation remains unchanged.</div>
                  ) : null}

                  {error ? <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div> : null}

                  <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/35 p-5">
                    <h2 className="text-2xl font-black">Hi, {reservation.customer_name}</h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <InfoCard icon={<CalendarDays size={18} />} label="Date" value={reservation.reservation_date} />
                      <InfoCard icon={<Clock size={18} />} label="Time" value={formatTime(reservation.reservation_time)} />
                      <InfoCard icon={<Users size={18} />} label="Party" value={`${reservation.party_size} guests`} />
                    </div>

                    {reservation.bookable_item_name ? <Detail label="Reserved" value={reservation.bookable_item_name} /> : null}
                    {reservation.special_request ? <Detail label="Special Request" value={reservation.special_request} /> : null}

                    {depositRequired ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Reservation Deposit</p>
                            <p className="mt-2 text-2xl font-black">{money(reservation.deposit_amount)}</p>
                            <p className={`mt-1 text-xs font-black uppercase tracking-wide ${depositPaid ? "text-emerald-300" : "text-yellow-200"}`}>{depositPaid ? "Paid" : formatStatus(reservation.deposit_status || "required")}</p>
                          </div>
                          {!depositPaid && !isCancelled ? (
                            <button type="button" disabled={Boolean(acting)} onClick={handleDeposit} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                              {acting === "deposit" ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                              Pay Deposit Securely
                            </button>
                          ) : <CheckCircle2 className="text-emerald-300" size={32} />}
                        </div>
                        {!depositPaid ? <p className="mt-3 text-xs leading-5 text-white/40">Payment is completed on Stripe’s secure checkout page. Your reservation is confirmed only after Stripe reports the payment successful.</p> : null}
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Add to Calendar</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <a href={googleCalendarHref} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-3 text-center text-xs font-black text-black">Google Calendar</a>
                        <a href={calendarHref} className="rounded-full bg-white/10 px-4 py-3 text-center text-xs font-black text-white">Apple Calendar</a>
                        <a href={calendarHref} className="rounded-full bg-white/10 px-4 py-3 text-center text-xs font-black text-white">Outlook</a>
                      </div>
                    </div>
                  </div>

                  {isCancelled ? (
                    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center"><XCircle className="mx-auto text-red-300" size={34} /><p className="mt-3 font-black text-red-100">This reservation has been cancelled.</p></div>
                  ) : isCustomerConfirmed ? (
                    <>
                      <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center"><CheckCircle2 className="mx-auto text-emerald-300" size={34} /><p className="mt-3 font-black text-emerald-100">You confirmed this reservation.</p></div>
                      <div className="mt-6"><Link href={rescheduleHref} className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-4 text-sm font-black text-white transition hover:bg-red-500"><RefreshCw size={18} /> Reschedule Reservation</Link></div>
                    </>
                  ) : (
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <Link href={rescheduleHref} className="flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-4 text-sm font-black text-white transition hover:bg-red-500"><RefreshCw size={18} /> Reschedule</Link>
                      <button type="button" disabled={Boolean(acting)} onClick={() => handleAction("confirm")} className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:opacity-50">{acting === "confirm" ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Confirm</button>
                      <button type="button" disabled={Boolean(acting)} onClick={() => handleAction("cancel")} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-6 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black disabled:opacity-50">{acting === "cancel" ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />} Cancel</button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="text-red-300">{icon}</div><p className="mt-3 text-xs font-black uppercase tracking-[0.25em] text-white/35">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">{label}</p><p className="mt-2 text-sm leading-7 text-white/70">{value}</p></div>;
}
