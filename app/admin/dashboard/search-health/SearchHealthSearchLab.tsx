"use client";

import { useMemo, useState } from "react";

const MAX_QUERIES = 100;

type LabResult = {
  query?: string;
  fullJson?: unknown;
  response?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
};

type LabResponse = {
  ok?: boolean;
  error?: string;
  summary?: unknown[];
  results?: LabResult[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  [key: string]: unknown;
};

function parseQueries(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((query) => query.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_QUERIES);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SearchHealthSearchLab() {
  const [input, setInput] = useState("");
  const [delayMs, setDelayMs] = useState(200);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<LabResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queries = useMemo(() => parseQueries(input), [input]);

  async function runSearches() {
    if (!queries.length || running) return;
    setRunning(true);
    setError(null);
    setResponse(null);

    try {
      const result = await fetch("/api/admin/search-health/batch-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries,
          delayMs,
          maxQueries: MAX_QUERIES,
          includeFullDebug: true,
        }),
      });
      const json = (await result.json()) as LabResponse;
      if (!result.ok || json.ok === false) {
        throw new Error(json.error || "Search Lab could not complete the run.");
      }
      setResponse(json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  const results = response?.results ?? [];

  return (
    <section
      data-testid="search-health-search-lab"
      className="space-y-5 rounded-3xl border border-white/10 bg-[#100c0b] p-5 shadow-2xl shadow-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">
            Search troubleshooting workspace
          </p>
          <h2 className="mt-2 text-2xl font-black">Search Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Run one query or paste up to 100 queries, then inspect the complete
            response, normalized intent, timing, counts, warnings, errors,
            fallback behavior, result objects, and debug metadata for every run.
          </p>
        </div>
        {response ? (
          <button
            type="button"
            onClick={() =>
              downloadJson(
                `search-health-run-${new Date().toISOString()}.json`,
                response,
              )
            }
            className="rounded-xl border border-white/15 bg-white/[.05] px-4 py-2 text-sm font-black hover:border-rose-400/40"
          >
            Export full run JSON
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <label className="block">
          <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-white/55">
            One search per line
          </span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={10}
            placeholder={"steak dinner and rooftop drinks in Manhattan\nfun activity with my teenage son in Queens\nseafood dinner with theater after"}
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-rose-500/60"
          />
        </label>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">
              Run size
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums">
              {queries.length}
            </p>
            <p className="text-xs text-white/40">Maximum {MAX_QUERIES}</p>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-white/45">
              Delay between searches
            </span>
            <select
              value={delayMs}
              onChange={(event) => setDelayMs(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#17110f] px-3 py-2 text-sm"
            >
              <option value={0}>No delay</option>
              <option value={200}>200 ms</option>
              <option value={500}>500 ms</option>
              <option value={1000}>1 second</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!queries.length || running}
            onClick={runSearches}
            className="w-full rounded-xl bg-rose-700 px-4 py-3 text-sm font-black shadow-lg shadow-rose-950/30 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running
              ? `Running ${queries.length} search${queries.length === 1 ? "" : "es"}…`
              : queries.length === 1
                ? "Run single search"
                : "Run bulk searches"}
          </button>
          <p className="text-xs leading-5 text-white/40">
            Runs use the protected admin endpoint and request full debug output.
            They are intended for QA and production troubleshooting.
          </p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {response ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Queries" value={queries.length} />
            <Metric label="Returned results" value={results.length} />
            <Metric label="Duration" value={`${Number(response.durationMs ?? 0).toLocaleString()} ms`} />
            <Metric label="Completed" value={response.completedAt ? new Date(response.completedAt).toLocaleTimeString() : "—"} />
          </div>

          <div className="space-y-3">
            {results.map((result, index) => {
              const payload = result.fullJson ?? result.response ?? result;
              const query = String(result.query ?? queries[index] ?? `Search ${index + 1}`);
              return (
                <details
                  key={`${query}-${index}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 open:border-rose-500/30"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-black">{query}</p>
                      <p className="mt-1 text-xs text-white/45">
                        Result {index + 1} of {results.length} · Full metadata and response payload
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60">
                      Inspect
                    </span>
                  </summary>
                  <div className="border-t border-white/10 p-4">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(payload, null, 2))}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black hover:border-rose-400/40"
                      >
                        Copy JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadJson(`search-${index + 1}.json`, payload)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black hover:border-rose-400/40"
                      >
                        Download JSON
                      </button>
                    </div>
                    <pre className="max-h-[680px] overflow-auto rounded-xl bg-[#080606] p-4 text-xs leading-6 text-white/70">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>
                </details>
              );
            })}
          </div>

          <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer font-black">Complete batch response</summary>
            <pre className="mt-4 max-h-[720px] overflow-auto rounded-xl bg-[#080606] p-4 text-xs leading-6 text-white/70">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}
