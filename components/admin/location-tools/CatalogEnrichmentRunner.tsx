"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Run = {
  id: string;
  status: string;
  mode: string;
  stale_days: number;
  batch_size: number;
  max_api_calls: number | null;
  estimated_records: number;
  estimated_api_calls: number;
  processed_records: number;
  matched_records: number;
  review_records: number;
  no_match_records: number;
  failed_records: number;
  actual_api_calls: number;
  batches_completed: number;
  last_error?: string | null;
  created_at: string;
};

type ApiPayload = {
  success?: boolean;
  error?: string;
  runs?: Run[];
  activeRun?: Run | null;
  run?: Run | null;
  [key: string]: unknown;
};

async function callApi(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/locations/enrichment-runs", body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : { cache: "no-store" });
  const json = await response.json() as ApiPayload;
  if (!response.ok || json.success === false) throw new Error(json.error || "Enrichment runner request failed.");
  return json;
}

export function CatalogEnrichmentRunner() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [mode, setMode] = useState("repair");
  const [staleDays, setStaleDays] = useState(90);
  const [batchSize, setBatchSize] = useState(5);
  const [maxApiCalls, setMaxApiCalls] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const json = await callApi();
      setRuns(json.runs || []);
      setActiveRun(json.activeRun || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const percent = useMemo(() => {
    if (!activeRun?.estimated_records) return 0;
    return Math.min(100, Math.round((activeRun.processed_records / activeRun.estimated_records) * 100));
  }, [activeRun]);

  async function action(payload: Record<string, unknown>, successMessage: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await callApi(payload);
      setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function createPlan() {
    await action({
      action: "create",
      mode,
      staleDays,
      batchSize,
      maxApiCalls: maxApiCalls.trim() ? Number(maxApiCalls) : null,
    }, "Enrichment plan created. Review the record/API estimate before starting it.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="flex-1 text-xs font-black uppercase tracking-widest text-white/45">
            Run mode
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="repair">Repair only — stale, generic, missing, or weak</option>
              <option value="full_refresh">Full canonical location refresh</option>
            </select>
          </label>
          <label className="w-full lg:w-36 text-xs font-black uppercase tracking-widest text-white/45">
            Stale after
            <input type="number" min={1} max={3650} value={staleDays} onChange={(event) => setStaleDays(Number(event.target.value || 90))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold text-white" />
          </label>
          <label className="w-full lg:w-32 text-xs font-black uppercase tracking-widest text-white/45">
            Batch size
            <input type="number" min={1} max={25} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value || 5))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold text-white" />
          </label>
          <label className="w-full lg:w-44 text-xs font-black uppercase tracking-widest text-white/45">
            API call budget
            <input type="number" min={1} value={maxApiCalls} onChange={(event) => setMaxApiCalls(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold text-white" />
          </label>
          <button type="button" disabled={loading || Boolean(activeRun && ["planned", "running", "paused"].includes(activeRun.status))} onClick={() => void createPlan()} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-40">
            Create Audit Plan
          </button>
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-white/40">The plan is set-based in Supabase, so it can target tens of thousands of canonical locations without loading the catalog into the browser. Google calls do not begin until you press Start.</p>
      </section>

      {error ? <div className="rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

      {activeRun ? (
        <section className="rounded-3xl border border-rose-400/25 bg-rose-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Active catalog run</p>
              <h3 className="mt-2 text-2xl font-black text-white">{activeRun.status.replaceAll("_", " ")}</h3>
              <p className="mt-2 text-sm font-semibold text-white/50">{activeRun.mode === "repair" ? "Repairing stale, generic, missing, and weak records" : "Refreshing the full canonical catalog"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeRun.status === "planned" ? <button disabled={loading} onClick={() => void action({ action: "start", runId: activeRun.id }, "Catalog enrichment started. The minute-by-minute runner will continue it automatically.")} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white">Start</button> : null}
              {activeRun.status === "running" ? <button disabled={loading} onClick={() => void action({ action: "pause", runId: activeRun.id }, "Run paused safely.")} className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-black text-black">Pause</button> : null}
              {["paused", "budget_stopped"].includes(activeRun.status) ? <button disabled={loading} onClick={() => void action({ action: "resume", runId: activeRun.id }, "Run resumed.")} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white">Resume</button> : null}
              {activeRun.status === "running" ? <button disabled={loading} onClick={() => void action({ action: "process", runId: activeRun.id }, "One batch processed now.")} className="rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-black text-white">Run Batch Now</button> : null}
              {["planned", "running", "paused", "budget_stopped"].includes(activeRun.status) ? <button disabled={loading} onClick={() => void action({ action: "cancel", runId: activeRun.id }, "Run cancelled. Completed enrichment remains intact.")} className="rounded-full border border-red-300/20 bg-red-500/10 px-5 py-2.5 text-sm font-black text-red-100">Cancel</button> : null}
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-rose-500 transition-all" style={{ width: `${percent}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs font-bold text-white/40"><span>{activeRun.processed_records.toLocaleString()} processed</span><span>{percent}% of {activeRun.estimated_records.toLocaleString()}</span></div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Estimated API calls" value={activeRun.estimated_api_calls} />
            <Metric label="Actual API calls" value={activeRun.actual_api_calls} />
            <Metric label="Matched" value={activeRun.matched_records} />
            <Metric label="Needs review" value={activeRun.review_records} />
            <Metric label="No match" value={activeRun.no_match_records} />
            <Metric label="Failures" value={activeRun.failed_records} />
            <Metric label="Batches" value={activeRun.batches_completed} />
            <Metric label="API budget" value={activeRun.max_api_calls ?? "Unlimited"} />
          </div>
          {activeRun.last_error ? <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-100">{activeRun.last_error}</p> : null}
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <h3 className="text-lg font-black text-white">Recent enrichment runs</h3>
        <div className="mt-4 space-y-2">
          {runs.length ? runs.map((run) => (
            <div key={run.id} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs font-bold text-white/55 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
              <div><span className="text-white">{run.mode.replaceAll("_", " ")}</span><span className="ml-2 text-white/30">{new Date(run.created_at).toLocaleString()}</span></div>
              <span>{run.status.replaceAll("_", " ")}</span>
              <span>{run.processed_records.toLocaleString()} / {run.estimated_records.toLocaleString()}</span>
              <span>{run.actual_api_calls.toLocaleString()} calls</span>
            </div>
          )) : <p className="text-sm font-semibold text-white/35">No catalog-wide enrichment runs yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-xl font-black text-white">{typeof value === "number" ? value.toLocaleString() : value}</p></div>;
}
