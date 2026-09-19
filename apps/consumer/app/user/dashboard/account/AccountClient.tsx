"use client";

import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AccountClient({ profile }: { profile: any }) {
  const [form, setForm] = useState({
    preferred_name: profile?.preferred_name || "",
    city: profile?.city || "",
    birthday_month: profile?.birthday_month ? String(profile.birthday_month) : "",
    phone: profile?.mobile_number || "",
    sms_opt_in: Boolean(profile?.sms_opt_in),
  });
  const [message, setMessage] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!form.preferred_name.trim()) return setMessage("First name is required.");
    if (!form.city.trim()) return setMessage("City is required.");
    if (!form.birthday_month) return setMessage("Birth month is required.");

    const response = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferred_name: form.preferred_name,
        city: form.city,
        birthday_month: Number(form.birthday_month),
        phone: form.phone,
        sms_opt_in: form.sms_opt_in,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok && data.success ? "Account saved." : data.error || "Could not save account.");
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-white/70">
        First name <span className="text-rose-200">Required</span>
        <input required autoComplete="given-name" className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} />
      </label>

      <label className="grid gap-2 text-sm font-bold text-white/70">
        City <span className="text-rose-200">Required</span>
        <input required autoComplete="address-level2" className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" placeholder="New York" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      </label>

      <label className="grid gap-2 text-sm font-bold text-white/70">
        Birth month <span className="text-rose-200">Required</span>
        <select required className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" value={form.birthday_month} onChange={(e) => setForm({ ...form, birthday_month: e.target.value })}>
          <option value="">Select month</option>
          {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
        <span className="text-xs font-semibold text-white/40">Used for birthday-month experiences and offers. We do not collect your birth day or full date of birth.</span>
      </label>

      <label className="grid gap-2 text-sm font-bold text-white/70">
        Phone number <span className="text-white/35">Optional</span>
        <input inputMode="tel" autoComplete="tel" className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white" placeholder="(516) 555-0123" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>

      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm font-semibold text-white/65">
        <input type="checkbox" className="mt-1" checked={form.sms_opt_in} onChange={(e) => setForm({ ...form, sms_opt_in: e.target.checked })} />
        Send me reservation reminders and outing updates by text. Message/data rates may apply.
      </label>

      <p className="text-xs font-semibold leading-5 text-white/40">Your sign-in email is kept with your account authentication and is not used as a public profile field.</p>

      <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Save Account</button>
      {message ? <p className="text-sm text-emerald-100">{message}</p> : null}
    </form>
  );
}
