"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RunSettings = {
  market?: string;
  sourceType?: string;
  gaps?: string[];
  targetLimit?: number;
  processingChunkSize?: number;
};

type RecentResult = {
  locationId?: string;
  name?: string;
  status?: string;
  message?: string;
};

type LastBatch = {
  enriched?: number;
  unchanged?: number;
  skipped?: number;
  failed?: number;
  profilesQueued?: number;
  photosCached?: number;
  failureReasons?: Record<string, number>;
  recentResults?: RecentResult[];
};

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
  enriched_records?: number;
  unchanged_records?: number;
  skipped_records?: number;
  profiles_queued_records?: number;
  photos_cached_records?: number;
  actual_api_calls: number;
  batches_completed: number;
  cursor_location_id?: string | null;
  settings?: RunSettings | null;
  last_batch?: LastBatch | null;
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

type GapOption = { value: string; label: string; detail: string };

const MARKET_OPTIONS = [
  ["all", "All markets"],
  ["NYC_CORE", "NYC Core"],
  ["WESTCHESTER", "Westchester"],
  ["LONG_ISLAND", "Long Island"],
  ["NORTHERN_NJ", "Northern NJ"],
  ["CONNECTICUT", "Connecticut"],
  ["UNKNOWN", "Unknown / needs market repair"],
] as const;

const GAP_OPTIONS: GapOption[] = [
  { value: "missing_hours", label: "Hours", detail: "Operating hours are missing" },
  { value: "missing_photos", label: "Photos", detail: "No usable cached location photo" },
  { value: "missing_website", label: "Website", detail: "No canonical or Google website" },
  { value: "missing_phone", label: "Phone", detail: "No phone number" },
  { value: "missing_category", label: "Category", detail: "Cuisine/activity classification is missing" },
  { value: "missing_reservation", label: "Reservation link", detail: "No supported booking/reservation URL" },
  { value: "missing_coordinates", label: "Coordinates", detail: "Latitude or longitude is missing" },
  { value: "missing_google_place_id", label: "Google Place ID", detail: "No trusted Google identity" },
  { value: "weak_search_metadata", label: "Search metadata", detail: "Canonical search terms are weak or missing" },
  { value: "stale_google_enrichment", label: "Stale Google data", detail: "Never enriched or older than the staleness window" },
];

const DEFAULT_GAPS = GAP_OPTIONS.slice(0, 8).map((option) => option.value);

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

function humanizeReason(value: string) {
  const labels: Record<string, string> = {
    no_google_match: "No safe Google match",
    duplicate_google_place_id: "Duplicate Google Place ID blocked",
    photo_cache_failed: "Photo cache failed",
    processing_error: "Processing error",
  };
  return labels[value] || value.replaceAll("_", " ");
}

export function CatalogEnrichmentRunner() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [mode, setMode] = useState("repair");
  const [market, setMarket] = useState("all");
  const [sourceType, setSourceType] = useState("both");
  const [targetLimit, setTargetLimit] = useState(100);
  const [staleDays, setStaleDays] = useState(90);
  const [gaps, setGaps] = useState<string[]>(DEFAULT_GAPS);
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
    const timer = window.setInterval(() => void refresh(), 10000);
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
    if (mode === "repair" && gaps.length === 0) {
      setError("Select at least one enrichment gap before creating a repair run.");
      return;
    }
    await action({
      action: "create",
      mode,
      market,
      sourceType,
      targetLimit,
      staleDays,
      gaps,
      maxApiCalls: maxApiCalls.trim() ? Number(maxApiCalls) : null,
    }, "Enrichment plan created. Review the target count and API estimate before starting it.");
  }

  function toggleGap(value: string) {
    setGaps((current) => current.includes(value) ? current.filter((gap) => gap !== value) : [...current, value]);
  }

  const resumeBudget = maxApiCalls.trim() ? Number(maxApiCalls) : null;
  const settings = activeRun?.settings || {};
  const recentResults = activeRun?.last_batch?.recentResults || [];
  const failureReasons = activeRun?.last_batch?.failureReasons || {};

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Run mode">
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="control">
              <option value="repair">Target missing data</option>
              <option value="full_refresh">Full refresh within filters</option>
            </select>
          </Field>
          <Field label="Market">
            <select value={market} onChange={(event) => setMarket(event.target.value)} className="control">
              {MARKET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Location type">
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="control">
              <option value="both">Restaurants + activities</option>
              <option value="restaurants">Restaurants only</option>
              <option value="activities">Activities only</option>
            </select>
          </Field>
          <Field label="Locations per run">
            <select value={targetLimit} onChange={(event) => setTargetLimit(Number(event.target.value))} className="control">
              {[25, 50, 100, 250].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="API call budget">
            <input type="number" min={1} value={maxApiCalls} onChange={(event) => setMaxApiCalls(event.target.value)} className="control" />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Gap targeting</p>
              <p className="mt-1 text-sm font-semibold text-white/55">Only locations matching at least one selected gap enter a repair run.</p>
            </div>
            <label className="text-xs font-black uppercase tracking-widest text-white/45">
              Stale after
              <span className="ml-2 inline-flex items-center gap-2 normal-case tracking-normal">
                <input type="number" min={1} max={3650} value={staleDays} onChange={(event) => setStaleDays(Number(event.target.value || 90))} className="w-20 rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 text-sm font-bold text-white" /> days
              </span>
            </label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {GAP_OPTIONS.map((option) => {
              const checked = gaps.includes(option.value);
              return (
                <label key={option.value} className={`cursor-pointer rounded-xl border p-3 transition ${checked ? "border-rose-400/35 bg-rose-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={checked} onChange={() => toggleGap(option.value)} className="mt-1" />
                    <div>
                      <p className="text-sm font-black text-white">{option.label}</p>
                      <p className="mt-1 text-xs font-semibold leading-4 text-white/40">{option.detail}</p>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-rose-300/15 bg-rose-500/[0.05] p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs font-semibold leading-5 text-white/50">
            A 250-location run is not processed in one request. The existing durable queue processes up to 25 locations per cron/manual batch and resumes from saved run items and cursor state.
          </p>
          <button type="button" disabled={loading || Boolean(activeRun && ["planned", "running", "paused", "budget_stopped"].includes(activeRun.status))} onClick={() => void createPlan()} className="shrink-0 rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:opacity-40">
            Create Enrichment Plan
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}

      {activeRun ? (
        <section className="rounded-3xl border border-rose-400/25 bg-rose-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Active enrichment run</p>
              <h3 className="mt-2 text-2xl font-black capitalize text-white">{activeRun.status.replaceAll("_", " ")}</h3>
              <p className="mt-2 text-sm font-semibold text-white/50">
                {settings.market === "all" || !settings.market ? "All markets" : settings.market.replaceAll("_", " ")} · {settings.sourceType || "both"} · up to {settings.targetLimit || activeRun.estimated_records} locations
              </p>
              {activeRun.cursor_location_id ? <p className="mt-1 text-xs font-semibold text-white/35">Resume cursor: {activeRun.cursor_location_id}</p> : null}
              {activeRun.status === "budget_stopped" ? <p className="mt-2 text-xs font-bold text-amber-200">Increase the API call budget above {activeRun.actual_api_calls.toLocaleString()}, then Resume.</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeRun.status === "planned" ? <button disabled={loading} onClick={() => void action({ action: "start", runId: activeRun.id, maxApiCalls: resumeBudget }, "Location enrichment started. The scheduled runner will continue it automatically.")} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white">Start</button> : null}
              {activeRun.status === "running" ? <button disabled={loading} onClick={() => void action({ action: "pause", runId: activeRun.id }, "Run paused safely.")} className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-black text-black">Pause</button> : null}
              {["paused", "budget_stopped"].includes(activeRun.status) ? <button disabled={loading} onClick={() => void action({ action: "resume", runId: activeRun.id, maxApiCalls: resumeBudget }, "Run resumed from saved progress.")} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white">Resume</button> : null}
              {activeRun.status === "running" ? <button disabled={loading} onClick={() => void action({ action: "process", runId: activeRun.id }, "One safe processing batch completed.")} className="rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-black text-white">Run Batch Now</button> : null}
              {["planned", "running", "paused", "budget_stopped"].includes(activeRun.status) ? <button disabled={loading} onClick={() => void action({ action: "cancel", runId: activeRun.id }, "Run cancelled. Completed enrichment remains intact.")} className="rounded-full border border-red-300/20 bg-red-500/10 px-5 py-2.5 text-sm font-black text-red-100">Cancel</button> : null}
            </div>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-rose-500 transition-all" style={{ width: `${percent}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs font-bold text-white/40"><span>{activeRun.processed_records.toLocaleString()} processed</span><span>{percent}% of {activeRun.estimated_records.toLocaleString()}</span></div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Enriched" value={activeRun.enriched_records || 0} />
            <Metric label="Unchanged" value={activeRun.unchanged_records || 0} />
            <Metric label="Skipped" value={activeRun.skipped_records || 0} />
            <Metric label="Failures" value={activeRun.failed_records} />
            <Metric label="Needs review" value={activeRun.review_records} />
            <Metric label="Photos cached" value={activeRun.photos_cached_records || 0} />
            <Metric label="Profiles queued" value={activeRun.profiles_queued_records || 0} />
            <Metric label="API calls" value={activeRun.actual_api_calls} />
            <Metric label="Batches" value={activeRun.batches_completed} />
            <Metric label="API budget" value={activeRun.max_api_calls ?? "Unlimited"} />
          </div>

          {Object.keys(failureReasons).length ? (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100/70">Latest batch reasons</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(failureReasons).map(([reason, count]) => <span key={reason} className="rounded-full border border-amber-200/15 bg-black/20 px-3 py-1.5 text-xs font-bold text-amber-50">{humanizeReason(reason)} · {count}</span>)}
              </div>
            </div>
          ) : null}

          {recentResults.length ? (
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Recent batch results</p>
              <div className="mt-3 space-y-2">
                {recentResults.slice(-10).reverse().map((result, index) => (
                  <div key={`${result.locationId || index}-${index}`} className="grid gap-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div><p className="font-black text-white">{result.name || result.locationId || "Location"}</p><p className="mt-1 font-semibold text-white/45">{result.message || "Processed"}</p></div>
                    <span className="font-black uppercase tracking-wider text-rose-200">{result.status || "processed"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeRun.last_error ? <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-100">{activeRun.last_error}</p> : null}
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <h3 className="text-lg font-black text-white">Recent enrichment runs</h3>
        <div className="mt-4 space-y-2">
          {runs.length ? runs.map((run) => (
            <div key={run.id} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs font-bold text-white/55 lg:grid-cols-[1.2fr_auto_auto_auto_auto] lg:items-center">
              <div><span className="text-white">{run.settings?.market && run.settings.market !== "all" ? run.settings.market.replaceAll("_", " ") : "All markets"} · {run.settings?.sourceType || "both"}</span><span className="ml-2 text-white/30">{new Date(run.created_at).toLocaleString()}</span></div>
              <span className="capitalize">{run.status.replaceAll("_", " ")}</span>
              <span>{run.processed_records.toLocaleString()} / {run.estimated_records.toLocaleString()}</span>
              <span>{(run.enriched_records || 0).toLocaleString()} enriched</span>
              <span>{run.actual_api_calls.toLocaleString()} API calls</span>
            </div>
          )) : <p className="text-sm font-semibold text-white/35">No catalog-wide enrichment runs yet.</p>}
        </div>
      </section>

      <style jsx>{`
        .control { margin-top: .5rem; width: 100%; border-radius: .75rem; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.6); padding: .75rem; font-size: .875rem; font-weight: 700; color: white; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-black uppercase tracking-widest text-white/45">{label}{children}</label>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-xl font-black text-white">{typeof value === "number" ? value.toLocaleString() : value}</p></div>;
}
