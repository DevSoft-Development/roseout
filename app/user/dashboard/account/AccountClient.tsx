"use client";

import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AccountClient({ profile }: { profile: any }) {
  const [form, setForm] = useState({
    first_name: profile?.first_name || "",
    home_zip_code: profile?.home_zip_code || "",
    birth_month: profile?.birth_month ? String(profile.birth_month) : "",
    phone_e164: profile?.phone_e164 || "",
    sms_consent: Boolean(profile?.sms_consent),
  });
  const [message, setMessage] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!form.first_name.trim()) return setMessage("First name is required.");
    if (!/^\d{5}$/.test(form.home_zip_code)) return setMessage("A valid 5-digit ZIP code is required.");
    if (!form.birth_month) return setMessage("Birth month is required.");

    const response = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.first_name,
        home_zip_code: form.home_zip_code,
        birth_month: Number(form.birth_month),
        phone_e164: form.phone_e164,
        sms_consent: form.sms_consent,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok && data.success ? "Account saved." : data.error || "Could not save account.");
  }

  const homeArea = [
    profile?.home_neighborhood,
    profile?.home_borough,
    profile?.home_city,
    profile?.home_county,
    profile?.home_market,
  ].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(" · ");

  return (
    <form onSubmit={save} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-white/70">
        First name <span className="text-rose-200">Required</span>
        <input required autoComplete="given-name" className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
      </label>

      <label className="grid gap-2 text-sm font-bold text-white/70">
        ZIP code <span className="text-rose-200">Required</span>
        <input required inputMode="numeric" autoComplete="postal-code" maxLength={5} className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" placeholder="11530" value={form.home_zip_code} onChange={(e) => setForm({ ...form, home_zip_code: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
        <span className="text-xs font-semibold text-white/40">We use your ZIP to personalize nearby recommendations. We do not ask for your home address.</span>
      </label>

      {homeArea ? <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/65"><b className="text-white">Home area:</b> {homeArea}</div> : null}

      <label className="grid gap-2 text-sm font-bold text-white/70">
        Birth month <span className="text-rose-200">Required</span>
        <select required className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" value={form.birth_month} onChange={(e) => setForm({ ...form, birth_month: e.target.value })}>
          <option value="">Select month</option>
          {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
        <span className="text-xs font-semibold text-white/40">We only collect the month, not your birth day or year.</span>
      </label>

      <label className="grid gap-2 text-sm font-bold text-white/70">
        Mobile number <span className="text-white/35">Optional</span>
        <input inputMode="tel" autoComplete="tel" className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" placeholder="(516) 555-0123" value={form.phone_e164} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} />
      </label>

      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm font-semibold text-white/65">
        <input type="checkbox" className="mt-1" checked={form.sms_consent} onChange={(e) => setForm({ ...form, sms_consent: e.target.checked })} />
        Send me reservation reminders, OUTing updates, and optional offers by text. Message/data rates may apply.
      </label>

      <p className="text-xs font-semibold leading-5 text-white/40">Your sign-in email stays with authentication and is not a public profile field.</p>
      <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Save Account</button>
      {message ? <p className="text-sm text-emerald-100">{message}</p> : null}
    </form>
  );
}
