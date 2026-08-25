"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Config = {
  enabled: boolean;
  minPartySize: number;
  maxPartySize: number;
  confirmationMode: "instant" | "approval";
  paymentMode: "none" | "card_guarantee" | "deposit";
  depositType: "flat" | "per_person";
  depositAmountCents: number;
  prixFixeMode: "none" | "optional" | "required";
  durationMinutes: number;
};

type Slot = { value: string; label: string; remainingCapacity: number };

type Props = {
  locationId: string;
  locationName: string;
  compact?: boolean;
};

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function LargeGroupBookingForm({
  locationId,
  locationName,
  compact = false,
}: Props) {
  const [date, setDate] = useState(todayKey());
  const [partySize, setPartySize] = useState(8);
  const [config, setConfig] = useState<Config | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setMessage("");
    const params = new URLSearchParams({
      locationId,
      date,
      partySize: String(partySize),
    });

    fetch(`/api/public/large-group-availability?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(data.error || "We could not load available times.");
        }
        setConfig(data.config || null);
        setSlots(data.slots || []);
        setTime((current) =>
          (data.slots || []).some((slot: Slot) => slot.value === current)
            ? current
            : data.slots?.[0]?.value || "",
        );
        if (data.reason) setMessage(data.reason);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "We could not load available times.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId, date, partySize]);

  const paymentCopy = useMemo(() => {
    if (!config) return "";
    if (config.paymentMode === "deposit") {
      const amount = money(config.depositAmountCents);
      return config.depositType === "per_person"
        ? `${amount} deposit per guest is required to secure this reservation.`
        : `${amount} deposit is required to secure this reservation.`;
    }
    if (config.paymentMode === "card_guarantee") {
      return "A card is required to guarantee this reservation. Any cancellation or no-show terms will be shown before you confirm.";
    }
    return config.confirmationMode === "instant"
      ? "This reservation can be confirmed immediately when a time is available."
      : "The location will review your request before it is confirmed.";
  }, [config]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!time) return;
    setSubmitting(true);
    setMessage("");

    try {
      const form = new FormData(event.currentTarget);
      const payload = {
        locationId,
        customerName: form.get("name"),
        customerEmail: form.get("email"),
        customerPhone: form.get("phone"),
        reservationDate: date,
        reservationTime: time,
        partySize,
        occasion: form.get("occasion"),
        prixFixeInterest: form.get("prixFixeInterest"),
        notes: form.get("notes"),
      };

      const response = await fetch("/api/public/large-group-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not complete this reservation.");
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setMessage(data.message || "Your large-party reservation has been submitted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not complete this reservation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (config && !config.enabled) return null;

  const submitLabel =
    config?.paymentMode === "deposit"
      ? "Continue to deposit"
      : config?.confirmationMode === "approval"
        ? "Request reservation"
        : "Book large party";

  return (
    <section
      className={
        compact
          ? "reserve-public-booking rounded-2xl border border-white/10 p-4"
          : "reserve-public-booking rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6"
      }
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff8aa0]">
        Large parties
      </p>
      <h2 className="mt-2 text-2xl font-black">
        Reserve for a large party at {locationName}
      </h2>
      <p className="mt-2 text-sm opacity-70">
        Choose your party size and date to see current availability and any
        special requirements for larger groups.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Party size
          <input
            type="number"
            min={config?.minPartySize || 2}
            max={config?.maxPartySize || 500}
            value={partySize}
            onChange={(event) =>
              setPartySize(Math.max(1, Number(event.target.value || 1)))
            }
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>
        <label className="text-sm font-bold">
          Date
          <input
            type="date"
            min={todayKey()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Available time
          <select
            value={time}
            onChange={(event) => setTime(event.target.value)}
            disabled={loadingSlots || slots.length === 0}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          >
            {loadingSlots ? (
              <option>Checking available times…</option>
            ) : slots.length ? (
              slots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))
            ) : (
              <option>No times available</option>
            )}
          </select>
        </label>
        <label className="text-sm font-bold">
          Name
          <input
            name="name"
            required
            autoComplete="name"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>
        <label className="text-sm font-bold">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>
        <label className="text-sm font-bold">
          Mobile number
          <input
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>
        <label className="text-sm font-bold">
          Occasion
          <input
            name="occasion"
            placeholder="Birthday, team dinner, celebration…"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>

        {config?.prixFixeMode !== "none" ? (
          <label className="text-sm font-bold sm:col-span-2">
            Group menu
            <select
              name="prixFixeInterest"
              defaultValue={
                config?.prixFixeMode === "required" ? "yes" : "unsure"
              }
              disabled={config?.prixFixeMode === "required"}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
            >
              <option value="no">No group menu</option>
              <option value="yes">Yes, fixed-price group menu</option>
              <option value="unsure">Not sure yet</option>
            </select>
            {config?.prixFixeMode === "required" ? (
              <>
                <input type="hidden" name="prixFixeInterest" value="yes" />
                <span className="mt-1 block text-xs opacity-60">
                  A group menu is required for this party size.
                </span>
              </>
            ) : null}
          </label>
        ) : (
          <input type="hidden" name="prixFixeInterest" value="no" />
        )}

        <label className="text-sm font-bold sm:col-span-2">
          Notes or special requests
          <textarea
            name="notes"
            rows={3}
            placeholder="Accessibility needs, seating requests, celebration details, or anything the location should know"
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3"
          />
        </label>

        {paymentCopy ? (
          <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs font-bold leading-5 opacity-75 sm:col-span-2">
            {paymentCopy}
          </p>
        ) : null}

        <button
          disabled={submitting || !time || loadingSlots}
          className="rounded-full bg-[#e1062a] px-5 py-3 font-black text-white shadow-[0_10px_24px_rgba(225,6,42,.2)] transition hover:bg-[#c80526] disabled:opacity-50 disabled:shadow-none sm:col-span-2"
        >
          {submitting ? "Submitting…" : submitLabel}
        </button>
        {message ? (
          <p className="text-sm font-bold sm:col-span-2">{message}</p>
        ) : null}
      </form>
    </section>
  );
}
