"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { id: string; starts_at: string; ends_at: string; capacity: number; tables_available?: number | null };

export default function ExperienceBookingForm({ experienceId, slots, minParty, maxParty, pricingLabel, prepaymentRequired }: { experienceId: string; slots: Slot[]; minParty: number; maxParty: number; pricingLabel?: string; prepaymentRequired?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setBusy(true); setError("");
    const response = await fetch(`/api/experiences/${experienceId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: formData.get("slotId"), customerName: formData.get("customerName"), customerEmail: formData.get("customerEmail"), customerPhone: formData.get("customerPhone"), partySize: Number(formData.get("partySize")),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Booking failed."); setBusy(false); return; }
    if (payload.checkoutUrl) { window.location.assign(payload.checkoutUrl); return; }
    if (payload.passUrl) { router.push(payload.passUrl); return; }
    setError("Booking completed, but the confirmation page could not be opened.");
    setBusy(false);
  }

  if (!slots.length) return <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5 text-sm text-white/50">No future booking times are currently available.</div>;
  return <form action={submit} className="space-y-3 rounded-3xl border border-white/10 bg-white/[.04] p-5">
    <h2 className="text-xl font-black">Choose your time</h2>
    {pricingLabel ? <div className="rounded-xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-black uppercase tracking-[.14em] text-white/35">Price</p><p className="mt-1 font-black text-white">{pricingLabel}</p>{prepaymentRequired ? <p className="mt-1 text-xs font-semibold text-amber-200">Payment is collected securely at booking.</p> : null}</div> : null}
    <select name="slotId" required className="w-full rounded-xl border border-white/10 bg-black/50 p-3">{slots.map((slot) => <option key={slot.id} value={slot.id}>{new Date(slot.starts_at).toLocaleString()} – {new Date(slot.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</option>)}</select>
    <input name="customerName" required placeholder="Name" className="w-full rounded-xl border border-white/10 bg-black/30 p-3" />
    <input name="customerEmail" required type="email" placeholder="Email" className="w-full rounded-xl border border-white/10 bg-black/30 p-3" />
    <input name="customerPhone" type="tel" placeholder="Mobile number (optional)" className="w-full rounded-xl border border-white/10 bg-black/30 p-3" />
    <label className="block text-xs font-bold text-white/55">Party size<input name="partySize" required type="number" min={minParty} max={maxParty} defaultValue={minParty} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
    {error ? <p className="text-sm font-bold text-red-300">{error}</p> : null}
    <button disabled={busy} className="w-full rounded-xl bg-[#e1062a] px-4 py-3 font-black disabled:opacity-50">{busy ? "Booking…" : prepaymentRequired ? "Continue to Secure Payment" : "Book Experience"}</button>
    <p className="text-xs text-white/40">After booking, you’ll receive a QR check-in pass and a backup 6-character code.</p>
  </form>;
}
