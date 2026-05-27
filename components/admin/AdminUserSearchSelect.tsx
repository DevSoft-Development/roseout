"use client";
import { useEffect, useState } from "react";

type User = { id: string; full_name?: string; email?: string; role?: string };
export default function AdminUserSearchSelect({ onSelect }: { onSelect: (user: User | null) => void }) {
  const [q, setQ] = useState(""); const [items, setItems] = useState<User[]>([]);
  useEffect(() => { const t = setTimeout(async () => { if (q.trim().length < 2) return setItems([]); const r = await fetch(`/api/admin/search-users?q=${encodeURIComponent(q)}`); const j = await r.json(); setItems(j.users || []); }, 250); return () => clearTimeout(t); }, [q]);
  return <div className="space-y-2"><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search user" className="w-full rounded-xl border border-white/20 bg-[#1a1512] px-3 py-2 text-sm text-white" />
  {items.map((it)=><button key={it.id} onClick={()=>onSelect(it)} className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left">{it.full_name || "Unnamed"} <span className="text-white/60">{it.email || ""}</span></button>)}
  </div>;
}
