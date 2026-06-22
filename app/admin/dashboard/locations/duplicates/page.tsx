"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Location = { id: string; name?: string; restaurant_name?: string; activity_name?: string; address?: string; city?: string; state?: string; location_type?: string; primary_category?: string; cuisine?: string; cuisine_type?: string; activity_type?: string; is_searchable?: boolean; duplicate_status?: string; quality_score?: number; review_count?: number; rating?: number; main_image?: string; image_url?: string };
type Row = { id: string; location_a_id: string; location_b_id: string; suggested_master_id?: string; duplicate_score: number; match_reasons: string[]; status: string; locationA: Location; locationB: Location };

function displayName(location?: Location) { return location?.name || location?.restaurant_name || location?.activity_name || "Untitled location"; }
function category(location?: Location) { return [location?.location_type, location?.primary_category || location?.cuisine || location?.cuisine_type || location?.activity_type].filter(Boolean).join(" / "); }

export default function DuplicateLocationReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const minScore = useMemo(() => status === "high_confidence" ? "95" : "0", [status]);
  const apiStatus = status === "high_confidence" ? "pending" : status;

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ status: apiStatus, minScore, limit: "50" });
    if (q) params.set("q", q);
    const [rowsResponse, summaryResponse] = await Promise.all([fetch(`/api/admin/locations/duplicates?${params}`), fetch("/api/admin/locations/duplicates/summary")]);
    const rowsJson = await rowsResponse.json();
    const summaryJson = await summaryResponse.json();
    setRows(rowsJson.rows || []); setSummary(summaryJson || {}); setLoading(false);
  }
  useEffect(() => { void load(); }, [apiStatus, minScore]);

  async function post(body: any) {
    setLoading(true); setMessage(null);
    const response = await fetch("/api/admin/locations/duplicates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    setMessage(json.success ? "Action completed." : json.error || "Action failed.");
    setConfirming(null); await load();
  }

  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin locations</p><h1 className="text-3xl font-semibold">Duplicate Location Review</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Merging does not delete the duplicate. It merges useful tags/photos/metadata into the master and hides the duplicate from public search.</p></div>
        <div className="flex gap-3"><Link className="rounded-full border border-white/15 px-4 py-2 text-sm" href="/admin/dashboard/locations">Back to locations</Link><button onClick={() => post({ action: "scan", limit: 500 })} className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Scan for duplicates</button></div>
      </div>
      <div className="grid gap-3 md:grid-cols-5">{[["Pending", summary.pending], ["High Confidence", summary.highConfidence], ["Both Searchable", summary.bothSearchable], ["Merged", summary.merged], ["Ignored", summary.ignored]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value ?? "—"}</p></div>)}</div>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row"><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2"><option value="pending">Pending</option><option value="high_confidence">High Confidence</option><option value="merged">Merged</option><option value="ignored">Ignored</option><option value="not_duplicate">Not Duplicate</option></select><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name/address" className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2"/><button onClick={load} className="rounded-xl border border-cyan-300/40 px-4 py-2 text-cyan-200">Search</button></div>
      {message && <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm text-cyan-100">{message}</div>}
      <div className="space-y-4">{loading && <p className="text-slate-400">Loading…</p>}{rows.map((row) => <div key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><span className="rounded-full bg-cyan-300/15 px-3 py-1 text-sm text-cyan-200">Score {row.duplicate_score}</span>{row.match_reasons.map((r) => <span key={r} className="ml-2 rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">{r}</span>)}</div><span className="text-sm text-slate-400">Status: {row.status}</span></div>
        <div className="grid gap-4 md:grid-cols-2">{([{ side: "A", location: row.locationA }, { side: "B", location: row.locationB }] as Array<{ side: string; location: Location }>).map(({ side, location }) => <div key={side} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-start gap-3"><img src={(location as Location)?.main_image || (location as Location)?.image_url || "/placeholder.svg"} alt="" className="h-16 w-16 rounded-xl object-cover"/><div><h2 className="text-lg font-semibold">Location {side}: {displayName(location as Location)}</h2><p className="text-sm text-slate-300">{(location as Location)?.address}, {(location as Location)?.city} {(location as Location)?.state}</p><p className="text-sm text-slate-400">{category(location as Location)}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300"><span>Searchable: {String((location as Location)?.is_searchable)}</span><span>Quality: {(location as Location)?.quality_score ?? "—"}</span><span>Reviews: {(location as Location)?.review_count ?? "—"}</span></div>{row.suggested_master_id === (location as Location)?.id && <p className="mt-3 text-xs font-semibold text-emerald-300">Suggested master</p>}<Link className="mt-3 inline-block text-sm text-cyan-300" href={`/admin/locations/${(location as Location)?.id}`}>Open location {side} CRM</Link></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2">{confirming === `${row.id}:A` ? <button className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => post({ action: "merge", masterId: row.location_a_id, duplicateId: row.location_b_id })}>Confirm merge B into A</button> : <button onClick={() => setConfirming(`${row.id}:A`)} className="rounded-full border border-white/15 px-4 py-2 text-sm">Keep A as master / merge B into A</button>}{confirming === `${row.id}:B` ? <button className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => post({ action: "merge", masterId: row.location_b_id, duplicateId: row.location_a_id })}>Confirm merge A into B</button> : <button onClick={() => setConfirming(`${row.id}:B`)} className="rounded-full border border-white/15 px-4 py-2 text-sm">Keep B as master / merge A into B</button>}<button onClick={() => post({ action: "not_duplicate", locationAId: row.location_a_id, locationBId: row.location_b_id })} className="rounded-full border border-white/15 px-4 py-2 text-sm">Mark not duplicate</button><button onClick={() => post({ action: "ignore", locationAId: row.location_a_id, locationBId: row.location_b_id })} className="rounded-full border border-white/15 px-4 py-2 text-sm">Ignore</button></div>
      </div>)}</div>
    </div>
  </main>;
}
