"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { USER_ROLE_OPTIONS } from "@/lib/users/roles";

const ageOptions = ["Under 21", "21–24", "25–34", "35–44", "45–54", "55–64", "65+", "Prefer not to say"];
const planOptions = [{ value: "free", label: "Free" }, { value: "unlimited", label: "TheOutHaven Plus / Unlimited" }, { value: "comped", label: "Comped" }, { value: "admin", label: "Admin" }];

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-bold text-white/80"><span>{label}</span>{children}{helper ? <span className="text-xs font-medium text-white/45">{helper}</span> : null}</label>;
}

export function ProfileForm({ userId, profile }: { userId: string; profile: any }) {
  const [message, setMessage] = useState("");
  const [confirmSuper, setConfirmSuper] = useState(false);
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    preferred_name: profile.preferred_name || "",
    phone: profile.phone || profile.mobile_number || "",
    zip_code: profile.zip_code || profile.derived_market_area || "",
    age_range: profile.age_range || "",
    birthday: profile.birthday_month && profile.birthday_day ? `${String(profile.birthday_month).padStart(2, "0")}-${String(profile.birthday_day).padStart(2, "0")}` : "",
    sms_opt_in: !!profile.sms_opt_in,
    birthday_opt_in: !!profile.birthday_opt_in,
    role: profile.role || "user",
    plan: profile.plan || "free",
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (form.role === "superadmin" && !confirmSuper) {
      setMessage("Confirm the superadmin role change before saving.");
      return;
    }
    const response = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Profile saved." : payload.error || "Could not save profile.");
  }

  return <form id="profile" onSubmit={save} className="grid gap-4 md:grid-cols-2">
    <Field label="Full name"><input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} /></Field>
    <Field label="Preferred name"><input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.preferred_name} onChange={event => setForm({ ...form, preferred_name: event.target.value })} /></Field>
    <Field label="Phone"><input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
    <Field label="ZIP / main area"><input className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.zip_code} onChange={event => setForm({ ...form, zip_code: event.target.value })} /></Field>
    <Field label="Age range"><select aria-label="Age range" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.age_range} onChange={event => setForm({ ...form, age_range: event.target.value })}><option value="">Select age range</option>{ageOptions.map(option => <option key={option}>{option}</option>)}</select></Field>
    <Field label="Birthday" helper="Month and day only. No birth year needed."><input placeholder="MM-DD" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" value={form.birthday} onChange={event => setForm({ ...form, birthday: event.target.value })} /></Field>
    <Field label="User role" helper="Superadmin-only. Role changes are audit logged."><select aria-label="User role" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="">Select user role</option>{USER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
    <Field label="Plan" helper="Updates the active customer subscription."><select aria-label="Plan" className="rounded-2xl border border-white/10 bg-[#120809] px-4 py-3 text-white" value={form.plan} onChange={event => setForm({ ...form, plan: event.target.value })}><option value="">Select plan</option>{planOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
    {form.role === "superadmin" ? <label className="md:col-span-2 flex gap-2 text-sm text-amber-100"><input type="checkbox" checked={confirmSuper} onChange={event => setConfirmSuper(event.target.checked)} /> I confirm this account should have superadmin access.</label> : null}
    <label className="text-sm text-white/70"><input type="checkbox" checked={form.sms_opt_in} onChange={event => setForm({ ...form, sms_opt_in: event.target.checked })} /> SMS opt-in</label>
    <label className="text-sm text-white/70"><input type="checkbox" checked={form.birthday_opt_in} onChange={event => setForm({ ...form, birthday_opt_in: event.target.checked })} /> Birthday opt-in</label>
    <button className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Save profile, role, and plan</button>
    {message ? <p className="text-sm text-emerald-100">{message}</p> : null}
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
