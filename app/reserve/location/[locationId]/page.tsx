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
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getLocationImage } from "@/lib/locationImage";
import {
  formatOperatingHoursForDisplay,
  getOperatingHours,
} from "@/lib/locationHours";
import { newYorkTodayISO } from "@/lib/reservations/reservationDate";
import { getReserveVocabulary } from "@/lib/reservations/reserveVocabulary";

type Slot = {
  time: string;
  label: string;
  remaining: number;
};

type Item = {
  id: string;
  item_name: string;
  item_type?: string;
  capacity_min: number;
  capacity_max: number;
  auto_confirm?: boolean;
  available_slots?: Slot[];
};

type LocationData = {
  id: string;
  name: string;
  type?: string;
  address?: string;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  category?: string;
  operating_hours?: unknown;
  special_hours?: unknown;
  holiday_closures?: unknown;
  hours?: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
};

type RescheduleReservation = {
  location_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  special_request?: string | null;
  notes?: string | null;
};

const INITIAL_VISIBLE_TIMES = 6;

function prettyType(value?: string) {
  return String(value || "reservation")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSelectedDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function ReserveLocationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locationId = String(params.locationId || "");
  const locationType = searchParams.get("type") || "restaurant";
  const rescheduleToken = searchParams.get("rescheduleToken") || "";
  const prefillDate = searchParams.get("date") || "";
  const prefillPartySize = searchParams.get("partySize") || "";
  const prefillItem = searchParams.get("item") || "";

  const [location, setLocation] = useState<LocationData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [partySize, setPartySize] = useState(Number(prefillPartySize || 2));
  const [date, setDate] = useState(prefillDate || newYorkTodayISO());
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentItem = useMemo(
    () => items.find((item) => item.id === selectedItem),
    [items, selectedItem],
  );
  const currentSlots = currentItem?.available_slots || [];
  const visibleSlots = showAllTimes
    ? currentSlots
    : currentSlots.slice(0, INITIAL_VISIBLE_TIMES);
  const hiddenTimeCount = Math.max(0, currentSlots.length - INITIAL_VISIBLE_TIMES);
  const autoConfirm = currentItem?.auto_confirm !== false;
  const vocab = getReserveVocabulary(locationType, currentItem?.item_type);
  const operatingHoursDisplay = formatOperatingHoursForDisplay(
    getOperatingHours(location),
  );

  async function loadData(quiet = false) {
    try {
      if (quiet) setChecking(true);
      else setLoading(true);
      setError("");

      const query = new URLSearchParams({
        locationId,
        type: locationType,
        reservationDate: date,
        partySize: String(partySize),
      });
      const res = await fetch(`/api/reserve/location?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load reservation.");

      setLocation(data.location);
      setItems(data.items || []);
      const preferred =
        data.items?.find((item: Item) => item.id === prefillItem) ||
        data.items?.find((item: Item) => item.id === selectedItem) ||
        data.items?.[0];

      if (!preferred) {
        setSelectedItem("");
        setSelectedTime("");
        return;
      }

      setSelectedItem(preferred.id);
      const stillValidTime = preferred.available_slots?.some(
        (slot: Slot) => slot.time === selectedTime,
      );
      setSelectedTime(
        stillValidTime ? selectedTime : preferred.available_slots?.[0]?.time || "",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load reservation.");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  async function loadReschedulePrefill() {
    if (!rescheduleToken) return;
    try {
      const response = await fetch(
        `/api/reserve/confirmation?token=${encodeURIComponent(rescheduleToken)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to load your reservation details.");
      }

      const reservation = (data.reservation || {}) as RescheduleReservation;
      if (reservation.location_id && String(reservation.location_id) !== locationId) {
        throw new Error("This reservation link does not match this location.");
      }

      setName(String(reservation.customer_name || ""));
      setEmail(String(reservation.customer_email || ""));
      setPhone(String(reservation.customer_phone || ""));
      setNotes(String(reservation.special_request || reservation.notes || ""));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load your reservation details.",
      );
    }
  }

  useEffect(() => {
    if (locationId) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    if (locationId && rescheduleToken) loadReschedulePrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, rescheduleToken]);

  useEffect(() => {
    if (!locationId || loading) return;
    setShowAllTimes(false);
    const timer = setTimeout(() => loadData(true), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, partySize]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/reserve/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          location_type: locationType,
          bookable_item_id: selectedItem,
          reservation_date: date,
          reservation_time: selectedTime,
          party_size: partySize,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          special_request: notes,
          notes,
          reschedule_token: rescheduleToken || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to create reservation.");

      setSuccess(
        rescheduleToken
          ? "Reservation rescheduled. Your previous reservation was cancelled."
          : data.auto_confirmed
            ? "Reservation confirmed. Check your email or SMS for your manage link."
            : "Reservation request sent. Check your email or SMS for your manage link.",
      );
      await loadData(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create reservation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-[#0a0a0a] pt-20 text-white">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <Link
            href="/create"
            className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-white/60 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Back to TheOutHaven
          </Link>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="relative h-52 sm:h-72">
              {getLocationImage(location) ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${getLocationImage(location)})` }}
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(220,38,38,.45),transparent_35%),linear-gradient(135deg,#18181b,#050505)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <span>{location?.category || locationType}</span>
                  <span className="text-white/25">•</span>
                  <span className="text-white/65">TheOutHaven Reserve</span>
                  {rescheduleToken && (
                    <span className="rounded-full bg-yellow-400/15 px-3 py-1 text-yellow-100">
                      Reschedule
                    </span>
                  )}
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
                  {location?.name || "Reserve your spot"}
                </h1>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            <section className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
                <h2 className="text-xl font-black">About your visit</h2>
                <div className="mt-5 space-y-4 text-sm font-semibold text-white/65">
                  {location?.address && (
                    <p className="flex items-start gap-3">
                      <MapPin className="mt-0.5 shrink-0 text-red-400" size={18} />
                      {location.address}
                    </p>
                  )}
                  {operatingHoursDisplay && (
                    <p className="flex items-start gap-3">
                      <Clock className="mt-0.5 shrink-0 text-red-400" size={18} />
                      {operatingHoursDisplay}
                    </p>
                  )}
                  <p className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-red-400" size={18} />
                    {autoConfirm
                      ? "Selected times are eligible for instant confirmation."
                      : "This location reviews reservation requests before confirming."}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/40">
                  Selected visit
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Summary label="Date" value={formatSelectedDate(date)} />
                  <Summary
                    label="Time"
                    value={currentSlots.find((slot) => slot.time === selectedTime)?.label || "Choose a time"}
                  />
                  <Summary label="Party" value={`${partySize} ${partySize === 1 ? "guest" : "guests"}`} />
                </div>
                {currentItem && (
                  <div className="mt-3 rounded-2xl bg-white/[0.04] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">
                      Reserved space
                    </p>
                    <p className="mt-1 font-black">{currentItem.item_name}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl sm:p-6 lg:sticky lg:top-24">
              {loading ? (
                <div className="flex min-h-[420px] items-center justify-center text-center">
                  <div>
                    <Loader2 className="mx-auto animate-spin text-red-400" size={30} />
                    <p className="mt-3 text-sm font-bold text-white/50">Loading availability...</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <div className="border-b border-white/10 pb-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">
                      {rescheduleToken ? "Reschedule" : "Make a reservation"}
                    </p>
                    <h2 className="mt-1 text-2xl font-black">Find a time</h2>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm font-bold text-red-100">
                      {error}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <CompactField label={vocab.partySizeLabel} icon={<Users size={15} />}>
                      <input
                        type="number"
                        required
                        min={1}
                        max={300}
                        value={partySize}
                        onChange={(e) => setPartySize(Number(e.target.value || 1))}
                        className="input"
                      />
                    </CompactField>
                    <CompactField label="Date" icon={<CalendarDays size={15} />}>
                      <input
                        type="date"
                        required
                        min={newYorkTodayISO()}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="input"
                      />
                    </CompactField>
                    <CompactField label={vocab.resource} icon={<Sparkles size={15} />}>
                      <select
                        required
                        value={selectedItem}
                        onChange={(e) => {
                          setSelectedItem(e.target.value);
                          setShowAllTimes(false);
                          const nextItem = items.find((item) => item.id === e.target.value);
                          setSelectedTime(nextItem?.available_slots?.[0]?.time || "");
                        }}
                        className="input"
                      >
                        {items.length === 0 ? (
                          <option value="">No options</option>
                        ) : (
                          items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.item_name}
                            </option>
                          ))
                        )}
                      </select>
                    </CompactField>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">Available times</p>
                      {checking && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/45">
                          <RefreshCw className="animate-spin" size={12} /> Updating
                        </span>
                      )}
                    </div>

                    {currentSlots.length ? (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {visibleSlots.map((slot) => {
                            const active = selectedTime === slot.time;
                            return (
                              <button
                                key={slot.time}
                                type="button"
                                onClick={() => setSelectedTime(slot.time)}
                                className={`rounded-xl px-3 py-3 text-center text-sm font-black transition ${
                                  active
                                    ? "bg-red-600 text-white shadow-lg shadow-red-950/30"
                                    : "border border-white/10 bg-white/[0.05] text-white hover:border-red-500/50 hover:bg-red-500/10"
                                }`}
                              >
                                {slot.label}
                              </button>
                            );
                          })}
                        </div>
                        {hiddenTimeCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllTimes((value) => !value)}
                            className="mt-2 w-full py-2 text-xs font-black text-red-300 hover:text-red-200"
                          >
                            {showAllTimes
                              ? "Show fewer times"
                              : `Show ${hiddenTimeCount} more ${hiddenTimeCount === 1 ? "time" : "times"}`}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-white/55">
                        No future times are available for this selection. Try another date or reserved space.
                      </div>
                    )}
                  </div>

                  {currentItem && (
                    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
                      <div>
                        <p className="text-xs font-bold text-white/40">{prettyType(currentItem.item_type)}</p>
                        <p className="font-black">{currentItem.item_name}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${autoConfirm ? "bg-emerald-500/15 text-emerald-200" : "bg-yellow-500/15 text-yellow-100"}`}>
                        {autoConfirm ? "Instant" : "Request"}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-5">
                    <p className="mb-3 text-sm font-black">Guest details</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <Field label="Name">
                        <input required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
                      </Field>
                      <Field label="Phone">
                        <input type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Field label="Email">
                        <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Field label="Special request">
                        <textarea placeholder="Dietary needs, accessibility, or celebration details" value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[82px] resize-none" />
                      </Field>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedItem || !selectedTime || submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-4 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="animate-spin" size={18} />}
                    {submitting
                      ? "Processing..."
                      : rescheduleToken
                        ? "Reschedule reservation"
                        : autoConfirm
                          ? "Confirm reservation"
                          : "Request reservation"}
                  </button>

                  {success && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center text-sm font-bold leading-6 text-emerald-100" role="status">
                      <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={22} />
                      {success}
                    </div>
                  )}

                  <p className="text-center text-[11px] leading-5 text-white/35">
                    We’ll send your manage link by email or SMS.
                  </p>
                </form>
              )}
            </section>
          </div>
        </div>
      </main>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,.12);
          background: #111113;
          padding: 0.8rem 0.85rem;
          color: white;
          outline: none;
          font-size: 0.9rem;
          font-weight: 700;
        }
        .input:focus {
          border-color: rgba(248,113,113,.75);
          box-shadow: 0 0 0 3px rgba(220,38,38,.16);
        }
        .input::placeholder { color: rgba(255,255,255,.3); }
        select.input option { background: #111113; color: white; }
      `}</style>
    </>
  );
}

function CompactField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
        {icon}{label}
      </span>
      {children}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-white/55">{label}</span>
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}
