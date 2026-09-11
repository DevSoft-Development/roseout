"use client";

import { useEffect, useState } from "react";

type HealthCheck = { key:string; label:string; ok:boolean; weight:number };
type Health = { score:number; live_url?:string|null; healthy:boolean; checks:HealthCheck[] };

export function WebsiteHealthPanel({ locationId }: { locationId:string }) {
  const [health,setHealth]=useState<Health|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let cancelled=false;(async()=>{try{const response=await fetch(`/api/business/website/health?location_id=${encodeURIComponent(locationId)}`,{cache:"no-store"});const data=await response.json();if(!cancelled&&response.ok)setHealth(data)}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[locationId]);
  if(loading)return <section className="mb-5 animate-pulse rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="h-5 w-40 rounded bg-white/10"/><div className="mt-4 h-20 rounded-2xl bg-white/5"/></section>;
  if(!health)return null;
  return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Website Health</p><h2 className="mt-2 text-xl font-black">{health.score}/100</h2><p className="mt-2 text-sm text-white/55">A quick check of the pieces that keep the site useful, current, and ready for customers.</p></div><span className={`rounded-full px-3 py-2 text-xs font-black ${health.healthy?"bg-emerald-500/10 text-emerald-200":"bg-amber-500/10 text-amber-100"}`}>{health.healthy?"Healthy":"Needs attention"}</span></div>
    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{health.checks.map(check=><div key={check.key} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-black">{check.ok?"✓":"!"} {check.label}</p><p className="mt-1 text-xs text-white/40">{check.ok?"Ready":"Needs attention"}</p></div>)}</div>
  </section>;
}
