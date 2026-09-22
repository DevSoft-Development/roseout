"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLE_OPTIONS } from "@/lib/users/roles";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const planOptions = [
  { value: "free", label: "Free" },
  { value: "unlimited", label: "TheOutHaven Plus / Unlimited" },
  { value: "comped", label: "Comped" },
  { value: "admin", label: "Admin" },
];

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-bold text-white/80"><span>{label}</span>{children}{helper ? <span className="text-xs font-medium text-white/45">{helper}</span> : null}</label>;
}

export function ProfileForm({ userId, profile }: { userId: string; profile: any }) {
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    first_name: profile.first_name || "",
    phone_e164: profile.phone_e164 || profile.phone || "",
    birth_month: Number(profile.birth_month || 0) || "",
    home_zip_code: profile.home_zip_code || profile.zip_code || "",
    sms_consent: !!profile.sms_consent,
    personalization_enabled: profile.personalization_enabled !== false,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Consumer profile saved." : payload.error || "Could not save profile.");
  }

  return <form id="consumer-profile" onSubmit={save} className="grid gap-4 md:grid-cols-2">
    <Field label="First name">
      <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.first_name} onChange={event => setForm({ ...form, first_name: event.target.value })} />
    </Field>
    <Field label="Mobile number">
      <input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.phone_e164} onChange={event => setForm({ ...form, phone_e164: event.target.value })} />
    </Field>
    <Field label="Birth month">
      <select aria-label="Birth month" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.birth_month} onChange={event => setForm({ ...form, birth_month: Number(event.target.value) })}>
        <option value="">Select birth month</option>
        {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
      </select>
    </Field>
    <Field label="ZIP code" helper="Neighborhood, city, county, state, and market are derived automatically.">
      <input inputMode="numeric" maxLength={5} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.home_zip_code} onChange={event => setForm({ ...form, home_zip_code: event.target.value.replace(/\D/g, "").slice(0, 5) })} />
    </Field>
    <label className="text-sm text-white/70"><input type="checkbox" checked={form.sms_consent} onChange={event => setForm({ ...form, sms_consent: event.target.checked })} /> SMS consent</label>
    <label className="text-sm text-white/70"><input type="checkbox" checked={form.personalization_enabled} onChange={event => setForm({ ...form, personalization_enabled: event.target.checked })} /> Personalized recommendations</label>
    <div className="md:col-span-2">
      <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Save consumer profile</button>
      {message ? <p className="mt-2 text-sm text-emerald-100">{message}</p> : null}
    </div>
  </form>;
}

export function AccountAccessForm({ userId, profile }: { userId: string; profile: any }) {
  const [message, setMessage] = useState("");
  const [confirmSuper, setConfirmSuper] = useState(false);
  const [form, setForm] = useState({ role: profile.role || "user", plan: profile.plan || "free" });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (form.role === "superadmin" && !confirmSuper) {
      setMessage("Confirm the superadmin role change before saving.");
      return;
    }
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Account access saved." : payload.error || "Could not save account access.");
  }

  return <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
    <Field label="User role" helper="Role changes are audit logged.">
      <select aria-label="User role" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
        {USER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
    <Field label="Plan" helper="Updates the active customer subscription.">
      <select aria-label="Plan" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.plan} onChange={event => setForm({ ...form, plan: event.target.value })}>
        {planOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
    {form.role === "superadmin" ? <label className="md:col-span-2 flex gap-2 text-sm text-amber-100"><input type="checkbox" checked={confirmSuper} onChange={event => setConfirmSuper(event.target.checked)} /> I confirm this account should have superadmin access.</label> : null}
    <div className="md:col-span-2">
      <button className="rounded-full border border-white/15 bg-white/[.07] px-5 py-3 text-sm font-black text-white">Save account access</button>
      {message ? <p className="mt-2 text-sm text-emerald-100">{message}</p> : null}
    </div>
  </form>;
}

export function PasswordReset({ userId }: { userId: string }) {
  const [message, setMessage] = useState("");
  return <button onClick={async () => {
    const response = await fetch(`/api/admin/users/${userId}/password-reset`, { method: "POST" });
    setMessage(response.ok ? "Password reset email sent." : "Could not send reset email.");
  }} className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-2 text-sm font-black text-white">Send password reset {message ? <span className="ml-2 text-rose-100">{message}</span> : null}</button>;
}

export function DeleteUser({ userId, email }: { userId: string; email?: string | null }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  async function disableUser() {
    const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation, reason }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) router.push("/admin/dashboard/users?status=disabled");
    else setMessage(payload.error || "Could not disable user.");
  }

  return <div className="rounded-3xl border border-red-300/25 bg-red-950/20 p-4">
    <h3 className="text-lg font-black text-red-100">Delete / Disable User</h3>
    <p className="mt-2 text-sm text-white/60">Soft disables the account, preserves support/audit records, and logs who performed the action.</p>
    <input aria-label="Delete confirmation" className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" placeholder={`Type DELETE or ${email || "the user email"}`} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
    <textarea aria-label="Delete reason" className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" placeholder="Reason" value={reason} onChange={event => setReason(event.target.value)} />
    <button type="button" onClick={disableUser} className="mt-3 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white">Delete / Disable User</button>
    {message ? <p className="mt-2 text-sm text-red-100">{message}</p> : null}
  </div>;
}
