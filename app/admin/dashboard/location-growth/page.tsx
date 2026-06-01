"use client";

import { useEffect, useState } from "react";

type Summary = Record<string, any>;
const cardKeys = [
  ["liveLocations", "Live locations"], ["searchableLocations", "Searchable"], ["needsReview", "Needs review"], ["duplicates", "Duplicates"], ["staged", "Staged"], ["publishReady", "Publish ready"], ["possibleDuplicates", "Possible dupes"], ["rejected", "Rejected"], ["enrichmentQueued", "Enrichment queued"],
];

export default function LocationGrowthPage() {
  const [summary, setSummary] = useState<Summary>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [nycLimit, setNycLimit] = useState(1000);
  const [nycOffset, setNycOffset] = useState(0);
  const [osmLimit, setOsmLimit] = useState(1000);
  const [batchId, setBatchId] = useState("");
  const [publishLimit, setPublishLimit] = useState(250);
  const [enrichLimit, setEnrichLimit] = useState(50);
  const [qrLimit, setQrLimit] = useState(100);

  async function refresh() {
    const res = await fetch("/api/admin/location-growth/summary", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSummary(data || {});
  }
  useEffect(() => { refresh(); }, []);

  async function run(label: string, url: string, body: Record<string, any>) {
    setLoading(label); setAlert(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || `${label} failed`);
      if (data.batchId) setBatchId(data.batchId);
      setAlert(`${label} completed: ${JSON.stringify(data)}`);
      await refresh();
    } catch (error) { setAlert(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(null); }
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-rose-300";
  const buttonClass = "rounded-xl bg-rose-200 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-rose-950/30 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-200">TheOutHaven Admin</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Location Growth Pipeline</h1>
          <p className="mt-3 max-w-3xl text-slate-300">Clean, stage, dedupe, score, publish, enrich, and QR-enable locations without making public search worse.</p>
        </header>

        {alert && <div className="rounded-2xl border border-rose-200/30 bg-rose-950/40 p-4 text-sm text-rose-50">{alert}</div>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cardKeys.map(([key, label]) => <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs uppercase tracking-widest text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{Number(summary[key] || 0).toLocaleString()}</p></div>)}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Clean Existing Locations" description="Clean the current live database before importing anything new."><button className={buttonClass} disabled={!!loading} onClick={() => run("Cleanup", "/api/admin/cleanup-locations", { table: "locations", limit: 100, offset: 0 })}>Run Cleanup</button></Panel>
          <Panel title="Import NYC Restaurants" description="Stage NYC restaurant records from NYC Open Data. Nothing goes live until dedupe and publish."><div className="grid gap-3 sm:grid-cols-2"><Labeled label="Limit"><input className={inputClass} type="number" value={nycLimit} onChange={(e) => setNycLimit(Number(e.target.value))} /></Labeled><Labeled label="Offset"><input className={inputClass} type="number" value={nycOffset} onChange={(e) => setNycOffset(Number(e.target.value))} /></Labeled></div><button className={buttonClass} disabled={!!loading} onClick={() => run("Import NYC Restaurants", "/api/admin/location-growth/import-nyc-restaurants", { limit: nycLimit, offset: nycOffset })}>Import NYC Restaurants</button></Panel>
          <Panel title="Import OSM Activities" description="Stage activities, nightlife, parks, museums, bowling, galleries, and other date-friendly places from OpenStreetMap."><Labeled label="Limit"><input className={inputClass} type="number" value={osmLimit} onChange={(e) => setOsmLimit(Number(e.target.value))} /></Labeled><button className={buttonClass} disabled={!!loading} onClick={() => run("Import OSM Activities", "/api/admin/location-growth/import-osm-activities", { limit: osmLimit })}>Import OSM Activities</button></Panel>
          <Panel title="Dedupe Staged Imports" description="Find exact and likely duplicates before anything is published."><Labeled label="Optional batch ID"><input className={inputClass} value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Optional UUID" /></Labeled><button className={buttonClass} disabled={!!loading} onClick={() => run("Dedupe", "/api/admin/location-growth/dedupe", { batchId: batchId || undefined, mode: "staging" })}>Run Dedupe</button></Panel>
          <Panel title="Publish Ready Records" description="Publish only clean, unique, high-quality records into the existing locations table."><div className="grid gap-3 sm:grid-cols-2"><Labeled label="Batch ID"><input className={inputClass} value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="Required UUID" /></Labeled><Labeled label="Limit"><input className={inputClass} type="number" value={publishLimit} onChange={(e) => setPublishLimit(Number(e.target.value))} /></Labeled></div><button className={buttonClass} disabled={!!loading || !batchId} onClick={() => run("Publish", "/api/admin/location-growth/publish", { batchId, limit: publishLimit })}>Publish Ready Records</button></Panel>
          <Panel title="Enrich High-Value Records" description="Only enrich strong searchable locations, so Google/API spend is focused on places worth improving."><Labeled label="Limit"><input className={inputClass} type="number" value={enrichLimit} onChange={(e) => setEnrichLimit(Number(e.target.value))} /></Labeled><button className={buttonClass} disabled={!!loading} onClick={() => run("Enrich", "/api/admin/location-growth/enrich-high-value", { limit: enrichLimit })}>Enrich High-Value Records</button></Panel>
          <Panel title="Photo Storage Repairs" description="Google photo migration does not re-enrich records. It copies existing Google photo URLs into Supabase Storage. Use this before running new enrichment to save Google API calls."><div className="grid gap-3 sm:grid-cols-3"><button className={buttonClass} disabled={!!loading} onClick={() => run("Migrate Google Photos to Storage", "/api/admin/location-growth/migrate-enriched-photos", { mode: "google_endpoint_to_storage", limit: 50 })}>Migrate Google Photos to Storage</button><button className={buttonClass} disabled={!!loading} onClick={() => run("Retry Completed Missing Photos", "/api/admin/location-growth/migrate-enriched-photos", { mode: "repair_missing_completed", limit: 100 })}>Retry Completed Missing Photos</button><button className={buttonClass} disabled={!!loading} onClick={() => run("Repair Bad Photo Values", "/api/admin/location-growth/migrate-enriched-photos", { mode: "repair_bad_placeholders", limit: 100 })}>Repair Bad Photo Values</button></div><p className="text-xs leading-5 text-slate-400">Results include processed, updated, failed, skipped, and any row-level errors. Dashboard counts refresh after each action.</p></Panel>
          <Panel title="Generate Missing QR Codes" description="Create missing public QR codes and claim QR codes for clean live locations. Existing QR codes are not replaced."><div className="grid gap-3 sm:grid-cols-3"><Labeled label="Missing claim codes"><div className="text-2xl font-bold">{summary.missingClaimCodes || 0}</div></Labeled><Labeled label="Missing claim QR codes"><div className="text-2xl font-bold">{summary.missingClaimQrs || 0}</div></Labeled><Labeled label="Missing public QR codes"><div className="text-2xl font-bold">{summary.missingPublicQrs || 0}</div></Labeled></div><Labeled label="Limit"><input className={inputClass} type="number" value={qrLimit} onChange={(e) => setQrLimit(Number(e.target.value))} /></Labeled><button className={buttonClass} disabled={!!loading} onClick={() => run("Generate Missing QRs", "/api/admin/location-growth/generate-missing-qrs", { limit: qrLimit })}>Generate Missing QRs</button></Panel>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-5"><h2 className="text-xl font-bold">Latest batches</h2></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400"><tr>{["Source","Status","Seen","Staged","Duplicates","Possible duplicates","Rejected","Publish ready","Published","Started","Completed"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{(summary.latestBatches || []).map((b: any) => <tr key={b.id} className="border-t border-white/10"><td className="px-4 py-3">{b.source_label || b.source}</td><td className="px-4 py-3">{b.status}</td><td className="px-4 py-3">{b.total_seen || 0}</td><td className="px-4 py-3">{b.total_staged || 0}</td><td className="px-4 py-3">{b.total_duplicates || 0}</td><td className="px-4 py-3">{b.total_possible_duplicates || 0}</td><td className="px-4 py-3">{b.total_rejected || 0}</td><td className="px-4 py-3">{b.total_publish_ready || 0}</td><td className="px-4 py-3">{b.total_published || 0}</td><td className="px-4 py-3">{b.started_at ? new Date(b.started_at).toLocaleString() : "—"}</td><td className="px-4 py-3">{b.completed_at ? new Date(b.completed_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-xl"><div><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{description}</p></div>{children}</section>; }
function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm text-slate-300"><span>{label}</span>{children}</label>; }
