"use client";
import { useEffect, useState } from "react";

type Location = { id: string; name: string; type: string; address: string; borough: string; neighborhood: string };

export default function AdminLocationSearchSelect({ onSelect }: { onSelect: (location: Location | null) => void }) {
  const [q, setQ] = useState(""); const [items, setItems] = useState<Location[]>([]);
  useEffect(() => { const t = setTimeout(async () => { if (q.trim().length < 2) return setItems([]); const r = await fetch(`/api/admin/search-locations?q=${encodeURIComponent(q)}&limit=20`); const j = await r.json(); setItems(j.locations || []); }, 250); return () => clearTimeout(t); }, [q]);
  return <div className="space-y-2"><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search location" className="w-full rounded-xl border border-white/20 bg-[#1a1512] px-3 py-2 text-sm text-white" />
    {items.length>0 ? <div className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-[#120d0b]">{items.map((it)=><button key={it.id} onClick={()=>onSelect(it)} className="block w-full border-b border-white/10 px-3 py-2 text-left hover:bg-white/10">{it.name} <span className="text-white/50">{it.borough || it.neighborhood || it.address}</span></button>)}</div> : null}
  </div>;
}
