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

const markets = ["NYC_CORE", "QUEENS", "BROOKLYN", "NASSAU", "SUFFOLK", "WESTCHESTER", "NORTH_JERSEY"];

const actionStyles: Record<string, string> = {
  create: "border-emerald-900 bg-emerald-950/70 text-emerald-300",
  update: "border-blue-900 bg-blue-950/70 text-blue-300",
  disable: "border-amber-900 bg-amber-950/70 text-amber-300",
  reactivate: "border-violet-900 bg-violet-950/70 text-violet-300",
  conflict: "border-red-900 bg-red-950/70 text-red-300",
};

const summaryLabels: Record<string, string> = {
  wouldCreate: "Would create",
  wouldUpdate: "Would update",
  wouldDisable: "Would disable",
  wouldReactivate: "Would reactivate",
  wouldConflict: "Needs attention",
  alreadyCurrent: "Already current",
  excludedIneligible: "Excluded ineligible",
  noActionRequired: "No action required",
};

function labelize(value: string) {
  return summaryLabels[value] || value.replace(/^would/, "Would ").replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

export default function SyncPreviewClient() {
  const [mode, setMode] = useState("market");
  const [market, setMarket] = useState("NYC_CORE");
  const [batchSize, setBatchSize] = useState(100);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [warningFilter, setWarningFilter] = useState("all");

  const canApprove = result?.status === "completed";
  const canExecute = result?.status === "approved" || result?.status === "paused";

  const summaryCards = useMemo(() => {
    if (!result) return [];
    const ordered = ["wouldCreate", "wouldUpdate", "wouldDisable", "wouldReactivate", "wouldConflict", "alreadyCurrent", "excludedIneligible", "noActionRequired"];
    return ordered
      .filter((key) => key in result.summary)
      .map((key) => [key, result.summary[key]] as const);
  }, [result]);

  const visibleActions = useMemo(() => {
    if (!result) return [];
    const normalized = query.trim().toLowerCase();
    return result.actions.filter((item) => {
      const matchesQuery = !normalized || item.locationName.toLowerCase().includes(normalized) || item.locationId.toLowerCase().includes(normalized) || (item.market || "").toLowerCase().includes(normalized);
      const matchesAction = actionFilter === "all" || item.action === actionFilter;
      const hasWarnings = (item.warnings?.length || 0) > 0;
      const matchesWarnings = warningFilter === "all" || (warningFilter === "with" ? hasWarnings : !hasWarnings);
      return matchesQuery && matchesAction && matchesWarnings;
    });
  }, [result, query, actionFilter, warningFilter]);

  async function call(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text || "Request failed" }; }
    if (!response.ok || payload.success === false) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  async function runPreview() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await call("/api/admin/search-anchors/sync-preview", { mode, market: mode === "market" ? market : undefined });
      setResult({ runId: payload.runId, status: payload.status || "completed", summary: payload.summary || {}, actions: payload.actions || [] });
      setMessage("Dry run completed. Only records that would change production are listed as planned actions; current and ineligible locations are summarized separately.");
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
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black p-5 shadow-2xl shadow-black/30">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Scope
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-red-600">
              <option value="market">Market</option><option value="all">All locations</option><option value="missing_only">Missing anchors only</option><option value="existing_only">Existing anchors only</option>
            </select>
          </label>
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Market
            <select disabled={mode !== "market"} value={market} onChange={(e) => setMarket(e.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-red-600 disabled:opacity-40">
              {markets.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Execution batch size
            <input type="number" min={1} max={250} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-red-600" />
          </label>
          <div className="flex items-end"><button disabled={busy} onClick={runPreview} className="min-w-44 rounded-xl border border-zinc-600 bg-zinc-900 px-5 py-3 font-semibold text-white transition hover:border-red-600 hover:bg-zinc-800 disabled:opacity-50">{busy ? "Working…" : "Run Dry Preview"}</button></div>
        </div>
      </section>

      {message && <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-100">{message}</div>}

      {result && <>
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Run {result.runId}</p>
            <div className="mt-2 flex items-center gap-3"><h2 className="text-xl font-semibold text-white">Dry Run Preview</h2><span className="rounded-full border border-violet-900 bg-violet-950/60 px-3 py-1 text-xs font-semibold capitalize text-violet-300">{result.status}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !canApprove} onClick={approve} className="rounded-xl border border-zinc-600 px-4 py-2.5 font-semibold text-zinc-100 transition hover:border-red-600 disabled:opacity-40">Approve Plan</button>
            <button disabled={busy || !canExecute} onClick={execute} className="rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 disabled:opacity-40">Execute Batch</button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(([label, value]) => <article key={label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labelize(label)}</p><p className="mt-2 text-3xl font-semibold text-white">{Number(value || 0).toLocaleString()}</p></article>)}
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30">
          <div className="grid gap-3 border-b border-zinc-800 p-4 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by location name, ID, or market…" className="rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-600" />
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm text-white"><option value="all">All planned actions</option>{["create","update","disable","reactivate","conflict"].map((value) => <option key={value} value={value}>{labelize(value)}</option>)}</select>
            <select value={warningFilter} onChange={(e) => setWarningFilter(e.target.value)} className="rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm text-white"><option value="all">All warnings</option><option value="with">With warnings</option><option value="without">Without warnings</option></select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-[25%] px-5 py-4">Location</th><th className="w-[10%] px-4 py-4">Market</th><th className="w-[12%] px-4 py-4">Planned Action</th><th className="w-[13%] px-4 py-4">Reason</th><th className="w-[25%] px-4 py-4">Changed Fields</th><th className="w-[15%] px-4 py-4">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {visibleActions.map((action) => {
                  const fields = Object.keys(action.changes || {});
                  return <tr key={`${action.locationId}-${action.action}`} className="border-t border-zinc-900 align-top transition hover:bg-zinc-900/40">
                    <td className="px-5 py-4"><p className="font-semibold text-white">{action.locationName}</p><p className="mt-1 break-all text-xs text-zinc-600">{action.locationId}</p></td>
                    <td className="px-4 py-4 text-zinc-300">{action.market || "—"}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${actionStyles[action.action] || actionStyles.conflict}`}>{action.action}</span></td>
                    <td className="px-4 py-4 text-zinc-300">{action.reason}</td>
                    <td className="px-4 py-4 text-zinc-400"><div className="line-clamp-2 leading-6">{fields.slice(0, 5).join(", ") || "—"}</div>{fields.length > 5 && <span className="mt-2 inline-flex rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">+{fields.length - 5} more</span>}</td>
                    <td className="px-4 py-4">{action.warnings?.length ? <div className="space-y-1 text-amber-200">{action.warnings.map((warning, index) => <p key={index} className="line-clamp-2">⚠ {warning}</p>)}</div> : <span className="text-zinc-600">—</span>}</td>
                  </tr>;
                })}
                {!visibleActions.length && <tr><td colSpan={6} className="px-6 py-14 text-center text-zinc-500">No production changes are required for this scope.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-4 text-sm text-zinc-500"><span>Showing {visibleActions.length.toLocaleString()} of {result.actions.length.toLocaleString()} planned production changes</span><span>Batch size: {batchSize}</span></div>
        </section>
      </>}
    </div>
  );
}
