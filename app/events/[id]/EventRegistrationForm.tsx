"use client";

import { useState } from "react";

export default function EventRegistrationForm({ eventId, isFree }: { eventId: string; isFree: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Registration could not be completed");
      if (payload?.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      if (!payload?.ticketUrl) throw new Error("Ticket link was not returned");
      window.location.href = payload.ticketUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration could not be completed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={register} className="mt-6 space-y-3 border-t border-white/10 pt-5">
      <div>
        <h3 className="font-bold">{isFree ? "Get your ticket" : "Buy your ticket"}</h3>
        <p className="mt-1 text-xs leading-5 text-white/45">
          {isFree
            ? "Your QR ticket will be shown immediately and sent by email. Add a mobile number to receive the secure ticket link by text too."
            : "You’ll continue to secure TheOutHaven Payments checkout. Your QR ticket is issued only after payment succeeds and is sent by email, with SMS delivery when a mobile number is provided."}
        </p>
      </div>
      <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Full name" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-red-400/60" />
      <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" placeholder="Email" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-red-400/60" />
      <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" placeholder="Mobile number (optional)" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-red-400/60" />
      {error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs font-semibold text-red-200">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? (isFree ? "Creating ticket…" : "Starting checkout…") : (isFree ? "Register & Get QR Ticket" : "Continue to Payment")}
      </button>
      {!isFree ? <p className="text-center text-[11px] text-white/35">Payments and payouts are powered by Stripe.</p> : null}
    </form>
  );
}
