"use client";

import { useEffect, useState } from "react";

type Props = {
  locationId: string;
  locationType: string;
  locationName: string;
  defaultDuration: number;
};

function formatSlot(value: string) {
  return new Date(`2000-01-01T${String(value).slice(0, 5)}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReserveBookingForm({
  locationId,
  locationType,
  locationName,
  defaultDuration,
}: Props) {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [duration, setDuration] = useState(defaultDuration);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [waitlistAvailable, setWaitlistAvailable] = useState(false);

  useEffect(() => {
    if (!date) return;

    async function loadSlots() {
      setLoading(true);
      setSelectedSlot("");
      setMessage("");
      setError("");
      setWaitlistAvailable(false);

      const res = await fetch(
        `/api/reserve/availability?locationId=${locationId}&locationType=${locationType}&date=${date}`
      );

      const data = await res.json();

      setSlots(data.slots || []);
      setDuration(data.durationMinutes || defaultDuration);
      setLoading(false);
    }

    loadSlots();
  }, [date, locationId, locationType, defaultDuration]);

  async function submitReservation(formData: FormData) {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    setWaitlistAvailable(false);

    const payload = {
      location_id: locationId,
      location_type: locationType,
      customer_name: String(formData.get("name") || ""),
      customer_email: String(formData.get("email") || ""),
      customer_phone: String(formData.get("phone") || ""),
      party_size: Number(formData.get("party_size") || 2),
      special_request: String(formData.get("notes") || ""),
      reservation_date: date,
      reservation_time: selectedSlot,
      duration_minutes: duration,
    };

    const lockResponse = await fetch("/api/reservations/lock-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const lockData = await lockResponse.json();

    if (!lockResponse.ok) {
      setSubmitting(false);
      setError(lockData.reason || "Slot no longer available.");
      setWaitlistAvailable(true);
      return;
    }

    const response = await fetch("/api/reserve/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, slot_lock_id: lockData.lock_id }),
    });
    const data = await response.json();

    setSubmitting(false);

    if (!response.ok) {
      setError(data.error || "Unable to request reservation.");
      setWaitlistAvailable(Boolean(data.waitlist_available));
      return;
    }

    setMessage(data.auto_confirmed ? "Reservation confirmed. Check your email/SMS for details." : "Reservation request received and pending confirmation.");
  }

  async function joinWaitlist(formData: FormData) {
    setSubmitting(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/reservations/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        reservation_date: date,
        reservation_time: selectedSlot || slots[0] || "19:00",
        party_size: Number(formData.get("party_size") || 2),
        contact_name: String(formData.get("name") || ""),
        contact_email: String(formData.get("email") || ""),
        contact_phone: String(formData.get("phone") || ""),
      }),
    });
    const data = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(data.error || "Unable to join waitlist.");
      return;
    }

    setMessage(`You're on the waitlist. Current position: ${data.waitlist_position}.`);
    setWaitlistAvailable(false);
  }

  return (
    <div className="bg-[#f8f3ef] p-6 text-[#1b1210] lg:p-7">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-700">
        Book this location
      </p>

      <h2 className="mt-2 text-2xl font-black">Reserve your time</h2>

      <p className="mt-2 text-sm font-medium text-black/55">
        Choose an available time for {locationName}. This location blocks{" "}
        {duration} minutes per booking.
      </p>

      <form className="mt-6 space-y-4" action={waitlistAvailable ? joinWaitlist : submitReservation}>
        <div>
          <label className="text-sm font-black">Date</label>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-rose-500"
          />
        </div>

        <div>
          <label className="text-sm font-black">Available times</label>

          {!date ? (
            <div className="mt-2 rounded-2xl bg-white p-4 text-sm font-bold text-black/45">
              Select a date to see available times.
            </div>
          ) : loading ? (
            <div className="mt-2 rounded-2xl bg-white p-4 text-sm font-bold text-black/45">
              Checking availability...
            </div>
          ) : !slots.length ? (
            <div className="mt-2 rounded-2xl bg-white p-4 text-sm font-bold text-black/45">
              No times available for this date. You can join the waitlist below.
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-full border px-4 py-3 text-sm font-black transition ${
                    selectedSlot === slot
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-black/10 bg-white text-black hover:border-rose-400"
                  }`}
                >
                  {formatSlot(slot)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Full name" className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-rose-500" />
          <input name="party_size" type="number" min="1" defaultValue="2" placeholder="Party size" className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-rose-500" />
        </div>

        <input name="email" type="email" placeholder="Email" className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-rose-500" />
        <input name="phone" placeholder="Phone" className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-rose-500" />
        <textarea name="notes" placeholder="Notes or special request" rows={3} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-500" />

        {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">{message}</div> : null}

        <button type="submit" disabled={submitting || (!selectedSlot && !waitlistAvailable && slots.length > 0)} className="h-12 w-full rounded-full bg-gradient-to-r from-rose-500 to-rose-700 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? "Working..." : waitlistAvailable || !slots.length ? "Join Waitlist" : "Request Reservation"}
        </button>
      </form>
    </div>
  );
}
