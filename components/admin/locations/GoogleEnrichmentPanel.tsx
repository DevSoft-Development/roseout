"use client";

import { useMemo, useState, type ReactNode } from "react";

type SourceTable = "locations" | "restaurants" | "activities";
type EnrichmentRow = {
  name?: string | null;
  locationName?: string | null;
  status?: string | null;
  wouldStatus?: string | null;
  matchConfidence?: number | null;
  googleDisplayName?: string | null;
  googleAddress?: string | null;
  foodTerms?: string[] | null;
  cuisineTerms?: string[] | null;
  categoryTerms?: string[] | null;
  featureTerms?: string[] | null;
  searchKeywords?: string[] | null;
  suggestedFoodTerms?: string[] | null;
  suggestedCuisineTerms?: string[] | null;
  suggestedCategoryTerms?: string[] | null;
  suggestedFeatureTerms?: string[] | null;
  suggestedSearchKeywords?: string[] | null;
  foodProbeUsed?: boolean;
  foodProbeQueries?: string[];
  foodProbeMatchedTerms?: string[];
  foodProbeApiCalls?: number;
  foodProbeSkippedReason?: string | null;
  error?: string | null;
};

type EnrichmentResult = {
  success?: boolean;
  enableFoodProbe?: boolean;
  result?: {
    scanned?: number;
    matched?: number;
    no_match?: number;
    noMatch?: number;
    no_useful_terms?: number;
    noUsefulTerms?: number;
    pending_review?: number;
    pendingReview?: number;
    auto_apply_ready?: number;
    autoApplyReady?: number;
    failed?: number;
    estimated_api_calls?: number;
    estimatedApiCalls?: number;
    suggestions_created?: number;
    suggestionsCreated?: number;
    auto_applied?: number;
    autoApplied?: number;
    usefulResults?: EnrichmentRow[];
    results?: EnrichmentRow[];
  };
};

const LIMITS = [5, 10, 25, 50, 100];
const PROBES = [1, 2, 3];
const STATUS_CLASSES: Record<string, string> = {
  auto_apply_ready: "border-emerald-300/30 bg-emerald-500/15 text-emerald-100",
  auto_applied: "border-emerald-300/30 bg-emerald-500/15 text-emerald-100",
  pending_review: "border-amber-300/30 bg-amber-500/15 text-amber-100",
  no_useful_terms: "border-white/10 bg-white/[0.07] text-white/55",
  no_match: "border-red-300/20 bg-red-500/10 text-red-100",
  failed: "border-red-300/30 bg-red-500/15 text-red-100",
};

function metric(result: EnrichmentResult["result"], camel: string, snake: string) {
  if (!result) return 0;
  const value = (result as Record<string, unknown>)[camel] ?? (result as Record<string, unknown>)[snake];
  return typeof value === "number" ? value : 0;
}

function terms(row: EnrichmentRow, key: "food" | "cuisine" | "category" | "feature" | "search") {
  const map = {
    food: row.foodTerms ?? row.suggestedFoodTerms,
    cuisine: row.cuisineTerms ?? row.suggestedCuisineTerms,
    category: row.categoryTerms ?? row.suggestedCategoryTerms,
    feature: row.featureTerms ?? row.suggestedFeatureTerms,
    search: row.searchKeywords ?? row.suggestedSearchKeywords,
  };
  return Array.isArray(map[key]) ? map[key] || [] : [];
}

async function copyJson(value: unknown) {
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  }
}

export default function GoogleEnrichmentPanel() {
  const [sourceTable, setSourceTable] = useState<SourceTable>("locations");
  const [limit, setLimit] = useState(10);
  const [onlyWeakSearchTerms, setOnlyWeakSearchTerms] = useState(true);
  const [onlyMissingPlaceId, setOnlyMissingPlaceId] = useState(false);
  const [force, setForce] = useState(false);
  const [enableFoodProbe, setEnableFoodProbe] = useState(true);
  const [maxFoodProbesPerRow, setMaxFoodProbesPerRow] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [understandsApply, setUnderstandsApply] = useState(false);

  const edgeResult = result?.result;
  const scanned = metric(edgeResult, "scanned", "scanned");
  const estimatedApiCalls = metric(edgeResult, "estimatedApiCalls", "estimated_api_calls");
  const requestedProbe = Boolean(result?.enableFoodProbe);
  const showProbeWarning = requestedProbe && scanned > 0 && estimatedApiCalls <= scanned;
  const usefulResults = useMemo(() => edgeResult?.usefulResults || [], [edgeResult]);
  const allResults = useMemo(() => edgeResult?.results || [], [edgeResult]);

  async function run(options: { dryRun: boolean; forceFoodProbe?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        sourceTable,
        limit: options.dryRun ? limit : Math.min(25, limit),
        dryRun: options.dryRun,
        onlyWeakSearchTerms,
        onlyMissingPlaceId,
        force,
        enableFoodProbe: options.forceFoodProbe ? true : enableFoodProbe,
        maxFoodProbesPerRow,
        confirmApply: !options.dryRun,
        applyHighConfidence: false,
      };
      const response = await fetch("/api/admin/locations/google-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as EnrichmentResult & { error?: string };
      if (!response.ok) throw new Error(json.error || "Google enrichment request failed.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setUnderstandsApply(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">Google Places</p>
            <h2 className="mt-1 text-2xl font-black text-white">Google Enrichment</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              Preview Google Places enrichment and create pending-review suggestions. Review-only runs do not auto-apply live metadata.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copyJson(usefulResults)} className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black text-white/75 hover:bg-white/10">Copy useful results JSON</button>
            <button type="button" onClick={() => copyJson(result)} className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-black text-white/75 hover:bg-white/10">Copy full response JSON</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Select label="Source table" value={sourceTable} onChange={(value) => setSourceTable(value as SourceTable)} options={["locations", "restaurants", "activities"]} />
          <Select label="Limit" value={String(limit)} onChange={(value) => setLimit(Number(value))} options={LIMITS.map(String)} />
          <Select label="Max food probes per row" value={String(maxFoodProbesPerRow)} onChange={(value) => setMaxFoodProbesPerRow(Number(value))} options={PROBES.map(String)} />
          <Checkbox label="Only weak search terms" checked={onlyWeakSearchTerms} onChange={setOnlyWeakSearchTerms} />
          <Checkbox label="Only missing Google Place ID" checked={onlyMissingPlaceId} onChange={setOnlyMissingPlaceId} />
          <Checkbox label="Enable food probe" checked={enableFoodProbe} onChange={setEnableFoodProbe} />
          <Checkbox label="Force recheck" checked={force} onChange={setForce} />
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-black text-emerald-100">Review Pending Google Suggestions</p>
          <p className="mt-1 text-xs font-bold text-white/60">
            Approve or reject created suggestions from the review queue.
          </p>
          <a
            href="/admin/dashboard/locations/google-enrichment"
            className="mt-3 inline-flex rounded-full bg-emerald-500 px-4 py-2 text-xs font-black text-white"
          >
            Open Approve / Reject Queue
          </a>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton disabled={loading} onClick={() => run({ dryRun: true })}>Preview</ActionButton>
          <ActionButton disabled={loading} onClick={() => run({ dryRun: true, forceFoodProbe: true })}>Preview with Food Probe</ActionButton>
          <ActionButton disabled={loading} onClick={() => setConfirmOpen(true)} danger>Create Review Suggestions</ActionButton>
          <ActionButton disabled={loading && !result} onClick={() => { setResult(null); setError(null); }}>Clear Results</ActionButton>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
        {showProbeWarning ? <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/15 p-4 text-sm font-bold text-amber-100">Food probe does not appear to be running. Expected estimated API calls to be higher than scanned.</div> : null}
      </section>

      {edgeResult ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary label="Scanned" value={scanned} />
            <Summary label="Matched" value={metric(edgeResult, "matched", "matched")} />
            <Summary label="No Match" value={metric(edgeResult, "noMatch", "no_match")} />
            <Summary label="No Useful Terms" value={metric(edgeResult, "noUsefulTerms", "no_useful_terms")} />
            <Summary label="Pending Review" value={metric(edgeResult, "pendingReview", "pending_review")} />
            <Summary label="Auto Apply Ready" value={metric(edgeResult, "autoApplyReady", "auto_apply_ready")} />
            <Summary label="Failed" value={metric(edgeResult, "failed", "failed")} />
            <Summary label="Estimated API Calls" value={estimatedApiCalls} />
            <Summary label="Suggestions Created" value={metric(edgeResult, "suggestionsCreated", "suggestions_created")} />
            <Summary label="Skipped Existing" value={metric(edgeResult, "suggestionsSkippedExisting", "suggestions_skipped_existing")} />
            <Summary label="Auto Applied" value={metric(edgeResult, "autoApplied", "auto_applied")} />
          </section>

          <ResultsSection title="Useful Results" rows={usefulResults} empty="No useful results returned yet." />
          <details className="rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-5 shadow-2xl">
            <summary className="cursor-pointer text-sm font-black text-white/80">Show all scanned results</summary>
            <div className="mt-4">
              <ResultsSection title="Full Results" rows={allResults} empty="No scanned results returned." compact />
            </div>
          </details>
        </>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl">
            <h3 className="text-2xl font-black text-white">Create Review Suggestions?</h3>
            <p className="mt-3 text-sm leading-6 text-white/65">This creates pending-review suggestions only. It will not auto-apply live location metadata.</p>
            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm font-bold text-white/75">
              <input type="checkbox" checked={understandsApply} onChange={(event) => setUnderstandsApply(event.target.checked)} className="mt-1" />
              I understand this will create pending-review suggestions only.
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/75">Cancel</button>
              <button type="button" disabled={!understandsApply || loading} onClick={() => run({ dryRun: false })} className="rounded-full bg-rose-500 px-5 py-3 text-sm font-black text-white disabled:opacity-45">Confirm Create Review Suggestions</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/[0.07] px-4 text-sm font-bold text-white outline-none focus:border-rose-300">
        {options.map((option) => <option key={option} className="text-black" value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/70">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ActionButton({ children, disabled, onClick, danger }: { children: ReactNode; disabled?: boolean; onClick: () => void; danger?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`${danger ? "bg-rose-500 text-white" : "bg-white text-black"} rounded-full px-5 py-3 text-sm font-black shadow-xl disabled:opacity-45`}>{children}</button>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-4 shadow-xl">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function ResultsSection({ title, rows, empty, compact }: { title: string; rows: EnrichmentRow[]; empty: string; compact?: boolean }) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-black text-white">{title}</h3>
      {rows.length ? rows.map((row, index) => <ResultCard key={`${row.locationName || row.name || "row"}-${index}`} row={row} compact={compact} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/45">{empty}</div>}
    </section>
  );
}

function ResultCard({ row, compact }: { row: EnrichmentRow; compact?: boolean }) {
  const status = row.wouldStatus || row.status || "unknown";
  const statusClass = STATUS_CLASSES[status] || "border-white/10 bg-white/[0.07] text-white/70";
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-white">{row.name || row.locationName || "Unnamed"}</h4>
          <p className="mt-1 text-sm text-white/55">{row.googleDisplayName || "No Google display name"}</p>
          <p className="mt-1 text-xs text-white/40">{row.googleAddress || "No Google address"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}>{status}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs font-black text-white/60">{row.matchConfidence ?? 0}%</span>
        </div>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-5"}`}>
        <TermList title="Food" terms={terms(row, "food")} />
        <TermList title="Cuisine" terms={terms(row, "cuisine")} />
        <TermList title="Category" terms={terms(row, "category")} />
        <TermList title="Features" terms={terms(row, "feature")} />
        <TermList title="Search Keywords" terms={terms(row, "search")} />
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">
        <p className="font-black uppercase tracking-[0.16em] text-white/40">Food probe debug</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <p>Used: <span className="text-white/80">{String(Boolean(row.foodProbeUsed))}</span></p>
          <p>API calls: <span className="text-white/80">{row.foodProbeApiCalls ?? 0}</span></p>
          <p>Skipped reason: <span className="text-white/80">{row.foodProbeSkippedReason || "none"}</span></p>
          <p>Matched terms: <span className="text-white/80">{(row.foodProbeMatchedTerms || []).join(", ") || "none"}</span></p>
        </div>
        <p className="mt-2">Queries: <span className="text-white/80">{(row.foodProbeQueries || []).join(" | ") || "none"}</span></p>
      </div>
      {row.error ? <p className="mt-3 text-sm font-bold text-red-200">{row.error}</p> : null}
    </article>
  );
}

function TermList({ title, terms }: { title: string; terms: string[] }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {terms.length ? terms.map((term) => <span key={term} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70">{term}</span>) : <span className="text-sm text-white/35">None</span>}
      </div>
    </div>
  );
}
