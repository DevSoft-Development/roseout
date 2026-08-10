"use client";

import { useMemo, useState } from "react";

type AdminApiResult = {
  success?: boolean;
  error?: string;
  debug?: {
    edgePayload?: { error?: string; raw?: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

async function parseJsonResponse(response: Response): Promise<AdminApiResult> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, debug: { edgePayload: { raw: text } } };
  }
}

function googleEnrichmentErrorMessage(json: AdminApiResult) {
  return String(
    json.error ||
      json.debug?.edgePayload?.error ||
      json.debug?.edgePayload?.raw ||
      (json.debug ? JSON.stringify(json.debug) : "") ||
      JSON.stringify(json) ||
      "Google enrichment request failed.",
  );
}

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
  const [status, setStatus] = useState("pending_review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function runEnrichment(dryRun: boolean) {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/locations/google-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTable,
          limit: 25,
          dryRun,
          onlyMissingPlaceId: false,
          onlyWeakSearchTerms: true,
          confirmApply: !dryRun,
          applyHighConfidence: false,
        }),
      });
      const json = await parseJsonResponse(response);
      setResult(json);
      if (!response.ok || json.success === false) {
        setError(googleEnrichmentErrorMessage(json));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function apply(action: "approve" | "reject" | "apply_ready") {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/locations/google-food-suggestions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionIds: Array.from(selected), action }),
      });
      const json = await parseJsonResponse(response);
      setResult(json);
      if (!response.ok || json.success === false) {
        setError(googleEnrichmentErrorMessage(json));
      } else if (action !== "apply_ready") {
        setSelected(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="mb-5 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Google Suggestion Actions</p>
            <p className="mt-1 text-sm font-bold text-white/70">
              Apply high-confidence ready suggestions in controlled batches of 25. Manual-review suggestions remain separate.
            </p>
            <p className="mt-1 text-xs font-bold text-white/45">
              Selected manual-review rows: {selected.size}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => apply("apply_ready")}
              className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply Next 25 Ready
            </button>
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => apply("approve")}
              className="rounded-full bg-white px-6 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve Selected
            </button>
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => apply("reject")}
              className="rounded-full bg-red-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject Selected
            </button>
          </div>
        </div>
      </div>

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
              <option value="pending_review">needs manual review</option>
              <option value="auto_apply_ready">ready to auto-apply</option>
              <option value="applied">applied</option>
              <option value="approved">approved legacy</option>
              <option value="no_useful_terms">no useful terms</option>
              <option value="rejected">rejected</option>
              <option value="all">all</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={loading} onClick={() => runEnrichment(true)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-50">Preview 25</button>
          <button disabled={loading} onClick={() => runEnrichment(false)} className="rounded-full bg-rose-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Create Review Suggestions</button>
          <button disabled={loading} onClick={() => apply("apply_ready")} className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Apply Next 25 Ready</button>
          <button disabled={loading || selected.size === 0} onClick={() => apply("approve")} className="rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Approve Selected</button>
          <button disabled={loading || selected.size === 0} onClick={() => apply("reject")} className="rounded-full bg-red-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Reject Selected</button>
        </div>
        <p className="mt-3 text-xs font-bold text-white/45">
          Applying ready suggestions uses existing stored Google evidence only; it does not make new Google Places requests.
        </p>
        {error ? <div className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
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
