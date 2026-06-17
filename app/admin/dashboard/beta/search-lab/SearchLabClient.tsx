"use client";

import { useState } from "react";

const examples = [
  "steak dinner with bowling in Astoria",
  "group dinner and drinks",
  "casual dinner and relaxed activity",
  "restaurant with activity walking distance",
  "steak dinner and hookah lounge after",
];

type SearchLabResult = Record<string, unknown>;

type SearchLabBatchResult = {
  query: string;
  success: boolean;
  data?: SearchLabResult;
  error?: string;
};

function getNonEmptySearchLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function pickFirst(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getIntent(result: SearchLabResult | undefined) {
  const debug = result?.debug as SearchLabResult | undefined;
  return (result?.parsedIntent as SearchLabResult | undefined) || (debug?.normalizedIntent as SearchLabResult | undefined) || (debug?.intent as SearchLabResult | undefined) || {};
}

function asSearchLabResult(value: unknown): SearchLabResult {
  return value && typeof value === "object" ? (value as SearchLabResult) : {};
}

function getGeo(intent: SearchLabResult, result: SearchLabResult | undefined): SearchLabResult {
  return asSearchLabResult(intent.geo || intent.location || result?.effectiveGeo || result?.originalGeo);
}

function SearchDebugFields({ result }: { result: SearchLabResult }) {
  const intent = getIntent(result);
  const geo = getGeo(intent, result);
  const fields = [
    ["Search type", pickFirst(intent.searchType, intent.search_type, intent.type, result.searchType)],
    ["Primary domain", pickFirst(intent.primaryDomain, intent.primary_domain, intent.domain, result.primaryDomain)],
    ["Needs restaurant", pickFirst(intent.needsRestaurant, intent.needs_restaurant, intent.restaurantRequired)],
    ["Needs activity", pickFirst(intent.needsActivity, intent.needs_activity, intent.activityRequired)],
    ["Wants pairing", pickFirst(intent.wantsPairing, intent.wants_pairing, intent.pairingRequested)],
    ["Geo raw", pickFirst(geo.raw, geo.rawQuery, intent.geoRaw, result.originalGeo)],
    ["Geo city", pickFirst(geo.city, intent.city)],
    ["Geo borough", pickFirst(geo.borough, intent.borough)],
    ["Geo neighborhood", pickFirst(geo.neighborhood, intent.neighborhood)],
    ["Geo state", pickFirst(geo.state, intent.state)],
    ["Time context", pickFirst(intent.timeContext, intent.time_context, intent.time, intent.when)],
    ["Occasion", pickFirst(intent.occasion, intent.occasionType, intent.occasion_type)],
    ["Restaurant intent terms", pickFirst(intent.restaurantIntentTerms, intent.restaurant_intent_terms, result.restaurantRpcTerms, result.restaurantRpcTermsPruned)],
    ["Activity intent terms", pickFirst(intent.activityIntentTerms, intent.activity_intent_terms, result.activityRpcTerms, result.activityRpcTermsPruned)],
  ];

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label as string} className="rounded-2xl bg-white/[.04] p-3">
          <p className="text-xs text-white/50">{label as string}</p>
          <p className="whitespace-pre-wrap break-words font-semibold text-white/85">{formatValue(value)}</p>
        </div>
      ))}
    </div>
  );
}

function ResultDetails({ result }: { result: SearchLabResult }) {
  return (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {[
          ["Restaurants", result.restaurants],
          ["Activities", result.activities],
          ["Pairs", result.pairs],
          ["Speed", result.speedStatus || result.speed_status],
          ["Fallback", String(result.fallbackUsed)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl bg-white/[.04] p-3">
            <p className="text-xs text-white/50">{String(k)}</p>
            <p className="font-black">{formatValue(v)}</p>
          </div>
        ))}
      </div>
      <SearchDebugFields result={result} />
      <h3 className="mt-5 font-black">Search speed breakdown</h3>
      <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.performance, null, 2)}</pre>
      <h3 className="mt-5 font-black">Parsed intent</h3>
      <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.parsedIntent, null, 2)}</pre>
      <details className="mt-5">
        <summary className="cursor-pointer font-black text-rose-200">Debug accordion</summary>
        <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.debug, null, 2)}</pre>
      </details>
    </>
  );
}

export default function SearchLabClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchLabResult | null>(null);
  const [batchResults, setBatchResults] = useState<SearchLabBatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q = query) {
    setQuery(q);
    setLoading(true);
    setError(null);
    setResult(null);
    setBatchResults([]);

    const searchLines = getNonEmptySearchLines(q);
    const runSingleSearch = async (line: string) => {
      const res = await fetch("/api/admin/beta/search-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: line, rawQuery: line, usedCustomPrompt: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Search test failed.");
      return json;
    };

    try {
      if (searchLines.length > 1) {
        const settledResults = await Promise.allSettled(searchLines.map((line) => runSingleSearch(line)));
        setBatchResults(
          settledResults.map((settled, index) => {
            const originalQuery = searchLines[index];
            if (settled.status === "fulfilled") {
              return { query: originalQuery, success: true, data: settled.value };
            }
            return {
              query: originalQuery,
              success: false,
              error: settled.reason instanceof Error ? settled.reason.message : "Search test failed.",
            };
          }),
        );
        return;
      }

      const singleQuery = searchLines[0] || q.trim();
      setResult(await runSingleSearch(singleQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search test failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          placeholder="Enter a beta tester prompt"
        />
        <button onClick={() => run()} disabled={loading} className="mt-3 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-60">
          {loading ? "Running..." : "Run test search"}
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button key={e} onClick={() => run(e)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
              {e}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 font-semibold text-red-100">{error}</div> : null}

      {batchResults.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-200">Batch search test</p>
          <h2 className="mt-2 text-2xl font-black">Testing {batchResults.length} searches one at a time</h2>
          <div className="mt-5 space-y-4">
            {batchResults.map((batchResult, index) => (
              <article key={`${batchResult.query}-${index}`} className={`rounded-3xl border p-5 ${batchResult.success ? "border-white/10 bg-white/[.03]" : "border-red-400/40 bg-red-500/10"}`}>
                <h3 className="text-xl font-black">{batchResult.query}</h3>
                {batchResult.success && batchResult.data ? <ResultDetails result={batchResult.data} /> : <p className="mt-3 font-semibold text-red-100">Error: {batchResult.error || "Search test failed."}</p>}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <h2 className="text-2xl font-black">Results summary</h2>
          <ResultDetails result={result} />
        </section>
      ) : null}
    </div>
  );
}
