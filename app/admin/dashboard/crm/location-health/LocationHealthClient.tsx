"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  market: string | null;
  location_type: string | null;
  updated_at: string | null;
  healthScore: number;
  issues: string[];
};

type Run = {
  id: string;
  status: string;
  estimated_records: number;
  processed_records: number;
  enriched_records?: number;
  unchanged_records?: number;
  failed_records?: number;
  review_records?: number;
  last_error?: string | null;
  settings?: Record<string, unknown> | null;
};

type Payload = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  duplicateCount: number;
  activeRun: Run | null;
};

const views = [
  ["attention", "Needs Attention"],
  ["refresh", "Needs Refreshing"],
  ["repair", "Needs Repair"],
] as const;

function percent(run: Run | null) {
  if (!run?.estimated_records) return 0;
  return Math.min(100, Math.round((Number(run.processed_records || 0) / Number(run.estimated_records || 1)) * 100));
}

function friendlyStatus(value: string) {
  const map: Record<string, string> = {
    planned: "Preparing",
    queued: "Queued",
    running: "Fixing locations",
    paused: "Paused",
    budget_stopped: "Needs attention",
    completed: "Completed",
    failed: "Stopped",
  };
  return map[value] || value.replaceAll("_", " ");
}

export default function LocationHealthClient() {
  const [data, setData] = useState<Payload>({ rows: [], total: 0, page: 1, pageSize: 50, totalPages: 1, duplicateCount: 0, activeRun: null });
  const [view, setView] = useState("attention");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ view, page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    try {
      const response = await fetch(`/api/admin/crm/location-health?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Could not load location health.");
      setData(payload);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load location health.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, view]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), data.activeRun ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [load, Boolean(data.activeRun)]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, pageSize, view]);

  const allOnPageSelected = data.rows.length > 0 && data.rows.every((row) => selected.has(row.id));
  const runPercent = percent(data.activeRun);
  const selectedCount = selected.size;

  async function startFix(ids: string[]) {
    if (!ids.length) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/crm/location-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationIds: ids }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Could not start the repair.");
      setNotice(payload.message || `Started fixing ${ids.length} ${ids.length === 1 ? "location" : "locations"}.`);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the repair.");
    } finally {
      setStarting(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) data.rows.forEach((row) => next.delete(row.id));
      else data.rows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  return (
    <div className="space-y-5 text-white">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">CRM</p>
          <h1 className="mt-1 text-3xl font-black">Location Health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Find incomplete, outdated, or broken location records and fix the safe issues without technical tools or jargon.</p>
        </div>
        <Link href="/admin/dashboard/settings/location-tools/enrichment" className="text-xs font-bold text-white/35 hover:text-white/60">Advanced tools</Link>
      </header>

      {data.activeRun ? (
        <section className="rounded-3xl border border-rose-300/25 bg-rose-500/[0.07] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Repair in progress</p>
              <h2 className="mt-1 text-xl font-black">{friendlyStatus(data.activeRun.status)}</h2>
              <p className="mt-1 text-sm text-white/55">{Number(data.activeRun.processed_records || 0).toLocaleString()} of {Number(data.activeRun.estimated_records || 0).toLocaleString()} locations checked</p>
            </div>
            <strong className="text-2xl">{runPercent}%</strong>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runPercent}>
            <div className="h-full bg-rose-500 transition-[width] duration-500" style={{ width: `${runPercent}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-white/45">
            <span>{Number(data.activeRun.enriched_records || 0)} improved</span>
            <span>{Number(data.activeRun.unchanged_records || 0)} already current</span>
            <span>{Number(data.activeRun.review_records || 0)} need review</span>
            <span>{Number(data.activeRun.failed_records || 0)} could not be fixed</span>
          </div>
          {data.activeRun.last_error ? <p className="mt-3 text-sm font-bold text-amber-200">{data.activeRun.last_error}</p> : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={() => { setView("attention"); setPage(1); }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.06]">
          <p className="text-xs font-black uppercase tracking-wider text-white/40">Needs attention</p><p className="mt-2 text-2xl font-black">{view === "attention" ? data.total.toLocaleString() : "View"}</p><p className="mt-1 text-xs text-white/45">Missing important business information</p>
        </button>
        <button onClick={() => { setView("refresh"); setPage(1); }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.06]">
          <p className="text-xs font-black uppercase tracking-wider text-white/40">Needs refreshing</p><p className="mt-2 text-2xl font-black">{view === "refresh" ? data.total.toLocaleString() : "View"}</p><p className="mt-1 text-xs text-white/45">Information is old or has never been checked</p>
        </button>
        <button onClick={() => { setView("repair"); setPage(1); }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.06]">
          <p className="text-xs font-black uppercase tracking-wider text-white/40">Needs repair</p><p className="mt-2 text-2xl font-black">{view === "repair" ? data.total.toLocaleString() : "View"}</p><p className="mt-1 text-xs text-white/45">Core identity, map, or visibility problems</p>
        </button>
        <Link href="/admin/dashboard/settings/location-tools/duplicates" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.06]">
          <p className="text-xs font-black uppercase tracking-wider text-white/40">Possible duplicates</p><p className="mt-2 text-2xl font-black">{data.duplicateCount.toLocaleString()}</p><p className="mt-1 text-xs text-white/45">Review before combining records</p>
        </Link>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#0e0e11] p-4">
        <form onSubmit={(event) => { event.preventDefault(); setPage(1); void load(); }} className="flex flex-col gap-3 md:flex-row">
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search location, city, or address" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-rose-300/50" />
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm">
            {[25, 50, 100].map((value) => <option key={value} value={value}>{value} per page</option>)}
          </select>
          <button className="rounded-xl bg-white px-5 py-3 text-sm font-black text-black">Search</button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {views.map(([value, label]) => <button key={value} onClick={() => { setView(value); setPage(1); }} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${view === value ? "bg-rose-600 text-white" : "border border-white/10 text-white/60"}`}>{label}</button>)}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e11]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
          <label className="flex items-center gap-3 text-sm font-black text-white/75">
            <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} />
            Select all {data.rows.length} on this page
          </label>
          <div className="flex items-center gap-2">
            {selectedCount ? <span className="text-xs font-bold text-white/50">{selectedCount} selected</span> : null}
            <button disabled={!selectedCount || starting || Boolean(data.activeRun)} onClick={() => void startFix(Array.from(selected))} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
              {starting ? "Starting…" : "Fix Selected"}
            </button>
          </div>
        </div>

        {loading ? <p className="p-6 text-sm text-white/45">Loading locations…</p> : data.rows.length === 0 ? <p className="p-8 text-center text-sm text-white/45">No locations match this view.</p> : (
          <div className="divide-y divide-white/[0.07]">
            {data.rows.map((row) => (
              <div key={row.id} className="grid gap-3 p-4 md:grid-cols-[32px_minmax(0,1.3fr)_110px_minmax(0,1.4fr)_auto] md:items-center">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                <div className="min-w-0">
                  <Link href={`/admin/dashboard/crm/${row.id}`} className="truncate font-black text-white hover:text-rose-200">{row.name || "Unnamed location"}</Link>
                  <p className="mt-1 truncate text-xs text-white/40">{[row.address, row.city, row.state].filter(Boolean).join(", ") || "Address unavailable"}</p>
                </div>
                <div>
                  <p className={`text-lg font-black ${row.healthScore >= 85 ? "text-emerald-300" : row.healthScore >= 65 ? "text-amber-200" : "text-rose-200"}`}>{row.healthScore}%</p>
                  <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Health</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.issues.slice(0, 4).map((issue) => <span key={issue} className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-bold text-white/60">{issue}</span>)}
                  {row.issues.length > 4 ? <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-bold text-white/45">+{row.issues.length - 4} more</span> : null}
                </div>
                <button disabled={starting || Boolean(data.activeRun)} onClick={() => void startFix([row.id])} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/80 hover:bg-white/[0.06] disabled:opacity-40">Fix Location</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 text-sm">
          <span className="text-white/45">Page {data.page} of {data.totalPages} · {data.total.toLocaleString()} locations</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-white/10 px-3 py-2 font-bold disabled:opacity-30">Previous</button>
            <button disabled={page >= data.totalPages} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))} className="rounded-lg border border-white/10 px-3 py-2 font-bold disabled:opacity-30">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
