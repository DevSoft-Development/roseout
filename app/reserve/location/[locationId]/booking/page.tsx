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
import {
  isBarSeatingType,
  normalizeSeatingPreference,
  type SeatingPreference,
} from "@/lib/reservations/seatingPreference";

type LocationData = {
  id: string;
  name: string;
  address?: string;
  category?: string;
  main_image?: string | null;
  image_url?: string | null;
};
type Item = {
  item_type?: string | null;
  available_slots?: { time: string; label: string }[];
};
type ReservationPrefill = {
  location_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  special_request?: string | null;
  notes?: string | null;
  bookable_item_type?: string | null;
};
type SeatingOptions = {
  show_preference?: boolean;
  any_available?: boolean;
  dining?: { available?: boolean; inventory?: boolean; label?: string };
  bar?: { available?: boolean; inventory?: boolean; label?: string };
};

const CONTACT_ERROR = "Enter an email address or a mobile number and agree to text updates.";

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

function seatingLabel(value: SeatingPreference) {
  if (value === "bar") return "Bar seating";
  if (value === "dining") return "Table seating";
  return "No preference";
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
  const requestedSeatingPreference = normalizeSeatingPreference(searchParams.get("seatingPreference"));
  const hasExplicitSeatingPreference = Boolean(searchParams.get("seatingPreference"));

  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [slotStillAvailable, setSlotStillAvailable] = useState(false);
  const [seatingOptions, setSeatingOptions] = useState<SeatingOptions | null>(null);
  const [seatingPreference, setSeatingPreference] = useState<SeatingPreference>(requestedSeatingPreference);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const showSeatingPreference = Boolean(seatingOptions?.show_preference) && !hasExplicitSeatingPreference;
  const effectiveSeatingPreference: SeatingPreference = hasExplicitSeatingPreference
    ? requestedSeatingPreference
    : showSeatingPreference
      ? seatingPreference
      : seatingOptions?.bar?.available && !seatingOptions?.dining?.available
        ? "bar"
        : seatingOptions?.dining?.available && !seatingOptions?.bar?.available
          ? "dining"
          : "any";
  const preferenceAvailable =
    effectiveSeatingPreference === "bar"
      ? seatingOptions?.bar?.available !== false
      : effectiveSeatingPreference === "dining"
        ? seatingOptions?.dining?.available !== false
        : seatingOptions?.any_available !== false;
  const canConfirm = slotStillAvailable && preferenceAvailable;

  const backQuery = useMemo(() => {
    const query = new URLSearchParams({
      type: locationType,
      date,
      partySize: String(partySize),
      time,
      seatingPreference: effectiveSeatingPreference,
    });
    if (rescheduleToken) query.set("rescheduleToken", rescheduleToken);
    return query.toString();
  }, [date, effectiveSeatingPreference, locationType, partySize, rescheduleToken, time]);

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
        const seatingQuery = new URLSearchParams({
          locationId,
          type: locationType,
          date,
          time,
          partySize: String(partySize),
        });
        const [response, seatingResponse] = await Promise.all([
          fetch(`/api/reserve/location?${query.toString()}`),
          fetch(`/api/reserve/location/seating-options?${seatingQuery.toString()}`),
        ]);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to verify this reservation time.");
        const items = (data.items || []) as Item[];
        const baseAvailable = items.some((item) =>
          (item.available_slots || []).some((slot) => slot.time === time),
        );

        let nextSeatingOptions: SeatingOptions | null = null;
        if (seatingResponse.ok) {
          nextSeatingOptions = (await seatingResponse.json()) as SeatingOptions;
          setSeatingOptions(nextSeatingOptions);
        } else {
          const seatingError = await seatingResponse.json().catch(() => null);
          throw new Error(seatingError?.error || "Unable to verify seating availability.");
        }

        const requestedAvailable = requestedSeatingPreference === "bar"
          ? nextSeatingOptions?.bar?.available !== false
          : requestedSeatingPreference === "dining"
            ? nextSeatingOptions?.dining?.available !== false
            : nextSeatingOptions?.any_available !== false;
        const available = baseAvailable && requestedAvailable;
        setLocation(data.location || null);
        setSlotStillAvailable(available);
        if (!available) {
          setError(`That time is no longer available for ${seatingLabel(requestedSeatingPreference).toLowerCase()}. Go back and choose another time.`);
        }
      } catch (err: any) {
        setError(err?.message || "Unable to verify this reservation time.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [date, locationId, locationType, partySize, requestedSeatingPreference, time]);

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
        setSmsConsent(false);
        setNotes(String(reservation.special_request || reservation.notes || ""));
        if (!hasExplicitSeatingPreference && reservation.bookable_item_type) {
          setSeatingPreference(isBarSeatingType(reservation.bookable_item_type) ? "bar" : "dining");
        }
      } catch (err: any) {
        setError(err?.message || "Unable to load your reservation details.");
      }
    }
    void prefill();
  }, [hasExplicitSeatingPreference, locationId, rescheduleToken]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm) return;

    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedEmail && !(trimmedPhone && smsConsent)) {
      setError(CONTACT_ERROR);
      return;
    }

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
          seating_preference: effectiveSeatingPreference,
          customer_name: name,
          customer_email: trimmedEmail || null,
          customer_phone: smsConsent && trimmedPhone ? trimmedPhone : null,
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
            <ArrowLeft size={16} /> Change reservation
          </Link>

          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">TheOutHaven Reserve</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{rescheduleToken ? "Complete your reschedule" : "Complete your reservation"}</h1>
              <p className="mt-3 text-sm leading-7 text-white/55">Your seating preference and time are selected. Enter your contact details to complete the reservation; the venue assigns the exact table or stools.</p>

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

                  {showSeatingPreference ? (
                    <div>
                      <h2 className="text-lg font-black">Seating preference</h2>
                      <p className="mt-1 text-xs leading-5 text-white/40">Choose an area, not a specific table or stool. Exact placement stays with the venue.</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {([[
                          "any",
                          "No preference",
                        ], ["dining", seatingOptions?.dining?.label || "Table seating"], ["bar", seatingOptions?.bar?.label || "Bar seating"]] as Array<[SeatingPreference, string]>).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={seatingPreference === value}
                            onClick={() => setSeatingPreference(value)}
                            className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${seatingPreference === value ? "border-red-500 bg-red-600 text-white" : "border-white/10 bg-white/[0.04] text-white/65 hover:border-red-500/50 hover:text-white"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className={showSeatingPreference ? "border-t border-white/10 pt-5" : ""}>
                    <h2 className="text-lg font-black">Guest details</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input required placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} className="input" />
                      <input type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile number" value={phone} onChange={(event) => { const value = event.target.value; setPhone(value); if (!value.trim()) setSmsConsent(false); }} className="input" />
                    </div>
                    <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} className="input mt-3" />
                    <p className="mt-2 text-xs font-semibold leading-5 text-white/40">Provide an email address, a mobile number for text updates, or both.</p>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} disabled={!phone.trim()} className="mt-1 h-4 w-4 shrink-0 accent-red-600 disabled:cursor-not-allowed disabled:opacity-40" />
                        <span className="text-xs font-semibold leading-6 text-white/65">I agree to receive SMS messages from TheOutHaven about my reservation, reservation reminders, account notifications, and customer care. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.</span>
                      </label>
                      <p className="mt-2 pl-7 text-[11px] leading-5 text-white/40">SMS is optional and unchecked by default. See our <Link href="/sms-terms" target="_blank" className="font-bold text-red-300 underline underline-offset-2">SMS Terms</Link> and <Link href="/privacy" target="_blank" className="font-bold text-red-300 underline underline-offset-2">Privacy Policy</Link>.</p>
                      <p className="mt-2 pl-7 text-[11px] leading-5 text-white/40"><strong className="text-white/55">Email terms:</strong> If you provide an email address, you agree to receive transactional reservation confirmations, updates, and reminders by email. These emails are about your reservation and are not marketing messages.</p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <h2 className="text-lg font-black">Special requests</h2>
                    <p className="mt-1 text-xs leading-5 text-white/40">Optional. Add dietary needs, accessibility requests, or celebration details.</p>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for the venue" className="input mt-3 min-h-[110px] resize-y" />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-white/45">By confirming, you’re asking TheOutHaven to reserve this selected time and seating area. Availability is rechecked at submission so stale or double-booked inventory cannot be confirmed.</div>

                  <button type="submit" disabled={!canConfirm || submitting} className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 p-4 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">
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
                {seatingOptions?.any_available ? <SummaryRow icon={<Users size={16} />} label="Seating" value={seatingLabel(effectiveSeatingPreference)} /> : null}
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 p-4">
                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={17} />
                <p className="text-xs font-semibold leading-5 text-white/45">The venue assigns the exact table or stools based on party size, your seating choice, and live availability.</p>
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
