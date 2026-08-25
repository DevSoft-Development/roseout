"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  Grid2X2,
  Link2,
  QrCode,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import ReserveLayoutManager from "@/components/reserve/ReserveLayoutManager";
import {
  ReserveQrSettings,
  ReserveRemindersSettings,
  ReserveTeamSettings,
} from "@/components/reserve/ReserveSettingsE2E";
import ReserveLargeGroupSettings from "@/components/reserve/ReserveLargeGroupSettings";
import {
  WEEKDAY_LABELS,
  normalizeWeeklyHoursForDisplay,
} from "@/lib/locationHours";

type Props = {
  locationId: string;
  locationType: "restaurant" | "activity";
  locationName: string;
  adminLocationId?: string;
  demo?: boolean;
  fromDemoCenter?: boolean;
};

type Message = { tone: "success" | "error"; text: string } | null;
type TimeRange = { open: string; close: string };
type DaySchedule = { closed: boolean; ranges: TimeRange[] };

const sections = [
  { key: "overview", label: "Overview", icon: Settings2 },
  { key: "booking", label: "Guest Booking", icon: CalendarClock },
  { key: "hours", label: "Hours & Availability", icon: Clock3 },
  { key: "layout", label: "Layout & Spaces", icon: Grid2X2 },
  { key: "reminders", label: "Reminders & Alerts", icon: Bell },
  { key: "policies", label: "Policies & Guarantees", icon: ShieldCheck },
  { key: "distribution", label: "Booking Links", icon: Link2 },
  { key: "qr", label: "QR Codes", icon: QrCode },
  { key: "team", label: "Team Access", icon: Users },
] as const;

type SectionKey = (typeof sections)[number]["key"];

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.5rem] border border-white/10 bg-[#0d1015] shadow-[0_18px_60px_rgba(0,0,0,.22)] ${className}`}
    >
      {children}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-white/45">
          {description}
        </span>
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="block h-7 w-12 rounded-full border border-white/15 bg-white/10 transition peer-checked:border-[#e1062a] peer-checked:bg-[#e1062a] peer-disabled:opacity-40" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 peer-disabled:opacity-70" />
      </span>
    </label>
  );
}

function StatusPill({
  good,
  children,
}: {
  good?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
        good
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
          : "border-[#e1062a]/25 bg-[#e1062a]/10 text-[#ff8aa0]"
      }`}
    >
      {children}
    </span>
  );
}

function SettingsNotice({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-bold ${
        message.tone === "success"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          : "border-rose-300/20 bg-rose-300/10 text-rose-100"
      }`}
    >
      {message.text}
    </div>
  );
}

function parseClock(value: string) {
  const match = value
    .trim()
    .replace(/–|—/g, "-")
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = String(match[3] || "").toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseRange(value: string): TimeRange | null {
  const [openRaw, closeRaw] = value.split(/\s*(?:-|to)\s*/i);
  const open = parseClock(openRaw || "");
  const close = parseClock(closeRaw || "");
  return open && close ? { open, close } : null;
}

function weeklySchedule(hours: unknown): Record<string, DaySchedule> {
  const normalized = normalizeWeeklyHoursForDisplay(hours);
  return Object.fromEntries(
    WEEKDAY_LABELS.map(({ key }) => {
      const ranges = (normalized[key] || [])
        .map(parseRange)
        .filter((range): range is TimeRange => Boolean(range))
        .slice(0, 2);
      return [
        key,
        {
          closed: ranges.length === 0,
          ranges: ranges.length ? ranges : [{ open: "17:00", close: "22:00" }],
        },
      ];
    }),
  );
}

function HoursCapacityControl({
  locationId,
  onChanged,
}: {
  locationId: string;
  onChanged: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [week, setWeek] = useState<Record<string, DaySchedule>>({});
  const [capacity, setCapacity] = useState<any>({});
  const [specialHours, setSpecialHours] = useState<Record<string, any>>({});
  const [specialDate, setSpecialDate] = useState("");
  const [specialClosed, setSpecialClosed] = useState(true);
  const [specialOpen, setSpecialOpen] = useState("17:00");
  const [specialClose, setSpecialClose] = useState("22:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function load() {
    if (!locationId) return;
    const response = await fetch(
      `/api/reserve/portal/hours?locationId=${encodeURIComponent(locationId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "We could not load reservation hours.");
    setWeek(weeklySchedule(payload.hours));
    setCapacity(payload.capacity || {});
    setSpecialHours(
      payload.specialHours && typeof payload.specialHours === "object"
        ? payload.specialHours
        : {},
    );
    setData(payload);
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We could not load reservation hours.",
      }),
    );
  }, [locationId]);

  function updateCapacity(key: string, value: string) {
    setCapacity((current: any) => ({
      ...current,
      [key]: value === "" ? null : Number(value),
    }));
  }

  function updateDay(
    day: string,
    updater: (schedule: DaySchedule) => DaySchedule,
  ) {
    setWeek((current) => ({
      ...current,
      [day]: updater(
        current[day] || {
          closed: true,
          ranges: [{ open: "17:00", close: "22:00" }],
        },
      ),
    }));
  }

  function updateRange(
    day: string,
    index: number,
    field: "open" | "close",
    value: string,
  ) {
    updateDay(day, (schedule) => ({
      ...schedule,
      ranges: schedule.ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range,
      ),
    }));
  }

  function addSecondWindow(day: string) {
    updateDay(day, (schedule) => ({
      ...schedule,
      closed: false,
      ranges:
        schedule.ranges.length >= 2
          ? schedule.ranges
          : [...schedule.ranges, { open: "17:00", close: "22:00" }],
    }));
  }

  function removeSecondWindow(day: string) {
    updateDay(day, (schedule) => ({
      ...schedule,
      ranges: schedule.ranges.slice(0, 1),
    }));
  }

  function addSpecialHours() {
    if (!specialDate) return;
    setSpecialHours((current) => ({
      ...current,
      [specialDate]: specialClosed
        ? { closed: true }
        : { open: specialOpen, close: specialClose },
    }));
    setSpecialDate("");
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const hours = Object.fromEntries(
        WEEKDAY_LABELS.map(({ key }) => {
          const schedule = week[key];
          return [
            key,
            schedule?.closed
              ? { closed: true }
              : {
                  ranges: (schedule?.ranges || [])
                    .filter((range) => range.open && range.close)
                    .map((range) => ({ open: range.open, close: range.close })),
                },
          ];
        }),
      );
      const response = await fetch("/api/reserve/portal/hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, hours, specialHours, capacity }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We could not save these settings.");
      setMessage({ tone: "success", text: "Hours and availability saved." });
      await load();
      onChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "We could not save these settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <Panel className="p-6 text-sm font-bold text-white/45">
        Loading hours and availability…
      </Panel>
    );
  }

  const canEdit = Boolean(data.canEdit);
  const inputClass =
    "mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#080a0e] px-3 text-sm font-bold text-white outline-none focus:border-[#e1062a]/60";

  const capacityFields = [
    ["defaultDurationMinutes", "Standard reservation length", "minutes", 30, 720],
    ["minPartySize", "Smallest party", "guests", 1, 500],
    ["maxPartySize", "Largest party", "guests", 1, 500],
    ["maxGuestsPerSlot", "Maximum guests at one time", "guests", 1, 5000],
    ["slotCapacity", "Maximum reservations at one time", "optional", 1, 500],
    ["bufferMinutes", "Turnover buffer", "minutes", 0, 240],
    ["bookingWindowDays", "How far ahead guests can book", "days", 1, 365],
  ] as const;

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">
          Weekly schedule
        </p>
        <h2 className="mt-1 text-xl font-black sm:text-2xl">Reservation hours</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">
          Set the times guests can reserve. Add a second time period when you close between services.
        </p>

        <div className="mt-5 space-y-3">
          {WEEKDAY_LABELS.map(({ key, label }) => {
            const schedule = week[key] || {
              closed: true,
              ranges: [{ open: "17:00", close: "22:00" }],
            };
            return (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-black">{label}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-black text-white/60">
                    <input
                      type="checkbox"
                      checked={schedule.closed}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateDay(key, (current) => ({
                          ...current,
                          closed: event.target.checked,
                        }))
                      }
                    />
                    Closed
                  </label>

                  {!schedule.closed ? (
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {schedule.ranges.map((range, index) => (
                        <div key={`${key}-${index}`} className="contents">
                          <label className="text-xs font-black text-white/50">
                            {index === 0 ? "Opens" : "Reopens"}
                            <input
                              type="time"
                              value={range.open}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateRange(key, index, "open", event.target.value)
                              }
                              className={inputClass}
                            />
                          </label>
                          <label className="text-xs font-black text-white/50">
                            {index === 0 ? "Closes" : "Final close"}
                            <input
                              type="time"
                              value={range.close}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateRange(key, index, "close", event.target.value)
                              }
                              className={inputClass}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!schedule.closed && canEdit ? (
                    schedule.ranges.length < 2 ? (
                      <button
                        type="button"
                        onClick={() => addSecondWindow(key)}
                        className="shrink-0 text-xs font-black text-[#ff8aa0]"
                      >
                        + Add second period
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeSecondWindow(key)}
                        className="shrink-0 text-xs font-black text-white/45"
                      >
                        Remove second period
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">
              Special dates
            </p>
            <h2 className="mt-1 text-xl font-black">Holiday & event hours</h2>
            <p className="mt-2 text-sm font-semibold text-white/45">
              Change normal reservation hours for holidays, private events, or one-time closures.
            </p>
            <div className="mt-4 space-y-2">
              {Object.entries(specialHours).length ? (
                Object.entries(specialHours)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, value]) => {
                    const record = value as any;
                    const label = record?.closed
                      ? "Closed"
                      : record?.open && record?.close
                        ? `${record.open} - ${record.close}`
                        : String(value);
                    return (
                      <div
                        key={date}
                        className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-black">{date}</p>
                          <p className="mt-0.5 text-xs font-bold text-white/45">{label}</p>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSpecialHours((current) => {
                                const next = { ...current };
                                delete next[date];
                                return next;
                              })
                            }
                            className="text-xs font-black text-[#ff8aa0]"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 p-4">
                  <p className="text-sm font-black">No special dates added.</p>
                  <p className="mt-1 text-xs text-white/35">
                    Your normal weekly hours will be used.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <h3 className="text-sm font-black">Add special date</h3>
            <label className="mt-3 block text-xs font-black text-white/55">
              Date
              <input
                type="date"
                value={specialDate}
                disabled={!canEdit}
                onChange={(event) => setSpecialDate(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs font-black text-white/60">
              <input
                type="checkbox"
                checked={specialClosed}
                disabled={!canEdit}
                onChange={(event) => setSpecialClosed(event.target.checked)}
              />
              Closed all day
            </label>
            {!specialClosed ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs font-black text-white/55">
                  Opens
                  <input
                    type="time"
                    value={specialOpen}
                    disabled={!canEdit}
                    onChange={(event) => setSpecialOpen(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-black text-white/55">
                  Closes
                  <input
                    type="time"
                    value={specialClose}
                    disabled={!canEdit}
                    onChange={(event) => setSpecialClose(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}
            <button
              type="button"
              disabled={!canEdit || !specialDate}
              onClick={addSpecialHours}
              className="mt-4 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-black transition hover:border-[#e1062a]/35 hover:bg-[#e1062a]/10 disabled:opacity-40"
            >
              Add date
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">
          Reservation limits
        </p>
        <h2 className="mt-1 text-xl font-black">Capacity & timing</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">
          Set practical limits for party size, guest volume, reservation length, and how far ahead guests can book.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {capacityFields.map(([key, label, helper, min, max]) => (
            <label key={key} className="text-xs font-black text-white/60">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                disabled={!canEdit}
                value={capacity[key] ?? ""}
                onChange={(event) => updateCapacity(key, event.target.value)}
                className={inputClass}
                placeholder={key === "slotCapacity" ? "No limit" : undefined}
              />
              <span className="mt-1 block text-[10px] font-semibold text-white/30">
                {helper}
              </span>
            </label>
          ))}
        </div>
      </Panel>

      <SettingsNotice message={message} />
      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white shadow-[0_10px_25px_rgba(225,6,42,.22)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save hours & availability"}
        </button>
      ) : (
        <p className="text-sm font-semibold text-white/40">
          You can view these settings, but your role cannot change hours or availability.
        </p>
      )}
    </div>
  );
}

export default function ReserveSettingsControlCenter({
  locationId,
  locationType,
  locationName,
  adminLocationId = "",
  demo = false,
  fromDemoCenter = false,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedSection = searchParams.get("section") as SectionKey | null;
  const activeSection = sections.some((item) => item.key === requestedSection)
    ? (requestedSection as SectionKey)
    : "overview";
  const [data, setData] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const contextParams = useMemo(() => {
    const params = new URLSearchParams();
    if (adminLocationId) params.set("adminLocationId", adminLocationId);
    else params.set("locationId", locationId);
    params.set("type", locationType);
    if (demo) params.set("demo", "1");
    if (fromDemoCenter) params.set("fromDemoCenter", "1");
    return params;
  }, [adminLocationId, locationId, locationType, demo, fromDemoCenter]);

  function settingsHref(section?: SectionKey) {
    const params = new URLSearchParams(contextParams);
    if (section && section !== "overview") params.set("section", section);
    else params.delete("section");
    return `/locations/dashboard/reservations/settings?${params.toString()}`;
  }

  const reserveHref = `/locations/dashboard/reservations?${contextParams.toString()}`;
  const bookingHref = `/reserve/${encodeURIComponent(locationType)}/${encodeURIComponent(locationId)}`;
  const embedHref = `/embed/reservations/${encodeURIComponent(locationId)}?type=${encodeURIComponent(locationType)}`;

  async function load() {
    if (!locationId) return;
    const response = await fetch(
      `/api/reserve/portal/settings?locationId=${encodeURIComponent(locationId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "We could not load reservation settings.");
    setData(payload);
    setBooking(payload.booking || {});
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We could not load reservation settings.",
      }),
    );
  }, [locationId]);

  function changeSection(section: SectionKey) {
    router.push(settingsHref(section), { scroll: false });
  }

  function updateBooking(key: string, value: unknown) {
    setBooking((current: any) => ({ ...current, [key]: value }));
  }

  async function saveBooking() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, booking }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We could not save booking settings.");
      setBooking(payload.booking);
      setMessage({
        tone: "success",
        text: "Guest booking settings saved.",
      });
      await load();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "We could not save booking settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  const canManageReservations = Boolean(
    data?.access?.permissions?.manageReservations,
  );
  const currentName = data?.location?.name || locationName;
  const capacity = data?.capacity || {};

  const overviewCards = [
    [
      "Online reservations",
      booking?.onlineBookingEnabled !== false ? "Accepting" : "Paused",
      booking?.onlineBookingEnabled !== false,
    ],
    [
      "Confirmation",
      booking?.confirmationMode === "approval" ? "Staff approval" : "Instant",
      booking?.confirmationMode !== "approval",
    ],
    ["Standard visit", `${capacity.defaultDurationMinutes || 90} min`, true],
    ["Book ahead", `${capacity.bookingWindowDays || 30} days`, true],
    [
      "Card guarantee",
      data?.guaranteeEnabled ? "Enabled" : "Optional",
      Boolean(data?.guaranteeEnabled),
    ],
    ["Payments", data?.stripeReady ? "Ready" : "Needs setup", Boolean(data?.stripeReady)],
    [
      "Large parties",
      data?.largeGroupsEnabled ? "Accepted" : "Off",
      Boolean(data?.largeGroupsEnabled),
    ],
    [
      "Waitlist",
      booking?.waitlistEnabled !== false ? "Enabled" : "Off",
      booking?.waitlistEnabled !== false,
    ],
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090b0f] shadow-2xl">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.18),transparent_42%)] p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#e1062a]/30 bg-[#e1062a]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff8aa0]">
                  TheOutHaven Reserve
                </span>
                <StatusPill good={booking?.onlineBookingEnabled !== false}>
                  {booking?.onlineBookingEnabled !== false ? "Online" : "Paused"}
                </StatusPill>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
                Reservation Settings
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/48 sm:text-[15px]">
                Manage how {currentName} accepts reservations, schedules guests, handles policies, sends reminders, and shares booking links.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={reserveHref}
                className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                ← Reservations
              </Link>
              <Link
                href={bookingHref}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e1062a] px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(225,6,42,.2)]"
              >
                View guest booking page <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-3 py-3 sm:px-5">
          <nav className="flex min-w-max gap-1" aria-label="Reservation settings sections">
            {sections.map((item) => {
              const Icon = item.icon;
              const selected = item.key === activeSection;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => changeSection(item.key)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-black transition ${
                    selected
                      ? "bg-[#e1062a] text-white"
                      : "text-white/45 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon size={14} /> {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mt-5">
        {activeSection === "overview" ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map(([label, value, good]) => (
                <Panel key={String(label)} className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                    {String(label)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-lg font-black text-white">{String(value)}</p>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        good ? "bg-emerald-400" : "bg-[#e1062a]"
                      }`}
                    />
                  </div>
                </Panel>
              ))}
            </div>

            <Panel className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                    Reservation setup
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Everything in one place</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/45">
                    Changes to guest booking and availability appear on your booking page right away. Policies already accepted by guests stay attached to their existing reservations.
                  </p>
                </div>
                <CheckCircle2 className="hidden text-emerald-400 lg:block" size={36} />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sections.slice(1).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => changeSection(item.key)}
                      className="group flex min-h-20 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#e1062a]/30 hover:bg-[#e1062a]/[0.06]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-[#ff8aa0]">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-white">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-white/38">
                          Manage →
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "booking" && booking ? (
          <div className="space-y-5">
            <Panel className="p-5 sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                Online reservations
              </p>
              <h2 className="mt-1 text-2xl font-black">What guests can do</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">
                These settings control the guest booking experience on TheOutHaven and your reservation page.
              </p>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <Toggle
                  label="Accept online reservations"
                  description="Pause or reopen guest booking while staff can continue managing reservations manually."
                  checked={booking.onlineBookingEnabled !== false}
                  disabled={!canManageReservations}
                  onChange={(value) => updateBooking("onlineBookingEnabled", value)}
                />
                <Toggle
                  label="Allow same-day reservations"
                  description="Let guests reserve for today when space is available."
                  checked={booking.allowSameDay !== false}
                  disabled={!canManageReservations}
                  onChange={(value) => updateBooking("allowSameDay", value)}
                />
                <Toggle
                  label="Offer a waitlist"
                  description="Give guests a waitlist option when their preferred time is unavailable."
                  checked={booking.waitlistEnabled !== false}
                  disabled={!canManageReservations}
                  onChange={(value) => updateBooking("waitlistEnabled", value)}
                />
                <Toggle
                  label="Allow guest notes"
                  description="Let guests add requests or helpful details when they reserve."
                  checked={booking.guestNotesEnabled !== false}
                  disabled={!canManageReservations}
                  onChange={(value) => updateBooking("guestNotesEnabled", value)}
                />
              </div>
            </Panel>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel className="p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                  Confirmation
                </p>
                <h2 className="mt-1 text-xl font-black">How reservations are confirmed</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    [
                      "instant",
                      "Instant confirmation",
                      "Guests receive a confirmed reservation immediately when the time is available.",
                    ],
                    [
                      "approval",
                      "Staff approval",
                      "Guests send a request and your team confirms it before it becomes final.",
                    ],
                  ].map(([value, label, description]) => {
                    const selected = booking.confirmationMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!canManageReservations}
                        onClick={() => updateBooking("confirmationMode", value)}
                        className={`rounded-2xl border p-4 text-left transition disabled:opacity-45 ${
                          selected
                            ? "border-[#e1062a] bg-[#e1062a]/10"
                            : "border-white/10 bg-white/[0.03]"
                        }`}
                      >
                        <p className="text-sm font-black">{label}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-white/40">
                          {description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel className="p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                  Advance notice
                </p>
                <h2 className="mt-1 text-xl font-black">Minimum notice before arrival</h2>
                <p className="mt-2 text-sm font-semibold text-white/45">
                  Prevent guests from booking too close to their arrival time. For example, 120 minutes means two hours of notice.
                </p>
                <label className="mt-4 block text-xs font-black text-white/60">
                  Minimum notice (minutes)
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    step="15"
                    disabled={!canManageReservations}
                    value={booking.minimumLeadMinutes ?? 0}
                    onChange={(event) =>
                      updateBooking("minimumLeadMinutes", Number(event.target.value))
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#080a0e] px-3 text-sm font-bold outline-none focus:border-[#e1062a]/60"
                  />
                </label>
              </Panel>
            </div>

            <SettingsNotice message={message} />
            {canManageReservations ? (
              <button
                type="button"
                onClick={saveBooking}
                disabled={saving}
                className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white shadow-[0_10px_25px_rgba(225,6,42,.22)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save guest booking settings"}
              </button>
            ) : (
              <p className="text-sm font-semibold text-white/40">
                You can view these settings, but your role cannot change guest booking.
              </p>
            )}
          </div>
        ) : null}

        {activeSection === "hours" ? (
          <HoursCapacityControl
            locationId={locationId}
            onChanged={() => void load()}
          />
        ) : null}

        {activeSection === "layout" ? (
          <Panel className="overflow-hidden p-2 sm:p-3">
            <ReserveLayoutManager
              embedded
              adminMode={Boolean(adminLocationId || demo)}
              initialLocationId={locationId}
              initialLocationType={locationType}
              backHref={settingsHref("layout")}
              onChanged={() => void load()}
            />
          </Panel>
        ) : null}

        {activeSection === "reminders" ? (
          <Panel className="p-5 sm:p-6">
            <ReserveRemindersSettings locationId={locationId} />
          </Panel>
        ) : null}

        {activeSection === "policies" ? (
          <ReserveLargeGroupSettings locationId={locationId} />
        ) : null}

        {activeSection === "distribution" ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel className="p-5 sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                Guest booking page
              </p>
              <h2 className="mt-1 text-xl font-black">Share your reservation link</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
                Use this link on your website, social profiles, Google Business Profile, emails, and marketing.
              </p>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
                <p className="break-all">{bookingHref}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={bookingHref}
                  target="_blank"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#e1062a] px-4 text-xs font-black"
                >
                  Open booking page <ExternalLink size={13} />
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      `${window.location.origin}${bookingHref}`,
                    )
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-xs font-black text-white/70"
                >
                  <Copy size={13} /> Copy link
                </button>
              </div>
            </Panel>

            <Panel className="p-5 sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                Your website
              </p>
              <h2 className="mt-1 text-xl font-black">Add reservations to your website</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/45">
                Keep guests on your own website while they reserve through TheOutHaven.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`${embedHref}&preview=1`}
                  target="_blank"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#e1062a] px-4 text-xs font-black"
                >
                  Preview on a website <ExternalLink size={13} />
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      `<iframe src="${window.location.origin}${embedHref}" title="${currentName} reservations" loading="lazy"></iframe>`,
                    )
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-xs font-black text-white/70"
                >
                  <Copy size={13} /> Copy website code
                </button>
              </div>
              <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-xs font-black text-white/55">
                  Advanced website code
                </summary>
                <code className="mt-3 block overflow-x-auto text-xs text-white/45">
                  {`<iframe src="${embedHref}" title="${currentName} reservations" loading="lazy"></iframe>`}
                </code>
              </details>
            </Panel>
          </div>
        ) : null}

        {activeSection === "qr" ? (
          <Panel className="p-5 sm:p-6">
            <ReserveQrSettings locationId={locationId} />
          </Panel>
        ) : null}

        {activeSection === "team" ? (
          <Panel className="p-5 sm:p-6">
            <ReserveTeamSettings locationId={locationId} />
          </Panel>
        ) : null}
      </div>

      {activeSection !== "booking" ? (
        <div className="mt-5">
          <SettingsNotice message={message} />
        </div>
      ) : null}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-5 text-xs font-semibold text-white/30">
        <span>{currentName} · Reservation settings</span>
        <span className="inline-flex items-center gap-1.5">
          <CreditCard size={12} /> Card guarantees and reservation payments use your TheOutHaven Payments connection.
        </span>
      </footer>
    </div>
  );
}
