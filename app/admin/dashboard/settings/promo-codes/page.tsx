"use client";

import { useEffect, useMemo, useState } from "react";

type Promo = {
  id: string;
  code: string;
  name: string | null;
  audience: "users" | "locations" | "both";
  promo_type: string;
  target_scope: string;
  plan_granted: string | null;
  is_active: boolean;
  redemption_count: number;
  max_redemptions: number | null;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
};

type PromoFormState = { code: string; prefix: string; name: string; description: string; internal_notes: string; audience: "users"|"locations"|"both"; target_scope: "any"|"specific_user"|"specific_location"|"signup_user"|"signup_location_owner"; assigned_user_id: string; assigned_location_id: string; assigned_location_name: string; promo_type: "premium_access"|"search_boost"|"location_pro_trial"|"discount"; plan_granted: string; duration_days: string; search_limit_override: string; discount_mode: "none"|"percent"|"amount"; discount_percent: string; discount_amount: string; max_redemptions: string; max_redemptions_per_user: string; starts_at: string; expires_at: string; is_active: boolean; };

const initialForm: PromoFormState = { code: "", prefix: "OUT", name: "", description: "", internal_notes: "", audience: "users", target_scope: "any", assigned_user_id: "", assigned_location_id: "", assigned_location_name: "", promo_type: "premium_access", plan_granted: "", duration_days: "30", search_limit_override: "", discount_mode: "none", discount_percent: "", discount_amount: "", max_redemptions: "", max_redemptions_per_user: "1", starts_at: "", expires_at: "", is_active: true };

export default function AdminPromoCodesPage() {
  const [items, setItems] = useState<Promo[]>([]);
  const [form, setForm] = useState<PromoFormState>(initialForm);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", audience: "", promo_type: "", status: "" });
  const [userOptions, setUserOptions] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [locationOptions, setLocationOptions] = useState<Array<{ id: string; name: string | null; address: string | null }>>([]);

  const load = async () => { const p = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && p.set(k, v)); const res = await fetch(`/api/admin/promo-codes?${p.toString()}`); const d = await res.json(); setItems(d.promo_codes || []); };
  useEffect(() => { load(); }, []);

  const summary = useMemo(() => { const now = Date.now(); return { total: items.length, active: items.filter((i) => i.is_active).length, redemptions: items.reduce((a, b) => a + (b.redemption_count || 0), 0), expired: items.filter((i) => i.expires_at && new Date(i.expires_at).getTime() < now).length }; }, [items]);
  const statusFor = (p: Promo) => { const now = Date.now(); if (!p.is_active) return "Inactive"; if (p.max_redemptions !== null && p.redemption_count >= p.max_redemptions) return "Exhausted"; if (new Date(p.starts_at).getTime() > now) return "Scheduled"; if (p.expires_at && new Date(p.expires_at).getTime() < now) return "Expired"; return "Active"; };

  const generateLocalCode = () => { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const size = Math.random() > 0.5 ? 6 : 5; const random = Array.from({ length: size }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); setForm((s) => ({ ...s, code: `${s.prefix}-${random}`.toUpperCase() })); };
  useEffect(() => { const loadUsers = async () => { if (form.target_scope !== "specific_user") return; const res = await fetch(`/api/admin/promo-codes?lookup=users&q=${encodeURIComponent(form.assigned_user_id)}`); const data = await res.json(); setUserOptions(data.users || []); }; loadUsers(); }, [form.target_scope, form.assigned_user_id]);
  useEffect(() => { const loadLocations = async () => { if (form.target_scope !== "specific_location") return; const res = await fetch(`/api/admin/promo-codes?lookup=locations&q=${encodeURIComponent(form.assigned_location_name)}`); const data = await res.json(); setLocationOptions(data.locations || []); }; loadLocations(); }, [form.target_scope, form.assigned_location_name]);

  const validate = () => {
    if (form.discount_mode === "percent" && (!form.discount_percent || Number(form.discount_percent) < 0 || Number(form.discount_percent) > 100)) return "Discount percent must be between 0 and 100.";
    if (form.discount_mode === "amount" && (!form.discount_amount || Number(form.discount_amount) <= 0)) return "Discount amount must be greater than 0.";
    if (form.target_scope === "specific_user" && !form.assigned_user_id) return "Assigned user is required.";
    if (form.target_scope === "specific_location" && !form.assigned_location_id) return "Assigned location is required.";
    if (form.expires_at && form.starts_at && new Date(form.expires_at).getTime() <= new Date(form.starts_at).getTime()) return "Expiration must be after start.";
    return "";
  };

  const create = async () => {
    setMsg(""); setError("");
    const validationError = validate(); if (validationError) { setError(validationError); return; }
    const payload = { ...form, auto_generated: !form.code, discount_percent: form.discount_mode === "percent" ? form.discount_percent : "", discount_amount: form.discount_mode === "amount" ? form.discount_amount : "", search_limit_override: form.search_limit_override === "unlimited" ? "" : form.search_limit_override };
    const res = await fetch("/api/admin/promo-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!res.ok) { setError(d.error || "Failed to create promo code."); return; }
    setMsg("Promo code created.");
    setForm((s) => ({ ...initialForm, prefix: s.prefix, audience: s.audience, promo_type: s.promo_type }));
    await load();
  };

  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <div><h1 className="text-3xl font-black">Promo Codes Manager</h1><p className="text-white/70">Premium control center for user, owner, location and subscription promo programs.</p></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(summary).map(([k, v]) => <div key={k} className="rounded-3xl border border-rose-400/20 bg-gradient-to-br from-[#1f1110] to-[#0f0a08] p-4"><p className="text-white/60 capitalize">{k}</p><p className="text-2xl font-bold">{v}</p></div>)}</section>
    <section className="rounded-3xl border border-rose-400/20 bg-gradient-to-br from-[#1d110f] to-[#0d0908] p-6 space-y-4 shadow-2xl shadow-rose-950/20">
      <h2 className="text-xl font-bold">Create Promo Code</h2>{msg && <p className="text-emerald-300">{msg}</p>}{error && <p className="text-rose-300">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <input className="field" placeholder="code" value={form.code} onChange={e => setForm(s => ({ ...s, code: e.target.value }))} />
        <select className="field" value={form.prefix} onChange={e => setForm(s => ({ ...s, prefix: e.target.value }))}>{["OUT", "BETA", "VIP", "USER", "OWNER", "PRO", "COMP"].map(v => <option key={v}>{v}</option>)}</select>
        <button onClick={generateLocalCode} className="rounded-2xl bg-gradient-to-r from-rose-700 to-rose-500 px-4">Generate Unique Code</button>
        <select className="field" value={form.promo_type} onChange={e => setForm(s => ({ ...s, promo_type: e.target.value as PromoFormState["promo_type"] }))}><option value="premium_access">User promo code</option><option value="location_pro_trial">Location owner promo code</option><option value="discount">Location-specific promo code</option><option value="search_boost">Subscription promo code</option></select>
        <select className="field" value={form.audience} onChange={e => setForm(s => ({ ...s, audience: e.target.value as PromoFormState["audience"] }))}><option value="users">User role: user</option><option value="locations">User role: location owner</option><option value="both">User role: both</option></select>
        <select className="field" value={form.discount_mode} onChange={e => setForm(s => ({ ...s, discount_mode: e.target.value as PromoFormState["discount_mode"] }))}><option value="none">Discount type: none</option><option value="percent">Discount type: percent</option><option value="amount">Discount type: amount</option></select>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <select className="field" value={form.is_active ? "active" : "inactive"} onChange={e => setForm(s => ({ ...s, is_active: e.target.value === "active" }))}><option value="active">Status: active</option><option value="inactive">Status: inactive</option></select>
        <input className="field" list="promo-users" placeholder="assigned user" value={form.assigned_user_id} onChange={e => setForm(s => ({ ...s, assigned_user_id: e.target.value }))} /><datalist id="promo-users">{userOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>)}</datalist>
        <input className="field" list="promo-locations" placeholder="assigned location" value={form.assigned_location_name} onChange={e => setForm(s => ({ ...s, assigned_location_name: e.target.value }))} /><datalist id="promo-locations">{locationOptions.map((l) => <option key={l.id} value={l.name || l.id}>{l.address || l.id}</option>)}</datalist>
        <input className="field" placeholder="assigned_location_id" value={form.assigned_location_id} onChange={e => setForm(s => ({ ...s, assigned_location_id: e.target.value }))} />
        <select className="field" value={form.target_scope} onChange={e => setForm(s => ({ ...s, target_scope: e.target.value as PromoFormState["target_scope"] }))}><option value="any">Any assigned audience</option><option value="specific_user">Specific user</option><option value="specific_location">Specific location</option><option value="signup_user">Signup user</option><option value="signup_location_owner">Signup location owner</option></select>
      </div>
      <div className="grid gap-3 md:grid-cols-4"><input className="field" placeholder="description" value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} /><input className="field" placeholder="discount_percent" value={form.discount_percent} onChange={e => setForm(s => ({ ...s, discount_percent: e.target.value }))} /><input className="field" placeholder="discount_amount" value={form.discount_amount} onChange={e => setForm(s => ({ ...s, discount_amount: e.target.value }))} /><input className="field" placeholder="max_redemptions" value={form.max_redemptions} onChange={e => setForm(s => ({ ...s, max_redemptions: e.target.value }))} /><input className="field" placeholder="per_user_limit" value={form.max_redemptions_per_user} onChange={e => setForm(s => ({ ...s, max_redemptions_per_user: e.target.value }))} /><input className="field" type="datetime-local" value={form.starts_at} onChange={e => setForm(s => ({ ...s, starts_at: e.target.value }))} /><input className="field" type="datetime-local" value={form.expires_at} onChange={e => setForm(s => ({ ...s, expires_at: e.target.value }))} /><input className="field" placeholder="created_by (auto from current admin)" value="auto" readOnly /></div>
      <button onClick={create} className="rounded-2xl bg-gradient-to-r from-rose-700 to-rose-500 px-4 py-3">Create promo code</button>
    </section>
  </div><style jsx>{`.field{min-height:48px;border-radius:1rem;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);padding:.6rem .8rem;color:white}`}</style></main>;
}
