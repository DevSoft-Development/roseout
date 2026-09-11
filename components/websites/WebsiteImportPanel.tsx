"use client";

import { useState } from "react";

type MigrationMode = "preserve_exact" | "modernize" | "redesign";

type Analysis = {
  provider?: string | null;
  title?: string | null;
  page_count?: number;
  reservation_provider?: string | null;
  reservation_url?: string | null;
  mode?: MigrationMode;
};

const modes: Array<{ id: MigrationMode; title: string; body: string }> = [
  { id: "preserve_exact", title: "Keep my current website", body: "Preserve the current design and structure as closely as possible, then connect live TheOutHaven business data." },
  { id: "modernize", title: "Keep the look, modernize it", body: "Keep the brand and recognizable visual language while improving responsiveness, polish, and conversion." },
  { id: "redesign", title: "Create a new premium design", body: "Use the current website as a content and brand reference, then create a new agency-quality experience." },
];

export function WebsiteImportPanel({ locationId }: { locationId: string }) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<MigrationMode>("modernize");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function analyze() {
    setBusy(true);
    setMessage("");
    setAnalysis(null);
    const response = await fetch("/api/business/website/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: locationId, url, mode }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      if (data.final_url) setUrl(String(data.final_url));
      setMessage(data.error || "We could not analyze that website.");
      return;
    }
    setAnalysis(data.analysis || null);
    setMessage("Website analyzed and connected to this location draft.");
  }

  return <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Move an existing website</p><h2 className="mt-2 text-xl font-black">Import the site you already have</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Enter the current website once. TheOutHaven will detect the platform, pages, branding signals, and reservation provider, then keep business facts connected to the same Edit Location data you already use.</p></div>
      <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs font-black text-white/60">No duplicate business editor</span>
    </div>
    <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <input value={url} onChange={(event)=>setUrl(event.target.value)} placeholder="https://yourbusiness.com" className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[#ff2142]/50" />
      <button type="button" disabled={busy || !url.trim()} onClick={analyze} className="rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white disabled:opacity-40">{busy ? "Analyzing…" : "Analyze website"}</button>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-3">{modes.map(item=><button key={item.id} type="button" onClick={()=>setMode(item.id)} className={`rounded-2xl border p-4 text-left transition ${mode===item.id?"border-[#ff2142]/60 bg-[#ff2142]/10":"border-white/10 bg-black/20 hover:bg-white/[0.04]"}`}><p className="font-black">{item.title}</p><p className="mt-2 text-xs leading-5 text-white/50">{item.body}</p></button>)}</div>
    {analysis ? <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Platform" value={analysis.provider || "Detected website"}/><Metric label="Pages found" value={String(analysis.page_count || 0)}/><Metric label="Reservations" value={analysis.reservation_provider || "Not detected"}/><Metric label="Migration" value={mode === "preserve_exact" ? "Preserve" : mode === "modernize" ? "Modernize" : "Redesign"}/></div> : null}
    {message ? <p className="mt-4 text-sm font-bold text-white/65">{message}</p> : null}
  </section>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p><p className="mt-2 text-sm font-black">{value}</p></div>}
