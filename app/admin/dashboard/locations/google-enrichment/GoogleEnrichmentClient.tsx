"use client";

import { useMemo, useState, type ReactNode } from "react";

type Suggestion = {
  id: string;
  source_table: string;
  source_id: string;
  location_name: string | null;
  google_display_name: string | null;
  match_confidence: number | null;
  suggested_search_keywords: string[] | null;
  suggested_semantic_tags: string[] | null;
  suggested_intent_tags: string[] | null;
  suggested_food_terms: string[] | null;
  suggested_cuisine_terms?: string[] | null;
  suggested_category_terms: string[] | null;
  suggested_feature_terms: string[] | null;
  evidence: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
};

type EnrichmentResult = {
  ok?: boolean;
  dryRun?: boolean;
  sourceTable?: string;
  scanned?: number;
  matched?: number;
  noMatch?: number;
  noUsefulTerms?: number;
  pendingReview?: number;
  autoApplyReady?: number;
  suggestionsCreated?: number;
  autoApplied?: number;
  failed?: number;
  estimatedApiCalls?: number;
  usefulResults?: number;
  results?: EnrichmentRow[];
};

type EnrichmentRow = {
  id?: string;
  locationName?: string;
  googleDisplayName?: string | null;
  googleAddress?: string | null;
  matchConfidence?: number;
  status?: string;
  suggested?: {
    foodTerms?: string[];
    cuisineTerms?: string[];
    categoryTerms?: string[];
    featureTerms?: string[];
    searchKeywords?: string[];
  };
  foodProbeUsed?: boolean;
  foodProbeQueries?: string[];
  foodProbeMatchedTerms?: string[];
  foodProbeApiCalls?: number;
  foodProbeSkippedReason?: string | null;
  error?: string;
};

const sourceTables = ["locations", "restaurants", "activities"];
const limits = [5, 10, 25, 50, 100];
const stats = [
  ["Scanned", "scanned"],
  ["Matched", "matched"],
  ["No Match", "noMatch"],
  ["No Useful Terms", "noUsefulTerms"],
  ["Pending Review", "pendingReview"],
  ["Auto Apply Ready", "autoApplyReady"],
  ["Failed", "failed"],
  ["Est. API Calls", "estimatedApiCalls"],
] as const;

export function GoogleEnrichmentClient({ initialSuggestions }: { initialSuggestions: Suggestion[] }) {
  const [sourceTable, setSourceTable] = useState("locations");
  const [limit, setLimit] = useState(10);
  const [onlyWeakSearchTerms, setOnlyWeakSearchTerms] = useState(true);
  const [onlyMissingPlaceId, setOnlyMissingPlaceId] = useState(false);
  const [force, setForce] = useState(false);
  const [enableFoodProbe, setEnableFoodProbe] = useState(false);
  const [maxFoodProbesPerRow, setMaxFoodProbesPerRow] = useState(2);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [suggestionStatus, setSuggestionStatus] = useState("pending_review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const visibleSuggestions = useMemo(() => suggestions.filter((suggestion) => {
    const tableMatches = sourceTable === "locations" || suggestion.source_table === sourceTable;
    const statusMatches = suggestionStatus === "all" || suggestion.status === suggestionStatus;
    return tableMatches && statusMatches;
  }), [suggestions, sourceTable, suggestionStatus]);

  const usefulRows = useMemo(() => (result?.results || []).filter((row) => row.status === "auto_apply_ready" || row.status === "pending_review"), [result]);

  async function refreshSuggestions() {
    const response = await fetch("/api/admin/locations/google-enrichment/suggestions");
    const payload = await response.json();
    if (payload.success) setSuggestions(payload.suggestions || []);
  }

  async function runEnrichment(options?: { dryRun?: boolean; foodProbe?: boolean; limitOverride?: number; confirmApply?: boolean }) {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    try {
      const dryRun = options?.dryRun ?? true;
      const response = await fetch("/api/admin/locations/google-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTable,
          limit: dryRun ? (options?.limitOverride ?? limit) : Math.min(options?.limitOverride ?? limit, 25),
          dryRun,
          confirmApply: options?.confirmApply,
          onlyWeakSearchTerms,
          onlyMissingPlaceId,
          force,
          enableFoodProbe: options?.foodProbe ?? enableFoodProbe,
          maxFoodProbesPerRow,
        }),
      });
      const payload = await response.json();
      setRawResponse(payload);
      if (!response.ok || !payload.success) throw new Error(payload.error || payload.result?.error || "Google enrichment failed.");
      setResult(payload.result || null);
      if (!dryRun) await refreshSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setShowConfirm(false);
      setConfirmChecked(false);
    }
  }

  async function apply(action: "approve" | "reject") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/locations/google-enrichment/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionIds: Array.from(selected), action }),
      });
      const payload = await response.json();
      setRawResponse(payload);
      if (!response.ok || !payload.success) throw new Error(payload.error || "Suggestion update failed.");
      setSelected(new Set());
      await refreshSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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

  async function copyJson(value: unknown) {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Preview / Dry Run first</p>
            <h2 className="mt-2 text-2xl font-black">Google Enrichment Controls</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Preview Google Places enrichment before updating search terms. Dry runs do not write to the database.</p>
          </div>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-100">Default: dryRun true</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select label="Source table" value={sourceTable} onChange={setSourceTable} options={sourceTables} />
          <Select label="Limit" value={String(limit)} onChange={(value) => setLimit(Number(value))} options={limits.map(String)} />
          <Select label="Max probes per row" value={String(maxFoodProbesPerRow)} onChange={(value) => setMaxFoodProbesPerRow(Number(value))} options={["1", "2", "3"]} />
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/50">Food probes are allowed for dry runs, or real writes with a limit of 25 or less.</div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Toggle label="Only weak search terms" checked={onlyWeakSearchTerms} onChange={setOnlyWeakSearchTerms} />
          <Toggle label="Only missing Google Place ID" checked={onlyMissingPlaceId} onChange={setOnlyMissingPlaceId} />
          <Toggle label="Enable food probe" checked={enableFoodProbe} onChange={setEnableFoodProbe} />
          <Toggle label="Force recheck" checked={force} onChange={setForce} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled={loading} onClick={() => runEnrichment({ dryRun: true, foodProbe: false, limitOverride: 10 })}>Preview 10</Button>
          <Button disabled={loading} onClick={() => runEnrichment({ dryRun: true, foodProbe: true })} variant="amber">Preview with Food Probe</Button>
          <Button disabled={loading} onClick={() => setShowConfirm(true)} variant="danger">Run Small Batch</Button>
          <Button disabled={loading && !result} onClick={() => { setResult(null); setRawResponse(null); setError(null); }} variant="ghost">Clear Results</Button>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div> : null}
      </section>

      {result ? (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(([label, key]) => <Stat key={key} label={label} value={result[key] ?? 0} />)}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => copyJson(usefulRows)} variant="ghost">Copy useful results JSON</Button>
            <Button onClick={() => copyJson(rawResponse)} variant="ghost">Copy full response JSON</Button>
          </div>
          <ResultList title="Useful Results" rows={usefulRows} />
          <details className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <summary className="cursor-pointer text-sm font-black text-white">Show all scanned results</summary>
            <div className="mt-4"><ResultList rows={result.results || []} /></div>
          </details>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Pending Suggestions</p>
            <h2 className="mt-2 text-2xl font-black">Review food/search metadata</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select label="Status" value={suggestionStatus} onChange={setSuggestionStatus} options={["pending_review", "auto_apply_ready", "approved", "rejected", "all"]} />
            <Button disabled={loading || selected.size === 0} onClick={() => apply("approve")} variant="success">Approve selected</Button>
            <Button disabled={loading || selected.size === 0} onClick={() => apply("reject")} variant="ghost">Reject selected</Button>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {visibleSuggestions.length ? visibleSuggestions.map((suggestion) => (
            <article key={suggestion.id} className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-center gap-3 text-sm font-bold text-white/70"><input type="checkbox" checked={selected.has(suggestion.id)} onChange={() => toggle(suggestion.id)} />Select</label>
                <StatusPill status={suggestion.status || "pending_review"} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div><p className="text-xs uppercase tracking-widest text-white/40">Local</p><h3 className="mt-1 text-lg font-black">{suggestion.location_name || "Unnamed"}</h3></div>
                <div><p className="text-xs uppercase tracking-widest text-white/40">Google</p><h3 className="mt-1 text-lg font-black">{suggestion.google_display_name || "No display name"}</h3></div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <TermList title="Confidence" terms={[String(suggestion.match_confidence ?? 0)]} />
                <TermList title="Food/Cuisine" terms={[...(suggestion.suggested_food_terms || []), ...(suggestion.suggested_cuisine_terms || [])]} />
                <TermList title="Categories/Features" terms={[...(suggestion.suggested_category_terms || []), ...(suggestion.suggested_feature_terms || [])]} />
                <TermList title="Search metadata" terms={[...(suggestion.suggested_search_keywords || []), ...(suggestion.suggested_semantic_tags || []), ...(suggestion.suggested_intent_tags || [])]} />
              </div>
              <details className="mt-4 rounded-2xl bg-black/30 p-4 text-xs text-white/60"><summary className="cursor-pointer font-bold text-white/80">Evidence</summary><pre className="mt-3 overflow-x-auto">{JSON.stringify(suggestion.evidence || {}, null, 2)}</pre></details>
            </article>
          )) : <p className="rounded-2xl bg-black/25 p-5 text-sm text-white/45">No suggestions match this filter.</p>}
        </div>
      </section>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <div className="max-w-lg rounded-[2rem] border border-red-300/30 bg-[#120908] p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-white">Apply Google Enrichment?</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">This will write approved high-confidence suggestions to location search fields. Low-confidence or weak suggestions will stay pending/review-only. Start with a small batch.</p>
            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/75"><input className="mt-1" type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} />I understand this will update location search metadata.</label>
            <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button><Button variant="danger" disabled={!confirmChecked || loading} onClick={() => runEnrichment({ dryRun: false, confirmApply: true, limitOverride: Math.min(limit, 25) })}>Apply small batch</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-xs font-black uppercase tracking-widest text-white/45">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/45 p-3 text-sm normal-case tracking-normal text-white outline-none"><option className="text-black" value={value}>{value}</option>{options.filter((option) => option !== value).map((option) => <option className="text-black" key={option} value={option}>{option}</option>)}</select></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-white/70"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function Button({ children, disabled, onClick, variant = "default" }: { children: ReactNode; disabled?: boolean; onClick: () => void; variant?: "default" | "amber" | "danger" | "success" | "ghost" }) { const styles = { default: "bg-white text-black", amber: "bg-amber-400 text-black", danger: "bg-rose-600 text-white", success: "bg-emerald-500 text-white", ghost: "border border-white/10 bg-white/[0.06] text-white" }; return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-full px-5 py-3 text-sm font-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}>{children}</button>; }
function Stat({ label, value }: { label: string; value: unknown }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black text-white">{String(value ?? 0)}</p></div>; }
function ResultList({ title, rows }: { title?: string; rows: EnrichmentRow[] }) { return <div className="space-y-3">{title ? <h3 className="text-xl font-black">{title}</h3> : null}{rows.length ? rows.map((row, index) => <ResultCard key={`${row.id || index}-${row.status}`} row={row} />) : <p className="rounded-2xl bg-black/25 p-5 text-sm text-white/45">No rows to show.</p>}</div>; }
function ResultCard({ row }: { row: EnrichmentRow }) { return <article className="rounded-3xl border border-white/10 bg-black/25 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-black">{row.locationName || row.id || "Unnamed"}</h4><p className="mt-1 text-sm text-white/50">{row.googleDisplayName || "No Google match"} · {row.googleAddress || "No address"}</p></div><StatusPill status={row.status || "unknown"} /></div><div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6"><TermList title="Confidence" terms={[String(row.matchConfidence ?? 0)]} /><TermList title="Food" terms={row.suggested?.foodTerms || []} /><TermList title="Cuisine" terms={row.suggested?.cuisineTerms || []} /><TermList title="Category" terms={row.suggested?.categoryTerms || []} /><TermList title="Features" terms={row.suggested?.featureTerms || []} /><TermList title="Search" terms={row.suggested?.searchKeywords || []} /></div><div className="mt-4 rounded-2xl bg-white/[0.04] p-3 text-xs text-white/55"><p className="font-black text-white/75">Food probe debug</p><p>Used: {String(Boolean(row.foodProbeUsed))} · API calls: {row.foodProbeApiCalls || 0} · Skipped: {row.foodProbeSkippedReason || "—"}</p><TermList title="Queries" terms={row.foodProbeQueries || []} /><TermList title="Matched terms" terms={row.foodProbeMatchedTerms || []} /></div>{row.error ? <p className="mt-3 text-sm font-bold text-red-200">{row.error}</p> : null}</article>; }
function StatusPill({ status }: { status: string }) { const color = status === "auto_apply_ready" || status === "approved" ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-100" : status === "pending_review" ? "border-amber-300/30 bg-amber-500/15 text-amber-100" : status === "no_match" || status === "failed" || status === "rejected" ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-white/10 bg-white/10 text-white/60"; return <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${color}`}>{status}</span>; }
function TermList({ title, terms }: { title: string; terms: string[] }) { return <div><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{title}</p><div className="mt-2 flex flex-wrap gap-1.5">{terms.length ? terms.map((term) => <span key={term} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">{term}</span>) : <span className="text-xs text-white/30">None</span>}</div></div>; }
