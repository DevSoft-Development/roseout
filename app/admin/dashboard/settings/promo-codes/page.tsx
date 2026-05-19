"use client";

import { useEffect, useState } from "react";

type Promo = Record<string, unknown>;

export default function AdminPromoCodesPage() {
  const [items, setItems] = useState<Promo[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ code: "", name: "", description: "", audience: "users", promo_type: "premium_access", plan_granted: "", duration_days: "", search_limit_override: "", discount_percent: "", discount_amount: "", max_redemptions: "", max_redemptions_per_user: "1", starts_at: "", expires_at: "", is_active: true });

  const load = async () => {
    const res = await fetch(`/api/admin/promo-codes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setItems(data.promo_codes || []);
  };

  useEffect(() => { load(); }, []);

  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-24 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><h1 className="text-3xl font-black">Settings</h1><section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><h2 className="text-xl font-bold text-rose-100">Promo Codes</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{Object.entries(form).filter(([k])=>!["is_active"].includes(k)).map(([k,v])=><input key={k} placeholder={k.replaceAll("_"," ")} value={String(v)} onChange={(e)=>setForm((s)=>({...s,[k]:e.target.value}))} className="min-h-[56px] rounded-2xl border border-white/10 bg-white/5 px-4 text-white"/>)}<label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e)=>setForm((s)=>({...s,is_active:e.target.checked}))}/>Active</label></div><button onClick={async()=>{await fetch('/api/admin/promo-codes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}); await load();}} className="mt-4 rounded-2xl bg-gradient-to-r from-rose-700 to-amber-500 px-4 py-3">Create promo code</button></section><section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5"><div className="mb-3 flex gap-2"><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search codes" className="min-h-[56px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-white"/><button onClick={load} className="rounded-2xl border border-white/10 px-4">Search</button></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-white/70"><th>code</th><th>audience</th><th>promo type</th><th>active</th><th>redemption count</th><th>max redemptions</th><th>starts at</th><th>expires at</th><th>created</th></tr></thead><tbody>{items.map((p)=><tr key={String(p.id)} className="border-t border-white/10"><td>{String(p.code)}</td><td>{String(p.audience)}</td><td>{String(p.promo_type)}</td><td>{String(p.is_active)}</td><td>{String(p.redemption_count ?? 0)}</td><td>{String(p.max_redemptions ?? "-")}</td><td>{String(p.starts_at ?? "-")}</td><td>{String(p.expires_at ?? "-")}</td><td>{String(p.created_at ?? "-")}</td></tr>)}</tbody></table></div></section></div></main>;
}
