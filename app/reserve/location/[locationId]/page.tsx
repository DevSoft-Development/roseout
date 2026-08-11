"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { getLocationImage } from "@/lib/locationImage";
import {
  formatOperatingHoursForDisplay,
  getOperatingHours,
} from "@/lib/locationHours";
import { newYorkTodayISO } from "@/lib/reservations/reservationDate";

type Slot = { time: string; label: string; remaining?: number };
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
type LocationDetails = {
  description?: string | null;
  short_description?: string | null;
  cuisine?: string | null;
  category?: string | null;
  website?: string | null;
  website_url?: string | null;
  phone?: string | null;
  menu_url?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  images?: string[] | null;
};
type TabKey = "overview" | "photos" | "menu" | "details" | "location";

const INITIAL_VISIBLE_TIMES = 6;
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function mergeAvailableSlots(items: Item[]) {
  const slots = new Map<string, Slot>();
  for (const item of items) {
    for (const slot of item.available_slots || []) {
      if (!slots.has(slot.time)) slots.set(slot.time, slot);
    }
  }
  return Array.from(slots.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function fullAddress(details: LocationDetails | null, fallback?: string) {
  return [details?.address, details?.city, details?.state, details?.zip_code]
    .filter(Boolean)
    .join(", ") || fallback || "";
}

function parseISODate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateButton(value: string) {
  return parseISODate(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function calendarDays(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const days: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export default function ReserveLocationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationId = String(params.locationId || "");
  const locationType = searchParams.get("type") || "restaurant";
  const rescheduleToken = searchParams.get("rescheduleToken") || "";
  const prefillDate = searchParams.get("date") || "";
  const prefillPartySize = searchParams.get("partySize") || "";
  const prefillTime = searchParams.get("time") || "";

  const initialDate = prefillDate || newYorkTodayISO();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [details, setDetails] = useState<LocationDetails | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [partySize, setPartySize] = useState(Number(prefillPartySize || 2));
  const [date, setDate] = useState(initialDate);
  const [preferredTime, setPreferredTime] = useState(prefillTime);
  const [selectedTime, setSelectedTime] = useState("");
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const selected = parseISODate(initialDate);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [error, setError] = useState("");

  const currentSlots = useMemo(() => mergeAvailableSlots(items), [items]);
  const preferredTimeOptions = currentSlots;
  const matchingSlots = useMemo(
    () => preferredTime ? currentSlots.filter((slot) => slot.time >= preferredTime) : currentSlots,
    [currentSlots, preferredTime],
  );
  const visibleSlots = showAllTimes ? matchingSlots : matchingSlots.slice(0, INITIAL_VISIBLE_TIMES);
  const hiddenTimeCount = Math.max(0, matchingSlots.length - INITIAL_VISIBLE_TIMES);
  const operatingHoursDisplay = formatOperatingHoursForDisplay(getOperatingHours(location));
  const image = getLocationImage(location) || details?.main_image || details?.image_url || "";
  const gallery = Array.from(new Set([image, ...(details?.images || []), ...(location?.images || [])].filter(Boolean))) as string[];
  const address = fullAddress(details, location?.address);
  const menuUrl = details?.menu_url || "";
  const websiteUrl = details?.website_url || details?.website || "";
  const description = details?.description || details?.short_description || "";
  const today = newYorkTodayISO();
  const monthDays = useMemo(() => calendarDays(calendarMonth), [calendarMonth]);

  const tabs = useMemo(() => {
    const result: { key: TabKey; label: string }[] = [{ key: "overview", label: "Overview" }];
    if (gallery.length) result.push({ key: "photos", label: "Photos" });
    if (menuUrl) result.push({ key: "menu", label: "Menu" });
    if (operatingHoursDisplay || details?.phone || websiteUrl) result.push({ key: "details", label: "Details" });
    if (address) result.push({ key: "location", label: "Location" });
    return result;
  }, [address, gallery.length, menuUrl, operatingHoursDisplay, details?.phone, websiteUrl]);

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
      const response = await fetch(`/api/reserve/location?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load reservation.");
      const nextItems = (data.items || []) as Item[];
      const nextSlots = mergeAvailableSlots(nextItems);
      setLocation(data.location);
      setItems(nextItems);
      setPreferredTime((current) => {
        if (current && nextSlots.some((slot) => slot.time === current)) return current;
        return nextSlots[0]?.time || "";
      });
      setSelectedTime("");
    } catch (err: any) {
      setError(err?.message || "Unable to load reservation.");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  async function loadDetails() {
    try {
      const response = await fetch(`/api/reserve/location/details?locationId=${encodeURIComponent(locationId)}`);
      const data = await response.json();
      if (response.ok) setDetails(data.location || null);
    } catch {
      // Venue content is optional and should never block availability.
    }
  }

  useEffect(() => {
    if (!locationId) return;
    void Promise.all([loadData(false), loadDetails()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => {
    if (!locationId || loading) return;
    setShowAllTimes(false);
    const timer = setTimeout(() => void loadData(true), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, partySize]);

  function chooseDate(nextDate: Date) {
    const next = toISODate(nextDate);
    if (next < today) return;
    setDate(next);
    setSelectedTime("");
    setShowAllTimes(false);
    setCalendarOpen(false);
  }

  function continueToBooking(time: string) {
    const query = new URLSearchParams({
      type: locationType,
      date,
      partySize: String(partySize),
      time,
    });
    if (rescheduleToken) query.set("rescheduleToken", rescheduleToken);
    router.push(`/reserve/location/${encodeURIComponent(locationId)}/booking?${query.toString()}`);
  }

  return (
    <>
      <TheOutHavenHeader />
      <main className="min-h-screen bg-black pt-24 text-white">
        <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <Link href="/create" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-white/60 transition hover:text-white">
            <ArrowLeft size={16} /> Back to TheOutHaven
          </Link>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
            <div className="relative h-64 sm:h-80">
              {image ? (
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(220,38,38,0.35),transparent_38%),#09090b]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-red-400">{details?.cuisine || location?.category || locationType}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{location?.name || "Reserve your spot"}</h1>
                {address && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/70"><MapPin size={16} className="text-red-400" /> {address}</p>}
              </div>
            </div>

            <div className="border-t border-white/10 px-4 sm:px-6">
              <div className="max-w-full overflow-x-auto">
                <div className="inline-flex min-w-max gap-1">
                  {tabs.map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`border-b-2 px-4 py-4 text-sm font-black transition ${activeTab === tab.key ? "border-red-500 text-white" : "border-transparent text-white/50 hover:text-white"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-7">
              {activeTab === "overview" && <div><h2 className="text-2xl font-black">About {location?.name}</h2><p className="mt-4 max-w-3xl whitespace-pre-line text-sm font-medium leading-7 text-white/65">{description || "Plan your visit and reserve an available time with TheOutHaven."}</p>{operatingHoursDisplay && <div className="mt-6 flex items-start gap-3 border-t border-white/10 pt-5"><Clock className="mt-0.5 text-red-400" size={18} /><div><p className="text-sm font-black">Hours</p><p className="mt-1 text-sm text-white/55">{operatingHoursDisplay}</p></div></div>}</div>}
              {activeTab === "photos" && <div><h2 className="text-2xl font-black">Photos</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{gallery.map((photo) => <div key={photo} className="aspect-[4/3] rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${photo})` }} />)}</div></div>}
              {activeTab === "menu" && <div><h2 className="text-2xl font-black">Menu</h2><p className="mt-3 text-sm leading-7 text-white/60">View the latest menu directly from the venue.</p><a href={menuUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-500">View menu <ExternalLink size={15} /></a></div>}
              {activeTab === "details" && <div><h2 className="text-2xl font-black">Details</h2><div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10">{operatingHoursDisplay && <DetailRow label="Hours" value={operatingHoursDisplay} />}{details?.phone && <DetailRow label="Phone" value={details.phone} />}{websiteUrl && <div className="flex items-center justify-between gap-4 p-4"><span className="text-sm font-bold text-white/45">Website</span><a href={websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-black text-red-400 hover:text-red-300">Visit site <ExternalLink size={14} /></a></div>}</div></div>}
              {activeTab === "location" && <div><h2 className="text-2xl font-black">Location</h2><div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-5"><p className="flex items-start gap-3 text-sm font-semibold leading-7 text-white/70"><MapPin className="mt-1 shrink-0 text-red-400" size={18} />{address}</p></div></div>}
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl lg:sticky lg:top-24">
              {loading ? <div className="flex min-h-[360px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-red-400" size={32} /><p className="mt-4 text-sm font-bold text-white/55">Loading availability...</p></div></div> : (
                <div className="space-y-5">
                  <div><p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">{rescheduleToken ? "Reschedule" : "Reservations"}</p><h2 className="mt-2 text-2xl font-black">Find a time</h2></div>
                  {rescheduleToken && <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm font-semibold leading-6 text-yellow-100">Your current reservation stays active until the new reservation is successfully created.</div>}
                  {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div>}

                  <Field label="Party size" icon={<Users size={15} />}>
                    <select value={partySize} onChange={(event) => setPartySize(Number(event.target.value))} className="input">
                      {Array.from({ length: 20 }, (_, index) => index + 1).map((size) => <option key={size} value={size}>{size} {size === 1 ? "guest" : "guests"}</option>)}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Field label="Date" icon={<CalendarDays size={15} />}>
                        <button
                          type="button"
                          aria-expanded={calendarOpen}
                          aria-haspopup="dialog"
                          onClick={() => setCalendarOpen((value) => !value)}
                          className="input flex items-center justify-between text-left"
                        >
                          <span>{formatDateButton(date)}</span>
                          <CalendarDays size={16} className="text-white/45" />
                        </button>
                      </Field>

                      {calendarOpen && (
                        <div role="dialog" aria-label="Choose reservation date" className="absolute left-0 top-[76px] z-30 w-[310px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-full border border-white/10 p-2 text-white/60 transition hover:text-white">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-black">{calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                            <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-full border border-white/10 p-2 text-white/60 transition hover:text-white">
                              <ChevronRight size={16} />
                            </button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center">
                            {DAY_LABELS.map((label) => <span key={label} className="py-1 text-[10px] font-black uppercase tracking-wider text-white/35">{label}</span>)}
                            {monthDays.map((dayValue, index) => {
                              if (!dayValue) return <span key={`empty-${index}`} />;
                              const iso = toISODate(dayValue);
                              const disabled = iso < today;
                              const selected = iso === date;
                              return (
                                <button
                                  key={iso}
                                  type="button"
                                  disabled={disabled}
                                  aria-pressed={selected}
                                  onClick={() => chooseDate(dayValue)}
                                  className={`aspect-square rounded-lg text-xs font-black transition ${selected ? "bg-red-600 text-white" : disabled ? "cursor-not-allowed text-white/15" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                                >
                                  {dayValue.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <Field label="Preferred time" icon={<Clock size={15} />}>
                      <select value={preferredTime} onChange={(event) => { setPreferredTime(event.target.value); setSelectedTime(""); setShowAllTimes(false); }} className="input" disabled={!preferredTimeOptions.length}>
                        {!preferredTimeOptions.length && <option value="">No times available</option>}
                        {preferredTimeOptions.map((slot) => <option key={slot.time} value={slot.time}>{slot.label}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/45"><Clock size={15} /> Available at or after your preferred time</p>{checking && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-300"><RefreshCw size={12} className="animate-spin" /> Updating</span>}</div>
                    {matchingSlots.length ? <><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">{visibleSlots.map((slot) => <button key={slot.time} type="button" onClick={() => setSelectedTime(slot.time)} className={`rounded-xl border px-3 py-3 text-center text-sm font-black transition ${selectedTime === slot.time ? "border-red-500 bg-red-600 text-white" : "border-white/10 bg-white/[0.05] text-white/75 hover:border-red-500/50 hover:bg-red-500/10"}`}>{slot.label}</button>)}</div>{hiddenTimeCount > 0 && <button type="button" onClick={() => setShowAllTimes((value) => !value)} className="mt-3 w-full rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-white/60 transition hover:text-white">{showAllTimes ? "Show fewer times" : `Show ${hiddenTimeCount} more times`}</button>}</> : <div className="mt-3 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm font-semibold text-yellow-100">No available times at or after this preference. Try an earlier preferred time, another date, or a different party size.</div>}
                  </div>

                  <button type="button" disabled={!selectedTime} onClick={() => continueToBooking(selectedTime)} className="w-full rounded-full bg-red-600 p-4 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">
                    Continue with {currentSlots.find((slot) => slot.time === selectedTime)?.label || "selected time"}
                  </button>
                  <p className="text-center text-xs leading-5 text-white/35">Your preferred time helps narrow the results. Your reservation is not held until you complete the next step.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <style jsx>{`.input{width:100%;min-height:48px;border-radius:.85rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);padding:.8rem .85rem;color:white;outline:none;font-size:.85rem;font-weight:700}.input:focus{border-color:rgba(239,68,68,.8);box-shadow:0 0 0 3px rgba(220,38,38,.14)}.input::placeholder{color:rgba(255,255,255,.32)}select.input option{background:#09090b;color:white}`}</style>
    </>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">{icon}{label}</span>{children}</label>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-5 p-4"><span className="text-sm font-bold text-white/45">{label}</span><span className="max-w-[70%] text-right text-sm font-bold text-white/75">{value}</span></div>;
}
