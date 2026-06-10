"use client";

import { useMemo, useState } from "react";

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
  suggested_category_terms: string[] | null;
  suggested_feature_terms: string[] | null;
  evidence: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
};

export function GoogleEnrichmentClient({ initialSuggestions }: { initialSuggestions: Suggestion[] }) {
  const [sourceTable, setSourceTable] = useState("locations");
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const visible = useMemo(() => initialSuggestions.filter((suggestion) => {
    const tableMatches = sourceTable === "all" || suggestion.source_table === sourceTable;
    const statusMatches = status === "all" || suggestion.status === status;
    return tableMatches && statusMatches;
  }), [initialSuggestions, sourceTable, status]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runEnrichment(dryRun: boolean, applyHighConfidence = false) {
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/admin/locations/google-enrichment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceTable,
        limit: 25,
        dryRun,
        onlyMissingPlaceId: false,
        onlyWeakSearchTerms: true,
        applyHighConfidence,
      }),
    });
    setResult(await response.json());
    setLoading(false);
  }

  async function apply(action: "approve" | "reject") {
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/admin/locations/google-food-suggestions/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionIds: Array.from(selected), action }),
    });
    setResult(await response.json());
    setLoading(false);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm font-bold text-white/70">
            Table
            <select value={sourceTable} onChange={(event) => setSourceTable(event.target.value)} className="mt-2 w-full rounded-xl bg-black/50 p-3 text-white">
              <option value="locations">locations</option>
              <option value="restaurants">restaurants</option>
              <option value="activities">activities</option>
              <option value="all">all</option>
            </select>
          </label>
          <label className="text-sm font-bold text-white/70">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-xl bg-black/50 p-3 text-white">
              <option value="pending">pending</option>
              <option value="pending_review">needs review</option>
              <option value="auto_applied">auto applied</option>
              <option value="no_match">no match</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="all">all</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={loading} onClick={() => runEnrichment(true)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-50">Preview 25</button>
          <button disabled={loading} onClick={() => runEnrichment(false)} className="rounded-full bg-rose-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Run 25</button>
          <button disabled={loading || selected.size === 0} onClick={() => apply("approve")} className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Approve selected</button>
          <button disabled={loading || selected.size === 0} onClick={() => apply("reject")} className="rounded-full bg-zinc-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Reject selected</button>
          <button disabled={loading} onClick={() => runEnrichment(false, true)} className="rounded-full bg-amber-400 px-5 py-3 text-sm font-black text-black disabled:opacity-50">Apply high confidence only</button>
        </div>
        {result ? <pre className="mt-5 overflow-x-auto rounded-2xl bg-black/50 p-4 text-xs text-white/70">{JSON.stringify(result, null, 2)}</pre> : null}
      </section>

      <section className="space-y-4">
        {visible.map((suggestion) => {
          const evidence = suggestion.evidence || {};
          return (
            <article key={suggestion.id} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <label className="flex items-center gap-3 text-sm font-bold text-white/70">
                  <input type="checkbox" checked={selected.has(suggestion.id)} onChange={() => toggle(suggestion.id)} />
                  Select
                </label>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/60">{suggestion.status}</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/40">Local name/address</p>
                  <h2 className="mt-1 text-xl font-black">{suggestion.location_name || "Unnamed"}</h2>
                  <p className="mt-2 text-sm text-white/55">{String(evidence.localAddress || "Address not captured in suggestion")}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/40">Google display name/address</p>
                  <h2 className="mt-1 text-xl font-black">{suggestion.google_display_name || "No match"}</h2>
                  <p className="mt-2 text-sm text-white/55">{String(evidence.googleFormattedAddress || "No Google address")}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <TermList title="Confidence" terms={[String(suggestion.match_confidence ?? 0)]} />
                <TermList title="Suggested terms" terms={[...(suggestion.suggested_food_terms || []), ...(suggestion.suggested_category_terms || []), ...(suggestion.suggested_feature_terms || [])]} />
                <TermList title="Added/search metadata" terms={[...(suggestion.suggested_search_keywords || []), ...(suggestion.suggested_semantic_tags || []), ...(suggestion.suggested_intent_tags || [])]} />
              </div>
              <details className="mt-4 rounded-2xl bg-black/30 p-4 text-xs text-white/60">
                <summary className="cursor-pointer font-bold text-white/80">Evidence and existing terms</summary>
                <pre className="mt-3 overflow-x-auto">{JSON.stringify(evidence, null, 2)}</pre>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function TermList({ title, terms }: { title: string; terms: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-white/40">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {terms.length ? terms.map((term) => <span key={term} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">{term}</span>) : <span className="text-sm text-white/35">None</span>}
      </div>
    </div>
  );
}
