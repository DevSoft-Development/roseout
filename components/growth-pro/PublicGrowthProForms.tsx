"use client";

import { useState } from "react";
import TurnstileField from "@/components/security/TurnstileField";
import { getActiveAttributionContext } from "@/lib/analytics/trackClientEvent";

export function PublicLeadForm({
  locationId,
  action,
  endpoint,
  button,
}: {
  locationId: string;
  action: string;
  endpoint: string;
  button: string;
}) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const isEventLead = action === "event_lead";

  async function submit(formData: FormData) {
    setMessage("Submitting…");
    const body = Object.fromEntries(formData.entries());
    const attribution = getActiveAttributionContext();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        locationId,
        privateRoomNeeded: formData.get("privateRoomNeeded") === "on",
        turnstileToken: token,
        attribution,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setMessage(json.error || json.message || (res.ok ? "Thanks — your request was submitted." : "We could not submit this form right now. Please try again in a moment."));
    if (!res.ok) setToken("");
  }

  return (
    <form action={submit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      {isEventLead ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-bold">
            Request type
            <select name="leadType" defaultValue="private_event" className="w-full rounded-xl bg-black/40 p-3">
              <option value="private_event">Private event</option>
              <option value="catering">Catering</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold">
            Occasion
            <input name="occasion" placeholder="Birthday, corporate dinner, wedding…" className="w-full rounded-xl bg-black/40 p-3" />
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Name" className="w-full rounded-xl bg-black/40 p-3" />
        <input name="email" required type="email" placeholder="Email" className="w-full rounded-xl bg-black/40 p-3" />
      </div>
      <input name="phone" placeholder="Phone" className="w-full rounded-xl bg-black/40 p-3" />

      {isEventLead ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-2 text-sm font-bold">
              Event date
              <input name="eventDate" type="date" className="w-full rounded-xl bg-black/40 p-3" />
            </label>
            <label className="space-y-2 text-sm font-bold">
              Event time
              <input name="eventTime" placeholder="7:00 PM" className="w-full rounded-xl bg-black/40 p-3" />
            </label>
            <label className="space-y-2 text-sm font-bold">
              Guests
              <input name="guestCount" type="number" min="1" placeholder="25" className="w-full rounded-xl bg-black/40 p-3" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="budgetRange" placeholder="Budget range" className="w-full rounded-xl bg-black/40 p-3" />
            <input name="packageInterest" placeholder="Package or room interest" className="w-full rounded-xl bg-black/40 p-3" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <textarea name="foodNeeds" placeholder="Food / menu needs" className="min-h-24 w-full rounded-xl bg-black/40 p-3" />
            <textarea name="drinkNeeds" placeholder="Drink / bar needs" className="min-h-24 w-full rounded-xl bg-black/40 p-3" />
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-black/30 p-3 text-sm font-bold">
            <input name="privateRoomNeeded" type="checkbox" />
            Private room or dedicated event space needed
          </label>
        </>
      ) : null}

      <textarea name="notes" placeholder={isEventLead ? "Anything else the venue should know?" : "Tell us what you need"} className="min-h-28 w-full rounded-xl bg-black/40 p-3" />
      <TurnstileField action={action} onToken={setToken} />
      <button className="rounded-full bg-rose-600 px-5 py-3 font-black text-white">{button}</button>
      {message ? <p className="text-sm text-white/70">{message}</p> : null}
    </form>
  );
}
