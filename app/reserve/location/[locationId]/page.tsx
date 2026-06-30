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
  operating_hours?: any;
  special_hours?: any;
  holiday_closures?: any;
  hours?: string | null;
  days_of_operation?: string[] | null;
  kitchen_closing_time?: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function prettyType(value?: string) {
  return String(value || "reservation")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const [date, setDate] = useState(prefillDate || todayISO());

  const [selectedItem, setSelectedItem] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentItem = useMemo(
    () => items.find((item) => item.id === selectedItem),
    [items, selectedItem]
  );

  const totalSlots = useMemo(
    () => items.reduce((total, item) => total + Number(item.available_slots?.length || 0), 0),
    [items]
  );

  const autoConfirm = currentItem?.auto_confirm !== false;
  const vocab = getReserveVocabulary(locationType, currentItem?.item_type);
  const operatingHoursDisplay = formatOperatingHoursForDisplay(
    getOperatingHours(location)
  );

  async function loadData(quiet = false) {
    try {
      if (quiet) setChecking(true); else setLoading(true);
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

      if (preferred) {
        setSelectedItem(preferred.id);

        const stillValidTime = preferred.available_slots?.some(
          (slot: Slot) => slot.time === selectedTime
        );

        setSelectedTime(
          stillValidTime ? selectedTime : preferred.available_slots?.[0]?.time || ""
        );
      } else {
        setSelectedItem("");
        setSelectedTime("");
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load reservation.");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  useEffect(() => {
    if (locationId) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    if (!locationId || loading) return;

    const timer = setTimeout(() => {
      loadData(true);
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, partySize]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/reserve/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
            : "Reservation request sent. Check your email or SMS for your manage link."
      );

      await loadData(true);
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
        <section className="relative overflow-hidden px-5 py-8 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(220,38,38,0.35),transparent_30%),radial-gradient(circle_at_90%_5%,rgba(127,29,29,0.35),transparent_28%),#000]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/85 to-black" />

          <div className="relative z-10 mx-auto max-w-7xl">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
            >
              <ArrowLeft size={16} />
              Back to TheOutHaven
            </Link>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,520px)] lg:items-start">
              <aside className="relative min-h-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl lg:min-h-[520px]">
                {getLocationImage(location) ? (
                  <div
                    className="absolute inset-0 opacity-45"
                    style={{
                      backgroundImage: `url(${getLocationImage(location)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(220,38,38,0.35),transparent_35%),linear-gradient(135deg,#09090b,#1f0508,#000)]" />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20" />

                <div className="relative z-10 flex min-h-[360px] flex-col justify-between p-5 sm:p-7 lg:min-h-[520px]">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white">
                      TheOutHaven Reserve
                    </span>

                    {rescheduleToken && (
                      <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-yellow-100">
                        Reschedule
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-red-300">
                      {location?.category || locationType}
                    </p>

                    <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                      {location?.name || "Reserve your spot"}
                    </h1>

                    {location?.address && (
                      <p className="mt-5 flex items-start gap-2 text-sm font-bold leading-7 text-white/70">
                        <MapPin className="mt-1 shrink-0 text-red-300" size={17} />
                        {location.address}
                      </p>
                    )}

                    {operatingHoursDisplay && (
                      <p className="mt-3 flex items-start gap-2 text-sm font-bold leading-7 text-white/70">
                        <Clock className="mt-1 shrink-0 text-red-300" size={17} />
                        {operatingHoursDisplay}
                      </p>
                    )}

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <MiniStat
                        label="Live Slots"
                        value={String(totalSlots)}
                        icon={<Clock size={18} />}
                      />
                      <MiniStat
                        label="Party Size"
                        value={String(partySize)}
                        icon={<Users size={18} />}
                      />
                      <MiniStat
                        label="Status"
                        value={autoConfirm ? "Instant" : "Request"}
                        icon={<ShieldCheck size={18} />}
                      />
                    </div>
                  </div>
                </div>
              </aside>

              <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl sm:p-6 lg:sticky lg:top-24">
                {loading ? (
                  <div className="flex min-h-[420px] items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="mx-auto animate-spin text-red-400" size={34} />
                      <p className="mt-4 text-sm font-bold text-white/60">
                        Loading live availability...
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-5">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">
                        {rescheduleToken ? "Reschedule Booking" : "Book Now"}
                      </p>
                      <h2 className="mt-2 text-3xl font-black tracking-tight">
                        Find a time
                      </h2>
                    </div>

                    {rescheduleToken && (
                      <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-bold leading-6 text-yellow-100">
                        Once your new reservation is created, the previous reservation will be cancelled automatically.
                      </div>
                    )}

                    {error && (
                      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
                        {error}
                      </div>
                    )}

                    {success && (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-bold leading-6 text-emerald-100">
                        <CheckCircle2 className="mb-2 text-emerald-300" size={22} />
                        {success}
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Date" icon={<CalendarDays size={16} />}>
                        <input
                          type="date"
                          required
                          min={todayISO()}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="input"
                        />
                      </Field>

                      <Field label={vocab.partySizeLabel} icon={<Users size={16} />}>
                        <input
                          type="number"
                          required
                          min={1}
                          max={300}
                          value={partySize}
                          onChange={(e) => setPartySize(Number(e.target.value || 1))}
                          className="input"
                        />
                      </Field>
                    </div>

                    <Field label={`${vocab.resource} / space`} icon={<Sparkles size={16} />}>
                      <select
                        required
                        value={selectedItem}
                        onChange={(e) => {
                          setSelectedItem(e.target.value);
                          const nextItem = items.find((item) => item.id === e.target.value);
                          setSelectedTime(nextItem?.available_slots?.[0]?.time || "");
                        }}
                        className="input bg-black"
                      >
                        {items.length === 0 ? (
                          <option value="">No available options</option>
                        ) : (
                          items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.item_name} · {prettyType(item.item_type)} · {item.capacity_min}-{item.capacity_max} {vocab.customerPlural.toLowerCase()}
                            </option>
                          ))
                        )}
                      </select>
                    </Field>

                    <div className="rounded-[1.75rem] border border-white/10 bg-black/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/45">
                          <Clock size={16} />
                          Available Times
                        </span>

                        {checking && (
                          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-300">
                            <RefreshCw size={13} className="animate-spin" />
                            Updating
                          </span>
                        )}
                      </div>

                      {currentItem?.available_slots?.length ? (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {currentItem.available_slots.map((slot) => {
                            const active = selectedTime === slot.time;

                            return (
                              <button
                                key={slot.time}
                                type="button"
                                onClick={() => setSelectedTime(slot.time)}
                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                  active
                                    ? "border-red-400 bg-red-600 text-white shadow-lg shadow-red-950/40"
                                    : "border-white/10 bg-white/[0.06] text-white/75 hover:border-red-400/50 hover:bg-red-500/10"
                                }`}
                              >
                                <span className="block text-sm font-black">
                                  {slot.label}
                                </span>
                                <span
                                  className={`mt-1 block text-[11px] font-black uppercase tracking-wide ${
                                    active ? "text-white/75" : "text-white/35"
                                  }`}
                                >
                                  {slot.remaining} left
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-100">
                          No available times for this selection. Join the waitlist or try another date, time, or group size.
                        </div>
                      )}
                    </div>

                    {currentItem && (
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">
                              Selected
                            </p>
                            <p className="mt-2 text-lg font-black text-white">
                              {currentItem.item_name}
                            </p>
                            <p className="mt-1 text-sm font-bold text-white/55">
                              {prettyType(currentItem.item_type)} · Fits {currentItem.capacity_min}-{currentItem.capacity_max} {vocab.customerPlural.toLowerCase()}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
                              autoConfirm
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-yellow-500/15 text-yellow-100"
                            }`}
                          >
                            {autoConfirm ? "Instant Confirm" : "Request"}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name">
                        <input
                          required
                          placeholder="Your name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="input"
                        />
                      </Field>

                      <Field label="Phone">
                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="input"
                        />
                      </Field>
                    </div>

                    <Field label="Email">
                      <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input"
                      />
                    </Field>

                    <Field label="Notes">
                      <textarea
                        placeholder="Dietary needs, access notes, or celebration details"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="input min-h-[88px]"
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={!selectedItem || !selectedTime || submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 p-4 font-black text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting && <Loader2 className="animate-spin" size={18} />}
                      {submitting
                        ? "Processing..."
                        : rescheduleToken
                          ? "Reschedule Reservation"
                          : autoConfirm
                            ? "Confirm Reservation"
                            : "Request Reservation"}
                    </button>

                    <p className="text-center text-xs leading-6 text-white/40">
                      You’ll receive a confirmation link by email or SMS to manage, cancel, or reschedule.
                    </p>
                  </form>
                )}
              </section>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.1);
          padding: 0.95rem 1rem;
          color: white;
          outline: none;
          font-size: 0.95rem;
          font-weight: 800;
        }

        .input:focus {
          border-color: rgba(248, 113, 113, 0.75);
          box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.18);
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        select.input option {
          background: #09090b;
          color: white;
        }
      `}</style>
    </>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/45">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-xl">
      <div className="text-red-300">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}