"use client";

import { useMemo, useState } from "react";

type PreviewAction = {
  locationId: string;
  locationName: string;
  market: string | null;
  anchorId: string | null;
  action: string;
  reason: string;
  warnings: string[];
  changes: Record<string, { from: unknown; to: unknown }>;
};

type PreviewResult = {
  runId: string;
  status: string;
  summary: Record<string, number | boolean>;
  actions: PreviewAction[];
};

export default function SyncPreviewClient() {
  const [mode, setMode] = useState("market");
  const [market, setMarket] = useState("NYC_CORE");
  const [batchSize, setBatchSize] = useState(100);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const canApprove = result?.status === "completed";
  const canExecute = result?.status === "approved" || result?.status === "paused";
  const summaryEntries = useMemo(() => Object.entries(result?.summary || {}), [result]);

  async function call(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
    return payload;
  }

  async function runPreview() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await call("/api/admin/search-anchors/sync-preview", { mode, market: mode === "market" ? market : undefined });
      setResult({ runId: payload.runId, status: payload.status || "completed", summary: payload.summary || {}, actions: payload.actions || [] });
      setMessage("Dry run completed. Review all conflicts and warnings before approval.");
    } catch (error: any) {
      setMessage(error?.message || "Could not run preview.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!result?.runId) return;
    setBusy(true);
    try {
      await call(`/api/admin/search-anchors/sync-preview/${result.runId}/approve`, {});
      setResult({ ...result, status: "approved" });
      setMessage("Plan approved. Production execution is now available.");
    } catch (error: any) {
      setMessage(error?.message || "Could not approve preview.");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!result?.runId) return;
    if (!window.confirm(`Execute up to ${batchSize} approved actions? This changes production anchor records.`)) return;
    setBusy(true);
    try {
      const payload = await call("/api/admin/search-anchors/backfill", { runId: result.runId, batchSize });
      setResult({ ...result, status: payload.status || result.status, summary: { ...result.summary, executionProcessed: payload.processed, executionCreated: payload.created, executionUpdated: payload.updated, executionFailed: payload.failed, remaining: payload.remaining } });
      setMessage(payload.remaining > 0 ? "Batch completed. More planned actions remain." : "Approved backfill completed.");
    } catch (error: any) {
      setMessage(error?.message || "Backfill execution failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-4">
        <label className="space-y-2 text-sm text-zinc-300">Scope
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-white">
            <option value="market">Market</option><option value="all">All locations</option><option value="missing_only">Missing anchors only</option><option value="existing_only">Existing anchors only</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-300">Market
          <select disabled={mode !== "market"} value={market} onChange={(e) => setMarket(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-white disabled:opacity-40">
            {['NYC_CORE','QUEENS','BROOKLYN','NASSAU','SUFFOLK','WESTCHESTER','NORTH_JERSEY'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm text-zinc-300">Execution batch size
          <input type="number" min={1} max={250} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-white" />
        </label>
        <div className="flex items-end"><button disabled={busy} onClick={runPreview} className="w-full rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Run Dry Preview"}</button></div>
      </section>

      {message && <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-100">{message}</div>}

      {result && <>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div><p className="text-xs uppercase tracking-wider text-zinc-500">Run {result.runId}</p><h2 className="text-xl font-semibold text-white">Status: {result.status}</h2></div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !canApprove} onClick={approve} className="rounded-xl border border-red-700 px-4 py-2 text-red-100 disabled:opacity-40">Approve Plan</button>
            <button disabled={busy || !canExecute} onClick={execute} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Execute Approved Batch</button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{summaryEntries.map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{String(value)}</p></div>)}</section>

        <section className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950">
          <table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-zinc-900 text-xs uppercase text-zinc-400"><tr>{['Location','Market','Action','Reason','Changes','Warnings'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>{result.actions.map((action) => <tr key={`${action.locationId}-${action.action}`} className="border-t border-zinc-900 align-top"><td className="px-4 py-3 font-medium text-white">{action.locationName}<div className="text-xs text-zinc-600">{action.locationId}</div></td><td className="px-4 py-3 text-zinc-300">{action.market || '—'}</td><td className="px-4 py-3 text-red-200">{action.action}</td><td className="px-4 py-3 text-zinc-300">{action.reason}</td><td className="px-4 py-3 text-zinc-400">{Object.keys(action.changes || {}).join(', ') || '—'}</td><td className="px-4 py-3 text-amber-200">{action.warnings?.join('; ') || '—'}</td></tr>)}</tbody>
          </table>
        </section>
      </>}
    </div>
  );
}
