"use client";
import { useState } from "react";
import TurnstileField from "@/components/security/TurnstileField";
import { getActiveAttributionContext } from "@/lib/analytics/trackClientEvent";

export function PublicLeadForm({ locationId, action, endpoint, button }: { locationId: string; action: string; endpoint: string; button: string }) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const eventLead = action === "event_lead";

  async function submit(formData: FormData) {
    setMessage("Submitting…");
    const body = Object.fromEntries(formData.entries());
    const attribution = eventLead ? getActiveAttributionContext() : null;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, locationId, turnstileToken: token, ...(attribution ? { attribution } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    setMessage(json.error || json.message || (res.ok ? "Thanks — your request was submitted." : "We could not submit this form right now. Please try again in a moment."));
    if (!res.ok) setToken("");
  }

  return (
    <form action={submit} className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <input required name="name" placeholder="Name" className="w-full rounded-xl bg-black/40 p-3"/>
        <input required name="email" type="email" placeholder="Email" className="w-full rounded-xl bg-black/40 p-3"/>
      </div>
      <input name="phone" placeholder="Phone" className="w-full rounded-xl bg-black/40 p-3"/>
      {eventLead ? (
        <>
          <input type="hidden" name="leadType" value="private_event" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="occasion" placeholder="Occasion (birthday, corporate, wedding…)" className="w-full rounded-xl bg-black/40 p-3"/>
            <input name="guestCount" type="number" min="1" max="5000" placeholder="Guest count" className="w-full rounded-xl bg-black/40 p-3"/>
            <input name="eventDate" type="date" className="w-full rounded-xl bg-black/40 p-3"/>
            <input name="eventTime" type="time" className="w-full rounded-xl bg-black/40 p-3"/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="budgetRange" placeholder="Budget or budget range" className="w-full rounded-xl bg-black/40 p-3"/>
            <input name="packageInterest" placeholder="Package interest" className="w-full rounded-xl bg-black/40 p-3"/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="foodNeeds" placeholder="Food needs" className="w-full rounded-xl bg-black/40 p-3"/>
            <input name="drinkNeeds" placeholder="Drink needs" className="w-full rounded-xl bg-black/40 p-3"/>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-3 text-sm text-white/70">
            <input type="checkbox" name="privateRoomNeeded" value="true" /> Private room or buyout preferred
          </label>
        </>
      ) : null}
      <textarea name="notes" placeholder={eventLead ? "Tell us anything else about the event" : "Tell us what you need"} className="min-h-28 w-full rounded-xl bg-black/40 p-3"/>
      <TurnstileField action={action} onToken={setToken}/>
      <button className="rounded-full bg-rose-600 px-5 py-3 font-black text-white">{button}</button>
      {message ? <p className="text-sm text-white/70">{message}</p> : null}
    </form>
  );
}
