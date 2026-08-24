"use client";

import { useEffect, useMemo, useState } from "react";

function dollars(cents: unknown) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function cents(value: string) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

export default function ReserveLargeGroupSettings({ locationId }: { locationId: string }) {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function load() {
    if (!locationId) return;
    const response = await fetch(`/api/reserve/portal/large-group-settings?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load reservation settings.");
    setData(payload);
    setForm(payload.location);
  }

  useEffect(() => { void load().catch((error) => setMessage({ tone: "error", text: error.message })); }, [locationId]);

  const depositPreview = useMemo(() => {
    if (!form || form.large_group_payment_mode !== "deposit") return null;
    const label = form.large_group_deposit_type === "per_person" ? "per guest" : "per booking";
    return `$${dollars(form.large_group_deposit_amount_cents)} ${label}`;
  }, [form]);

  if (!locationId) return <p className="reserve-muted text-sm">Choose a location first.</p>;
  if (!form) return <p className="reserve-muted text-sm">Loading reservation settings…</p>;

  function set(key: string, value: unknown) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reserve/portal/large-group-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save reservation settings.");
      setData(payload);
      setForm(payload.location);
      setMessage({ tone: "success", text: "Reservation policies saved." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to save settings." });
    } finally {
      setSaving(false);
    }
  }

  const input = "reserve-soft mt-1 w-full rounded-xl px-3 py-2";
  return <div className="space-y-5">
    <section className="reserve-card rounded-[2rem] p-5">
      <p className="text-xs font-black uppercase reserve-muted">Reservation Policies</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Regular and large-group defaults</h1>
          <p className="mt-1 max-w-3xl text-sm reserve-muted">TheOutHaven provides default cancellation and no-show policies. Your location can change every value below. Policy values are saved with each booking so later edits do not change terms already accepted by a guest.</p>
        </div>
      </div>
    </section>

    <section className="reserve-card rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">Regular reservations</h2>
          <p className="mt-1 max-w-2xl text-sm reserve-muted">Default: free cancellation until 6 hours before, 15-minute arrival grace, $10 per guest for a late cancellation, and $20 per guest for a no-show.</p>
        </div>
        <label className="reserve-soft flex items-center gap-3 rounded-full px-4 py-3 text-sm font-black"><input type="checkbox" checked={Boolean(form.reservation_guarantee_enabled)} onChange={(e) => set("reservation_guarantee_enabled", e.target.checked)} /> Card guarantee</label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Cancellation cutoff (hours)<input className={input} type="number" min="0" max="168" value={form.reservation_cancel_cutoff_hours ?? 6} onChange={(e) => set("reservation_cancel_cutoff_hours", Number(e.target.value))} /></label>
        <label className="text-xs font-bold">No-show grace (minutes)<input className={input} type="number" min="0" max="180" value={form.reservation_no_show_grace_minutes ?? 15} onChange={(e) => set("reservation_no_show_grace_minutes", Number(e.target.value))} /></label>
        <label className="text-xs font-bold">Late-cancel fee<select className={input} value={form.reservation_late_cancel_fee_type || "per_person"} onChange={(e) => set("reservation_late_cancel_fee_type", e.target.value)}><option value="flat">Flat fee</option><option value="per_person">Per person</option></select><input className={input} type="number" min="0" step="1" value={dollars(form.reservation_late_cancel_fee_cents ?? 1000)} onChange={(e) => set("reservation_late_cancel_fee_cents", cents(e.target.value))} /></label>
        <label className="text-xs font-bold">No-show fee<select className={input} value={form.reservation_no_show_fee_type || "per_person"} onChange={(e) => set("reservation_no_show_fee_type", e.target.value)}><option value="flat">Flat fee</option><option value="per_person">Per person</option></select><input className={input} type="number" min="0" step="1" value={dollars(form.reservation_no_show_fee_cents ?? 2000)} onChange={(e) => set("reservation_no_show_fee_cents", cents(e.target.value))} /></label>
      </div>
      {!data?.stripeReady && form.reservation_guarantee_enabled ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs font-bold text-amber-100">The policy can be configured now, but card guarantees cannot be used until TheOutHaven Payments setup is complete.</p> : null}
    </section>

    <section className="reserve-card rounded-[2rem] p-5">
      <div>
        <h2 className="text-lg font-black">Large-group cancellation & no-show policy</h2>
        <p className="mt-1 max-w-3xl text-sm reserve-muted">Default: free cancellation until 24 hours before, 15-minute arrival grace, $25 per guest for a late cancellation, and $50 per guest for a no-show. These settings are independent from regular reservations.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Cancellation cutoff (hours)<input className={input} type="number" min="0" max="336" value={form.large_group_cancel_cutoff_hours ?? 24} onChange={(e) => set("large_group_cancel_cutoff_hours", Number(e.target.value))} /></label>
        <label className="text-xs font-bold">No-show grace (minutes)<input className={input} type="number" min="0" max="180" value={form.large_group_no_show_grace_minutes ?? 15} onChange={(e) => set("large_group_no_show_grace_minutes", Number(e.target.value))} /></label>
        <label className="text-xs font-bold">Late-cancel fee<select className={input} value={form.large_group_late_cancel_fee_type || "per_person"} onChange={(e) => set("large_group_late_cancel_fee_type", e.target.value)}><option value="flat">Flat fee</option><option value="per_person">Per person</option></select><input className={input} type="number" min="0" step="1" value={dollars(form.large_group_late_cancel_fee_cents ?? 2500)} onChange={(e) => set("large_group_late_cancel_fee_cents", cents(e.target.value))} /></label>
        <label className="text-xs font-bold">No-show fee<select className={input} value={form.large_group_no_show_fee_type || "per_person"} onChange={(e) => set("large_group_no_show_fee_type", e.target.value)}><option value="flat">Flat fee</option><option value="per_person">Per person</option></select><input className={input} type="number" min="0" step="1" value={dollars(form.large_group_no_show_fee_cents ?? 5000)} onChange={(e) => set("large_group_no_show_fee_cents", cents(e.target.value))} /></label>
      </div>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="reserve-card rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Large-group size & timing</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">Minimum party size<input className={input} type="number" min="2" max="500" value={form.large_group_min_party_size ?? 8} onChange={(e) => set("large_group_min_party_size", Number(e.target.value))} /></label>
          <label className="text-xs font-bold">Maximum party size<input className={input} type="number" min={form.large_group_min_party_size || 2} max="500" value={form.large_group_max_party_size ?? 40} onChange={(e) => set("large_group_max_party_size", Number(e.target.value))} /></label>
          <label className="text-xs font-bold">Default duration (minutes)<input className={input} type="number" min="30" step="15" max="1440" value={form.large_group_default_duration_minutes ?? 180} onChange={(e) => set("large_group_default_duration_minutes", Number(e.target.value))} /></label>
          <label className="text-xs font-bold">Confirmation<select className={input} value={form.large_group_confirmation_mode || "approval"} onChange={(e) => set("large_group_confirmation_mode", e.target.value)}><option value="instant">Instant confirmation</option><option value="approval">Location approval</option></select></label>
        </div>
        <label className="reserve-soft mt-4 flex items-center gap-3 rounded-full px-4 py-3 text-sm font-black"><input type="checkbox" checked={Boolean(form.large_group_booking_enabled)} onChange={(event) => set("large_group_booking_enabled", event.target.checked)} /> Accept large groups</label>
      </section>

      <section className="reserve-card rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Prix-fixe / group menu</h2>
        <p className="mt-1 text-sm reserve-muted">This controls the guest intake question. Paid prix-fixe packages remain Experiences.</p>
        <label className="mt-4 block text-xs font-bold">Prix-fixe requirement<select className={input} value={form.large_group_prix_fixe_mode || "optional"} onChange={(e) => set("large_group_prix_fixe_mode", e.target.value)}><option value="none">Not offered / not required</option><option value="optional">Optional or ask guest</option><option value="required">Required</option></select></label>
      </section>
    </div>

    <section className="reserve-card rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Large-group payment protection</h2>
      <p className="mt-1 text-sm reserve-muted">Choose no payment, a card guarantee using the large-group policy above, or a true booking deposit.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold">Payment requirement<select className={input} value={form.large_group_payment_mode || "none"} onChange={(e) => set("large_group_payment_mode", e.target.value)}><option value="none">No payment</option><option value="card_guarantee">Card guarantee</option><option value="deposit">Deposit</option></select></label>
        {form.large_group_payment_mode === "deposit" ? <>
          <label className="text-xs font-bold">Deposit type<select className={input} value={form.large_group_deposit_type || "flat"} onChange={(e) => set("large_group_deposit_type", e.target.value)}><option value="flat">Flat amount</option><option value="per_person">Per person</option></select></label>
          <label className="text-xs font-bold">Deposit amount ($)<input className={input} type="number" min="0.50" step="0.50" value={dollars(form.large_group_deposit_amount_cents)} onChange={(e) => set("large_group_deposit_amount_cents", cents(e.target.value))} /></label>
        </> : null}
      </div>
      {["deposit", "card_guarantee"].includes(form.large_group_payment_mode) ? <p className={`mt-3 rounded-xl border p-3 text-xs font-bold ${data?.stripeReady ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>{data?.stripeReady ? (form.large_group_payment_mode === "deposit" ? `Stripe is ready. Guests will pay ${depositPreview} before the booking is secured.` : "Stripe is ready. Guests will secure the booking with a saved card and the large-group cancellation/no-show policy above.") : "TheOutHaven Payments setup must be completed before payment protection can be enabled."}</p> : null}
    </section>

    {message ? <p className={`rounded-xl border p-3 text-sm font-bold ${message.tone === "success" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>{message.text}</p> : null}
    <button type="button" onClick={save} disabled={saving} className="reserve-primary rounded-full px-5 py-3 text-sm font-black disabled:opacity-50">{saving ? "Saving…" : "Save reservation policies"}</button>
  </div>;
}
