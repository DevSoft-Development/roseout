"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Users } from "lucide-react";
import { API_ROUTES } from "@/lib/routes";

type Props = {
  locationId: string;
  locationType: string;
  locationName: string;
  defaultDuration: number;
};

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CONTACT_ERROR =
  "Enter an email address or a mobile number and agree to text updates.";

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

function addDays(value: string, amount: number) {
  const date = parseISODate(value);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

function todayISO() {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

function calendarDays(viewMonth: Date) {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const days: (Date | null)[] = Array.from(
    { length: first.getDay() },
    () => null,
  );
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function formatSlot(value: string) {
  return new Date(
    `2000-01-01T${String(value).slice(0, 5)}:00`,
  ).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function contactFrom(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const smsConsent = Boolean(formData.get("smsConsent")) && Boolean(phone);
  return { email, phone: smsConsent ? phone : "", smsConsent };
}

export default function ReserveBookingForm({
  locationId,
  locationType,
  locationName,
  defaultDuration,
}: Props) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const selected = parseISODate(today);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const [partySize, setPartySize] = useState(2);
  const [minPartySize, setMinPartySize] = useState(1);
  const [maxPartySize, setMaxPartySize] = useState(12);
  const [bookingWindowDays, setBookingWindowDays] = useState(30);
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [guestNotesEnabled, setGuestNotesEnabled] = useState(true);
  const [confirmationMode, setConfirmationMode] = useState<"instant" | "approval">(
    "instant",
  );
  const [availabilityReason, setAvailabilityReason] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [duration, setDuration] = useState(defaultDuration);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [waitlistAvailable, setWaitlistAvailable] = useState(false);
  const monthDays = useMemo(() => calendarDays(calendarMonth), [calendarMonth]);
  const latestBookableDate = addDays(today, bookingWindowDays);
  const canWaitlist = waitlistEnabled && (waitlistAvailable || !slots.length);
  const partyOptions = useMemo(() => {
    const count = Math.max(maxPartySize - minPartySize + 1, 1);
    return Array.from({ length: Math.min(count, 100) }, (_, index) =>
      minPartySize + index,
    );
  }, [minPartySize, maxPartySize]);

  useEffect(() => {
    if (!date) return;
    async function loadSlots() {
      setLoading(true);
      setSelectedSlot("");
      setMessage("");
      setError("");
      setAvailabilityReason("");
      setWaitlistAvailable(false);

      const params = new URLSearchParams({
        locationId,
        locationType,
        date,
        partySize: String(partySize),
      });
      const response = await fetch(
        `/api/reserve/availability?${params.toString()}`,
      );
      const data = await response.json().catch(() => ({}));

      const nextMin = Math.max(Number(data.minPartySize || 1), 1);
      const nextMax = Math.max(Number(data.maxPartySize || 12), nextMin);
      setMinPartySize(nextMin);
      setMaxPartySize(nextMax);
      setBookingWindowDays(Math.max(Number(data.bookingWindowDays || 30), 1));
      setBookingEnabled(data.bookingEnabled !== false);
      setWaitlistEnabled(data.waitlistEnabled !== false);
      setGuestNotesEnabled(data.guestNotesEnabled !== false);
      setConfirmationMode(
        data.confirmationMode === "approval" ? "approval" : "instant",
      );
      setAvailabilityReason(String(data.reason || ""));
      setSlots(response.ok ? data.slots || [] : []);
      setDuration(data.durationMinutes || defaultDuration);
      setLoading(false);

      if (partySize < nextMin) setPartySize(nextMin);
      else if (partySize > nextMax) setPartySize(nextMax);
    }
    void loadSlots();
  }, [date, partySize, locationId, locationType, defaultDuration]);

  function chooseDate(dayValue: Date) {
    const iso = toISODate(dayValue);
    if (iso < today || iso > latestBookableDate) return;
    setDate(iso);
    setSelectedSlot("");
  }

  async function submitReservation(formData: FormData) {
    if (!selectedSlot || !bookingEnabled) return;
    const contact = contactFrom(formData);
    if (!contact.email && !contact.smsConsent) {
      setError(CONTACT_ERROR);
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    setWaitlistAvailable(false);

    const payload = {
      location_id: locationId,
      location_type: locationType,
      customer_name: String(formData.get("name") || ""),
      customer_email: contact.email || null,
      customer_phone: contact.phone || null,
      party_size: partySize,
      special_request: guestNotesEnabled
        ? String(formData.get("notes") || "")
        : "",
      reservation_date: date,
      reservation_time: selectedSlot,
      duration_minutes: duration,
    };

    const lockResponse = await fetch("/api/reservations/lock-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const lockData = await lockResponse.json().catch(() => ({}));
    if (!lockResponse.ok) {
      setSubmitting(false);
      setError(lockData.reason || "That time is no longer available.");
      setWaitlistAvailable(waitlistEnabled);
      return;
    }

    const response = await fetch("/api/reserve/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, slot_lock_id: lockData.lock_id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError(data.error || "Unable to request reservation.");
      setWaitlistAvailable(
        waitlistEnabled && Boolean(data.waitlist_available),
      );
      return;
    }

    if (
      data.reservation?.guarantee_required &&
      data.reservation?.customer_token
    ) {
      window.location.assign(
        `/reserve/confirmation/${encodeURIComponent(data.reservation.customer_token)}`,
      );
      return;
    }

    setSubmitting(false);
    setMessage(
      data.reservation?.status === "confirmed"
        ? "Reservation confirmed. Check your email or SMS for details."
        : "Reservation request received and pending confirmation.",
    );
  }

  async function joinWaitlist(formData: FormData) {
    if (!waitlistEnabled) return;
    const contact = contactFrom(formData);
    if (!contact.email && !contact.smsConsent) {
      setError(CONTACT_ERROR);
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    const response = await fetch(API_ROUTES.reservePortalWaitlist, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        reservation_date: date,
        reservation_time: selectedSlot || slots[0] || "19:00",
        party_size: partySize,
        contact_name: String(formData.get("name") || ""),
        contact_email: contact.email || null,
        contact_phone: contact.phone || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setError(data.error || "Unable to join waitlist.");
      return;
    }
    setMessage(
      `You're on the waitlist. Current position: ${data.waitlist_position}.`,
    );
    setWaitlistAvailable(false);
  }

  const formAction = canWaitlist ? joinWaitlist : submitReservation;
  const submitDisabled =
    submitting ||
    !bookingEnabled ||
    (!canWaitlist && !selectedSlot) ||
    (!slots.length && !canWaitlist);

  return (
    <div className="bg-[#f7f3ec] p-4 text-[#201916] sm:p-6">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#9a5c3d]">
        Reservations
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Find a time</h2>
          <p className="mt-1 text-sm font-medium text-black/55">
            Book {locationName} without leaving this website.
          </p>
          <p className="mt-2 text-xs font-bold text-black/40">
            {confirmationMode === "approval"
              ? "Reservation requests are reviewed by the location before confirmation."
              : "Available reservations are confirmed instantly."}
          </p>
        </div>
        <div className="hidden rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-black text-black/55 sm:block">
          {duration} min
        </div>
      </div>

      {!bookingEnabled ? (
        <div className="mt-5 rounded-2xl border border-[#9a5c3d]/20 bg-white p-5">
          <p className="text-sm font-black">Online reservations are paused.</p>
          <p className="mt-1 text-sm font-medium text-black/50">
            This location is not accepting new online reservations right now.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.05fr]">
            <section
              className="rounded-2xl border border-black/10 bg-white p-4"
              aria-label="Choose reservation date"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCalendarMonth(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() - 1,
                          1,
                        ),
                    )
                  }
                  className="grid h-9 w-9 place-items-center rounded-full border border-black/10 hover:bg-black/[0.04]"
                >
                  <ChevronLeft size={16} />
                </button>
                <p className="text-sm font-black">
                  {calendarMonth.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCalendarMonth(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                  className="grid h-9 w-9 place-items-center rounded-full border border-black/10 hover:bg-black/[0.04]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                {DAY_LABELS.map((label) => (
                  <span
                    key={label}
                    className="py-1 text-[10px] font-black uppercase text-black/35"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {monthDays.map((dayValue, index) => {
                  if (!dayValue) return <span key={`blank-${index}`} />;
                  const iso = toISODate(dayValue);
                  const disabled = iso < today || iso > latestBookableDate;
                  const selected = iso === date;
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => chooseDate(dayValue)}
                      className={`aspect-square rounded-xl text-xs font-black transition ${
                        selected
                          ? "bg-[#9a5c3d] text-white shadow-md"
                          : disabled
                            ? "text-black/20"
                            : "text-black/70 hover:bg-[#efe6db]"
                      }`}
                    >
                      {dayValue.getDate()}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] font-bold text-black/35">
                Booking window: {bookingWindowDays} days
              </p>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock3 size={16} className="text-[#9a5c3d]" />
                  <p className="text-sm font-black">Available times</p>
                </div>
                <label className="flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs font-black">
                  <Users size={14} />
                  <select
                    aria-label="Party size"
                    value={partySize}
                    onChange={(event) => setPartySize(Number(event.target.value))}
                    className="bg-transparent outline-none"
                  >
                    {partyOptions.map((size) => (
                      <option key={size} value={size}>
                        {size} {size === 1 ? "guest" : "guests"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs font-bold text-black/40">
                {parseISODate(date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              {loading ? (
                <div className="mt-4 rounded-xl bg-[#f7f3ec] p-4 text-sm font-bold text-black/45">
                  Checking availability…
                </div>
              ) : !slots.length ? (
                <div className="mt-4 rounded-xl bg-[#f7f3ec] p-4 text-sm font-bold text-black/45">
                  {availabilityReason || "No times available for this date."}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                        selectedSlot === slot
                          ? "border-[#9a5c3d] bg-[#9a5c3d] text-white"
                          : "border-black/10 bg-white hover:border-[#9a5c3d]/50 hover:bg-[#f7f3ec]"
                      }`}
                    >
                      {formatSlot(slot)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <form
            className="mt-4 space-y-3 rounded-2xl border border-black/10 bg-white p-4"
            action={formAction}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="name"
                required
                placeholder="Full name"
                className="h-11 rounded-xl border border-black/10 px-3 text-sm font-bold outline-none focus:border-[#9a5c3d]"
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                className="h-11 rounded-xl border border-black/10 px-3 text-sm font-bold outline-none focus:border-[#9a5c3d]"
              />
            </div>
            <div className={`grid gap-3 ${guestNotesEnabled ? "sm:grid-cols-2" : ""}`}>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Mobile number"
                className="h-11 rounded-xl border border-black/10 px-3 text-sm font-bold outline-none focus:border-[#9a5c3d]"
              />
              {guestNotesEnabled ? (
                <input
                  name="notes"
                  placeholder="Special request (optional)"
                  className="h-11 rounded-xl border border-black/10 px-3 text-sm font-bold outline-none focus:border-[#9a5c3d]"
                />
              ) : null}
            </div>
            <p className="text-xs font-semibold leading-5 text-black/45">
              Provide an email address, a mobile number for text updates, or both.
            </p>
            <div className="rounded-xl border border-black/10 bg-[#f7f3ec] p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="smsConsent"
                  value="yes"
                  className="mt-1 h-4 w-4 shrink-0 accent-[#9a5c3d]"
                />
                <span className="text-xs font-semibold leading-5 text-black/65">
                  I agree to receive SMS messages from TheOutHaven about my
                  reservation, reservation reminders, account notifications,
                  and customer care. Message frequency varies. Message and data
                  rates may apply. Reply STOP to opt out or HELP for help.
                  Consent is not a condition of purchase.
                </span>
              </label>
              <p className="mt-2 pl-7 text-[11px] leading-5 text-black/45">
                See our{" "}
                <a
                  href="/sms-terms"
                  target="_blank"
                  rel="noreferrer"
                  className="font-black underline underline-offset-2"
                >
                  SMS Terms
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-black underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                .
              </p>
              <p className="mt-2 pl-7 text-[11px] leading-5 text-black/45">
                <strong>Email terms:</strong> If you provide an email address,
                you agree to receive transactional reservation confirmations,
                updates, and reminders by email. These emails are about your
                reservation and are not marketing messages.
              </p>
            </div>
            {error ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">
                {message}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={submitDisabled}
              className="h-12 w-full rounded-xl bg-[#201916] text-sm font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? "Working…"
                : canWaitlist
                  ? "Join waitlist"
                  : selectedSlot
                    ? confirmationMode === "approval"
                      ? `Request ${formatSlot(selectedSlot)}`
                      : `Reserve ${formatSlot(selectedSlot)}`
                    : "Choose a time"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
