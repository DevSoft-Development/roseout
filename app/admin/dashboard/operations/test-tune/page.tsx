"use client";

import { useState } from "react";

type Qa = { reports?: Array<{ query: string; top_restaurants: Array<{ warnings?: string[] }>; top_activities: Array<{ warnings?: string[] }> }>; error?: string };

export default function AdminTestTunePage() {
  const [qa, setQa] = useState<Qa | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (label: string, url: string) => {
    setLoading(label);
    setMsg("");
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || `${label} failed`);
      else {
        setMsg(`${label} complete.`);
        if (label === "Run Search QA") setQa(data);
      }
    } catch {
      setMsg(`${label} unavailable. Check route or server logs.`);
    } finally { setLoading(null); }
  };

  const warningCount = qa?.reports?.reduce((sum, r) => sum + r.top_restaurants.reduce((s, i) => s + (i.warnings?.length || 0), 0) + r.top_activities.reduce((s, i) => s + (i.warnings?.length || 0), 0), 0) || 0;

  return <main className="min-h-screen bg-[#090706] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl space-y-6"><header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Operations</p><h1 className="mt-2 text-3xl font-black">Test + Tune</h1><p className="mt-2 text-sm text-white/65">Run Search QA and semantic backfills, then review warnings for intent tags, semantic text, coordinates, city/state mismatch, and walking-distance issues.</p></header>
  <section className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-3"><button onClick={()=>run("Run Search QA","/api/admin/search-qa")} disabled={Boolean(loading)} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-black">{loading==="Run Search QA"?"Running...":"Run Search QA"}</button><button onClick={()=>run("Run Semantic Cleanup","/api/admin/semantic-nightly")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Run Semantic Cleanup"?"Running...":"Run Semantic Cleanup"}</button><button onClick={()=>run("Backfill Semantic Data","/api/admin/semantic-nightly?all=true&limit=100")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Backfill Semantic Data"?"Running...":"Backfill Semantic Data"}</button></section>
  {msg && <p className="text-sm text-white/70">{msg}</p>}
  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Warnings Snapshot</h2><p className="mt-2 text-sm text-white/65">Intent/tag warnings, bad match warnings, missing semantic_search_text warnings, missing intent_tags warnings, missing coordinates warnings, mismatched city/state warnings, and walking distance warnings.</p><p className="mt-3 text-3xl font-black text-amber-200">{warningCount}</p></section></div></main>;
}
