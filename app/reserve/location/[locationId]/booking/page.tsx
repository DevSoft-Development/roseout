"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

type LocationData = {
  id: string;
  name: string;
  address?: string;
  category?: string;
  main_image?: string | null;
  image_url?: string | null;
};
type Item = { available_slots?: { time: string; label: string }[] };
type ReservationPrefill = {
  location_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  special_request?: string | null;
  notes?: string | null;
};

function formatTime(time: string) {
  const [hourRaw, minute = "00"] = String(time || "").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return time;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function ReservationBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locationId = String(params.locationId || "");
  const locationType = searchParams.get("type") || "restaurant";
  const date = searchParams.get("date") || "";
  const time = searchParams.get("time") || "";
  const partySize = Number(searchParams.get("partySize") || 2);
  const rescheduleToken = searchParams.get("rescheduleToken") || "";

  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [slotStillAvailable, setSlotStillAvailable] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const backQuery = useMemo(() => {
    const query = new URLSearchParams({
      type: locationType,
      date,
      partySize: String(partySize),
      time,
    });
    if (rescheduleToken) query.set("rescheduleToken", rescheduleToken);
    return query.toString();
  }, [date, locationType, partySize, rescheduleToken, time]);

  useEffect(() => {
    if (!locationId || !date || !time) {
      setError("Choose a reservation date and time before continuing.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError("");
        const query = new URLSearchParams({
          locationId,
          type: locationType,
          reservationDate: date,
          partySize: String(partySize),
        });
        const response = await fetch(`/api/reserve/location?${query.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to verify this reservation time.");
        const items = (data.items || []) as Item[];
        const available = items.some((item) => (item.available_slots || []).some((slot) => slot.time === time));
        setLocation(data.location || null);
        setSlotStillAvailable(available);
        if (!available) {
          setError("That time is no longer available. Choose another time to continue.");
        }
      } catch (err: any) {
        setError(err?.message || "Unable to verify this reservation time.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [date, locationId, locationType, partySize, time]);

  useEffect(() => {
    if (!rescheduleToken || !locationId) return;
    async function prefill() {
      try {
        const response = await fetch(`/api/reserve/confirmation?token=${encodeURIComponent(rescheduleToken)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load your reservation details.");
        const reservation = (data.reservation || {}) as ReservationPrefill;
        if (reservation.location_id && String(reservation.location_id) !== locationId) {
          throw new Error("This reservation link does not match this location.");
        }
        setName(String(reservation.customer_name || ""));
        setEmail(String(reservation.customer_email || ""));
        setPhone(String(reservation.customer_phone || ""));
        setNotes(String(reservation.special_request || reservation.notes || ""));
      } catch (err: any) {
        setError(err?.message || "Unable to load your reservation details.");
      }
    }
    void prefill();
  }, [locationId, rescheduleToken]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slotStillAvailable) return;

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");
      const response = await fetch("/api/reserve/location/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          location_type: locationType,
          reservation_date: date,
          reservation_time: time,
          party_size: partySize,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          special_request: notes,
          notes,
          reschedule_token: rescheduleToken || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create reservation.");
      setSuccess(
        rescheduleToken
          ? "Reservation rescheduled. Your previous reservation was cancelled."
          : data.auto_confirmed
            ? "Reservation confirmed. Check your email or SMS for your manage link."
            : "Reservation request sent. Check your email or SMS for your manage link.",
      );
      setSlotStillAvailable(false);
    } catch (err: any) {
      setError(err?.message || "Unable to create reservation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-black pt-24 text-white">
        <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
          <Link href={`/reserve/location/${encodeURIComponent(locationId)}?${backQuery}`} className="inline-flex items-center gap-2 text-sm font-bold text-white/60 transition hover:text-white">
            <ArrowLeft size={16} /> Change reservation time
          </Link>

          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">TheOutHaven Reserve</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{rescheduleToken ? "Complete your reschedule" : "Complete your reservation"}</h1>
              <p className="mt-3 text-sm leading-7 text-white/55">Enter your contact details. TheOutHaven will assign the best available space for your party when the reservation is confirmed.</p>

              {loading ? (
                <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="animate-spin text-red-400" size={32} /></div>
              ) : success ? (
                <div className="mt-7 rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
                  <CheckCircle2 className="mx-auto text-emerald-300" size={34} />
                  <h2 className="mt-3 text-xl font-black">{rescheduleToken ? "Reservation updated" : "You’re all set"}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-emerald-100">{success}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="mt-7 space-y-5">
                  {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div>}

                  <div>
                    <h2 className="text-lg font-black">Guest details</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input required placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} className="input" />
                      <input type="tel" placeholder="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} className="input" />
                    </div>
                    <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} className="input mt-3" />
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <h2 className="text-lg font-black">Special requests</h2>
                    <p className="mt-1 text-xs leading-5 text-white/40">Optional. Add dietary needs, accessibility requests, or celebration details.</p>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for the venue" className="input mt-3 min-h-[110px] resize-y" />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-white/45">
                    By confirming, you’re asking TheOutHaven to reserve this selected time. Availability is rechecked at submission so stale or double-booked inventory cannot be confirmed.
                  </div>

                  <button type="submit" disabled={!slotStillAvailable || submitting} className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 p-4 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting && <Loader2 className="animate-spin" size={18} />}
                    {submitting ? "Confirming..." : rescheduleToken ? "Confirm reschedule" : "Confirm reservation"}
                  </button>
                </form>
              )}
            </section>

            <aside className="rounded-3xl border border-white/10 bg-zinc-950 p-5 lg:sticky lg:top-24">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Reservation summary</p>
              <h2 className="mt-3 text-xl font-black">{location?.name || "Your reservation"}</h2>
              {location?.address && <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-white/45"><MapPin className="mt-0.5 shrink-0 text-red-400" size={14} />{location.address}</p>}
              <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/35">
                <SummaryRow icon={<CalendarDays size={16} />} label="Date" value={formatDate(date)} />
                <SummaryRow icon={<Clock size={16} />} label="Time" value={formatTime(time)} />
                <SummaryRow icon={<Users size={16} />} label="Party" value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} />
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 p-4">
                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={17} />
                <p className="text-xs font-semibold leading-5 text-white/45">Your table or reservable space is assigned automatically based on party size and live availability.</p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <style jsx>{`.input{width:100%;border-radius:.9rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);padding:.95rem 1rem;color:white;outline:none;font-size:.92rem;font-weight:700}.input:focus{border-color:rgba(239,68,68,.8);box-shadow:0 0 0 3px rgba(220,38,38,.14)}.input::placeholder{color:rgba(255,255,255,.32)}`}</style>
    </>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 p-4"><span className="text-red-400">{icon}</span><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/30">{label}</p><p className="mt-1 text-sm font-black text-white/80">{value}</p></div></div>;
}
