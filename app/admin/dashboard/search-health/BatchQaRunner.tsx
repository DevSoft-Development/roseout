"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type QaSummary = {
  index: number;
  query: string;
  ok?: boolean;
  testPassed?: boolean;
  normalized_search_type?: string | null;
  primary_domain?: string | null;
  restaurant_count?: number | null;
  activity_count?: number | null;
  pair_count?: number | null;
  fallback_pair_count?: number | null;
  fallbackPairsUsedAsPrimary?: boolean;
  primaryResultType?: string | null;
  render_mode?: string | null;
  timing_ms?: number | null;
  speed_status?: string | null;
  intentParserSource?: string | null;
  fastPathMatched?: boolean;
  fastPathReason?: string | null;
  llm_ms?: number | null;
  rpc_ms?: number | null;
  intent_parse_ms?: number | null;
  ranking_ms?: number | null;
  result_count?: number | null;
  no_results_reason?: string | null;
  no_pairs_reason?: string | null;
  warnings?: string[];
  errors?: string[];
  suspiciousFlags?: string[];
  activityTerms?: string[];
  restaurantTerms?: string[];
};

type NormalizedQaSummary = Required<
  Pick<
    QaSummary,
    | "index"
    | "query"
    | "testPassed"
    | "normalized_search_type"
    | "primary_domain"
    | "restaurant_count"
    | "activity_count"
    | "pair_count"
    | "fallback_pair_count"
    | "fallbackPairsUsedAsPrimary"
    | "primaryResultType"
    | "render_mode"
    | "timing_ms"
    | "speed_status"
    | "intentParserSource"
    | "fastPathMatched"
    | "fastPathReason"
    | "llm_ms"
    | "rpc_ms"
    | "intent_parse_ms"
    | "ranking_ms"
    | "result_count"
    | "no_results_reason"
    | "no_pairs_reason"
    | "warnings"
    | "errors"
    | "suspiciousFlags"
    | "activityTerms"
    | "restaurantTerms"
  >
> & {
  ok: boolean;
  llmUsed: boolean;
  fallbackUsed: boolean;
  noResults: boolean;
  mixedNoPairs: boolean;
};

type BatchResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  count: number;
  summary: QaSummary[];
  results: {
    index: number;
    query: string;
    summary: QaSummary;
    result?: unknown;
  }[];
};

type PromptGroups = Record<string, readonly string[]>;

const groupLabels: Record<string, string> = {
  core: "Core",
  sportsWatch: "Sports Watch",
  relaxedNoClub: "Relaxed / No Club",
  walkingDistance: "Walking Distance",
  mixedOuting: "Mixed Outing",
  nightlife: "Nightlife",
  hookah: "Hookah",
  dateNight: "Date Night",
  activityOnly: "Activity Only",
  restaurantOnly: "Restaurant Only",
};

const filters = [
  ["all", "All"],
  ["failed", "Failed"],
  ["slow", "Slow/Critical"],
  ["llm", "LLM Used"],
  ["fallback", "Deterministic Fallback"],
  ["no_results", "No Results"],
  ["mixed_no_pairs", "Mixed No Pairs"],
  ["errors", "Errors"],
] as const;

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function deriveSpeed(timingMs: number | null) {
  if (timingMs == null) return null;
  if (timingMs < 1000) return "fast";
  if (timingMs < 2000) return "good";
  if (timingMs < 4000) return "slow";
  return "critical";
}

function normalizeRow(row: QaSummary): NormalizedQaSummary {
  const restaurantCount = toNumber(row.restaurant_count);
  const activityCount = toNumber(row.activity_count);
  const pairCount = toNumber(row.pair_count);
  const resultCount = toNumber(
    row.result_count,
    restaurantCount + activityCount + pairCount,
  );
  const timingMs = toNullableNumber(row.timing_ms);
  const parserSource = row.intentParserSource ?? null;
  const llmMs = toNullableNumber(row.llm_ms);
  const flags = new Set(toStrings(row.suspiciousFlags));
  const errors = toStrings(row.errors);
  const warnings = toStrings(row.warnings);
  const searchType = row.normalized_search_type ?? null;
  const primaryDomain = row.primary_domain ?? null;
  const mixedRequest =
    primaryDomain === "mixed" ||
    searchType === "paired_outing" ||
    searchType === "same_venue";
  const noResults = resultCount === 0;
  const mixedNoPairs = mixedRequest && pairCount === 0;
  const llmUsed = (llmMs != null && llmMs > 0) || parserSource === "llm";
  const fallbackUsed =
    flags.has("deterministic_fallback") ||
    Boolean(row.fallbackPairsUsedAsPrimary) ||
    toNumber(row.fallback_pair_count) > 0;

  if (errors.length) flags.add("errors");
  if (warnings.length) flags.add("warnings");
  if (noResults) flags.add("no_results");
  if (mixedNoPairs) flags.add("mixed_no_pairs");
  if (llmUsed) flags.add("llm_used");
  if (fallbackUsed) flags.add("deterministic_fallback");

  const speedStatus = row.speed_status ?? deriveSpeed(timingMs);
  if (speedStatus === "slow") flags.add("slow");
  if (speedStatus === "critical") flags.add("critical_speed");

  const testPassed = row.testPassed ?? row.ok ?? errors.length === 0;

  return {
    index: row.index,
    query: row.query,
    ok: row.ok ?? true,
    testPassed,
    normalized_search_type: searchType,
    primary_domain: primaryDomain,
    restaurant_count: restaurantCount,
    activity_count: activityCount,
    pair_count: pairCount,
    fallback_pair_count: toNumber(row.fallback_pair_count),
    fallbackPairsUsedAsPrimary: Boolean(row.fallbackPairsUsedAsPrimary),
    primaryResultType: row.primaryResultType ?? null,
    render_mode: row.render_mode ?? null,
    timing_ms: timingMs,
    speed_status: speedStatus,
    intentParserSource: parserSource,
    fastPathMatched: Boolean(row.fastPathMatched),
    fastPathReason: row.fastPathReason ?? null,
    llm_ms: llmMs,
    rpc_ms: toNullableNumber(row.rpc_ms),
    intent_parse_ms: toNullableNumber(row.intent_parse_ms),
    ranking_ms: toNullableNumber(row.ranking_ms),
    result_count: resultCount,
    no_results_reason: row.no_results_reason ?? null,
    no_pairs_reason: row.no_pairs_reason ?? null,
    warnings,
    errors,
    suspiciousFlags: [...flags],
    activityTerms: toStrings(row.activityTerms),
    restaurantTerms: toStrings(row.restaurantTerms),
    llmUsed,
    fallbackUsed,
    noResults,
    mixedNoPairs,
  };
}

function matchesFilter(row: NormalizedQaSummary, filter: string) {
  if (filter === "all") return true;
  if (filter === "failed") return !row.testPassed;
  if (filter === "slow") return ["slow", "critical"].includes(row.speed_status ?? "");
  if (filter === "llm") return row.llmUsed;
  if (filter === "fallback") return row.fallbackUsed;
  if (filter === "no_results") return row.noResults;
  if (filter === "mixed_no_pairs") return row.mixedNoPairs;
  if (filter === "errors") return row.errors.length > 0;
  return true;
}

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function BatchQaRunner() {
  const [promptText, setPromptText] = useState("");
  const [singleQuery, setSingleQuery] = useState("");
  const [delayMs, setDelayMs] = useState(200);
  const [maxQueries, setMaxQueries] = useState(100);
  const [includeFullDebug, setIncludeFullDebug] = useState(true);
  const [groups, setGroups] = useState<PromptGroups>({});
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [singleResult, setSingleResult] = useState<BatchResult | null>(null);
  const [filter, setFilter] = useState("all");
  const [running, setRunning] = useState(false);
  const [singleRunning, setSingleRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0, query: "" });
  const stopRequested = useRef(false);

  useEffect(() => {
    if (!startedAt || (!running && !singleRunning)) return;
    const id = window.setInterval(
      () => setElapsed(Date.now() - startedAt.getTime()),
      500,
    );
    return () => window.clearInterval(id);
  }, [running, singleRunning, startedAt]);

  const queryLines = useMemo(
    () => toLines(promptText).slice(0, maxQueries || 100),
    [promptText, maxQueries],
  );
  const normalizedRows = useMemo(
    () => (batchResult?.summary ?? []).map(normalizeRow),
    [batchResult],
  );
  const stats = useMemo(
    () => ({
      total: normalizedRows.length,
      passed: normalizedRows.filter((row) => row.testPassed).length,
      failed: normalizedRows.filter((row) => !row.testPassed).length,
      fast: normalizedRows.filter((row) => row.speed_status === "fast").length,
      good: normalizedRows.filter((row) => row.speed_status === "good").length,
      slow: normalizedRows.filter((row) => row.speed_status === "slow").length,
      critical: normalizedRows.filter((row) => row.speed_status === "critical").length,
      llm: normalizedRows.filter((row) => row.llmUsed).length,
      fastPath: normalizedRows.filter((row) => row.fastPathMatched).length,
      fallback: normalizedRows.filter((row) => row.fallbackUsed).length,
      noResults: normalizedRows.filter((row) => row.noResults).length,
      mixedNoPairs: normalizedRows.filter((row) => row.mixedNoPairs).length,
      errors: normalizedRows.filter((row) => row.errors.length > 0).length,
    }),
    [normalizedRows],
  );
  const filteredRows = useMemo(
    () => normalizedRows.filter((row) => matchesFilter(row, filter)),
    [normalizedRows, filter],
  );
  const suspiciousRows = useMemo(
    () =>
      normalizedRows.filter(
        (row) =>
          !row.testPassed ||
          row.suspiciousFlags.length > 0 ||
          row.errors.length > 0 ||
          row.warnings.length > 0,
      ),
    [normalizedRows],
  );

  async function fetchPromptData() {
    const response = await fetch("/api/admin/search-health/qa-prompts", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Failed to load prompts");
    setGroups(payload.groups ?? {});
    return payload as { prompts: string[]; groups: PromptGroups };
  }

  async function callBatchApi(queries: string[]) {
    const response = await fetch("/api/admin/search-health/batch-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, delayMs, maxQueries, includeFullDebug }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Batch QA failed");
    return payload as BatchResult;
  }

  async function runQueries(queries: string[], mode: "single" | "batch") {
    const capped = queries.slice(0, Math.min(Math.max(maxQueries || 1, 1), 100));
    if (!capped.length) return;
    stopRequested.current = false;
    setNotice(null);
    setError(null);
    const runStartedAt = new Date();
    setStartedAt(runStartedAt);
    setElapsed(0);
    setProgress({ current: 0, total: capped.length, query: capped[0] ?? "" });
    mode === "single" ? setSingleRunning(true) : setRunning(true);

    try {
      if (mode === "single") {
        const payload = await callBatchApi(capped);
        setSingleResult(payload);
        setNotice(`Single QA run complete (${payload.count} search).`);
        return;
      }

      const combined: BatchResult = {
        ok: true,
        startedAt: runStartedAt.toISOString(),
        finishedAt: runStartedAt.toISOString(),
        count: 0,
        summary: [],
        results: [],
      };

      for (const [index, query] of capped.entries()) {
        if (stopRequested.current) break;
        setProgress({ current: index + 1, total: capped.length, query });
        const payload = await callBatchApi([query]);
        const row = payload.summary[0];
        const result = payload.results[0];
        if (row) {
          const indexedRow = { ...row, index };
          combined.summary.push(indexedRow);
          combined.results.push(
            result
              ? { ...result, index, summary: indexedRow }
              : { index, query, summary: indexedRow },
          );
        }
        combined.count = combined.summary.length;
        combined.finishedAt = payload.finishedAt;
        setBatchResult({
          ...combined,
          summary: [...combined.summary],
          results: [...combined.results],
        });
        if (index < capped.length - 1 && delayMs > 0 && !stopRequested.current) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, Math.min(Math.max(delayMs, 0), 5000)),
          );
        }
      }
      setNotice(`Batch QA run complete (${combined.count} searches).`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Batch QA failed");
    } finally {
      mode === "single" ? setSingleRunning(false) : setRunning(false);
      setProgress((current) => ({ ...current, query: "" }));
    }
  }

  function exportCsv() {
    const columns = [
      "query",
      "testPassed",
      "normalized_search_type",
      "primary_domain",
      "restaurant_count",
      "activity_count",
      "pair_count",
      "result_count",
      "timing_ms",
      "speed_status",
      "intentParserSource",
      "fastPathMatched",
      "llmUsed",
      "fallbackUsed",
      "noResults",
      "mixedNoPairs",
      "suspiciousFlags",
      "errors",
    ] as const;
    const csv = [
      columns.join(","),
      ...normalizedRows.map((row) =>
        columns
          .map((column) => {
            const value = row[column];
            const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");
    downloadFile("search-qa-summary.csv", csv, "text/csv;charset=utf-8");
  }

  return (
    <section className="rounded-3xl border border-rose-300/20 bg-[#120d0b] p-6 shadow-2xl shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">
            Batch QA Search Runner
          </p>
          <h2 className="mt-2 text-2xl font-black">Run production-parity V2 QA</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
            Every row is normalized before cards, filters, exports, and failure views are calculated.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">
          Production QA
        </span>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="font-black">Single Search QA</h3>
          <div className="mt-3 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
              value={singleQuery}
              onChange={(event) => setSingleQuery(event.target.value)}
              placeholder="Run one prompt"
            />
            <button
              className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
              disabled={singleRunning || !singleQuery.trim()}
              onClick={() => runQueries([singleQuery.trim()], "single")}
            >
              {singleRunning ? "Running…" : "Run"}
            </button>
          </div>
          {singleResult?.summary?.[0] ? (
            <SummaryStrip row={normalizeRow(singleResult.summary[0])} />
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="font-black">Batch Search QA</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-black"
              onClick={async () => {
                const payload = await fetchPromptData();
                setPromptText((payload.prompts ?? []).join("\n"));
              }}
            >
              Load Default QA Prompts
            </button>
            {Object.keys(groupLabels).map((key) => (
              <button
                key={key}
                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black"
                onClick={async () => {
                  const available = Object.keys(groups).length ? groups : (await fetchPromptData()).groups;
                  setPromptText((available[key] ?? []).join("\n"));
                }}
              >
                {groupLabels[key]}
              </button>
            ))}
          </div>
          <textarea
            className="mt-3 min-h-64 w-full rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-5 text-white"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="One prompt per line"
          />
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
              Delay ms
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white"
                type="number"
                min={0}
                max={5000}
                value={delayMs}
                onChange={(event) => setDelayMs(Number(event.target.value))}
              />
            </label>
            <label className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
              Max queries
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white"
                type="number"
                min={1}
                max={100}
                value={maxQueries}
                onChange={(event) => setMaxQueries(Number(event.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm font-bold text-white/70">
              <input
                type="checkbox"
                checked={includeFullDebug}
                onChange={(event) => setIncludeFullDebug(event.target.checked)}
              />
              Include full debug
            </label>
            <div className="flex items-end gap-2">
              <button
                className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                disabled={running || !queryLines.length}
                onClick={() => runQueries(queryLines, "batch")}
              >
                {running ? "Running…" : "Run Batch"}
              </button>
              <button
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black"
                disabled={!running}
                onClick={() => {
                  stopRequested.current = true;
                  setNotice("Stop requested. The current search will finish first.");
                }}
              >
                Stop
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/65">
            Running {running ? progress.current : 0} / {progress.total || queryLines.length} · Current query: {running ? progress.query || "—" : "—"} · Started: {startedAt?.toLocaleTimeString() ?? "—"} · Elapsed: {Math.round(elapsed / 1000)}s
          </div>
        </section>
      </div>

      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {batchResult ? (
        <div className="mt-6 space-y-5">
          <section>
            <h3 className="font-black">Batch Results Summary</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-7">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="rounded-2xl bg-white/[0.04] p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/40">
                    {key}
                  </div>
                  <div className="mt-2 text-2xl font-black">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
              onClick={() =>
                downloadFile(
                  "search-qa-summary.json",
                  JSON.stringify(normalizedRows, null, 2),
                  "application/json",
                )
              }
            >
              Download Summary JSON
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={exportCsv}
            >
              Download Summary CSV
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={() =>
                downloadFile(
                  "search-qa-full-batch.json",
                  JSON.stringify(batchResult, null, 2),
                  "application/json",
                )
              }
            >
              Download Full Batch JSON
            </button>
          </section>

          <section>
            <h3 className="font-black">Failed / Slow / Suspicious Searches</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {suspiciousRows.slice(0, 12).map((row) => (
                <SummaryStrip key={row.index} row={row} />
              ))}
              {!suspiciousRows.length ? (
                <p className="text-sm text-white/50">No suspicious rows flagged.</p>
              ) : null}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap gap-2">
              {filters.map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded-2xl px-3 py-2 text-xs font-black ${filter === key ? "bg-white text-black" : "bg-white/10"}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[1250px] text-left text-xs">
                <thead className="bg-white/[0.04] uppercase tracking-[0.16em] text-white/45">
                  <tr>
                    {[
                      "Status",
                      "Query",
                      "Type",
                      "Domain",
                      "Restaurants",
                      "Activities",
                      "Pairs",
                      "Results",
                      "Speed",
                      "Total ms",
                      "Parser",
                      "Fallback",
                      "Flags",
                    ].map((heading) => (
                      <th key={heading} className="px-3 py-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredRows.map((row) => (
                    <tr key={row.index}>
                      <td className="px-3 py-3 font-black">
                        <span className={row.testPassed ? "text-emerald-200" : "text-red-200"}>
                          {row.testPassed ? "Passed" : "Failed"}
                        </span>
                      </td>
                      <td className="max-w-[320px] px-3 py-3 font-semibold">{row.query}</td>
                      <td className="px-3 py-3">{row.normalized_search_type ?? "—"}</td>
                      <td className="px-3 py-3">{row.primary_domain ?? "—"}</td>
                      <td className="px-3 py-3">{row.restaurant_count}</td>
                      <td className="px-3 py-3">{row.activity_count}</td>
                      <td className="px-3 py-3">{row.pair_count}</td>
                      <td className="px-3 py-3">{row.result_count}</td>
                      <td className="px-3 py-3">{row.speed_status ?? "—"}</td>
                      <td className="px-3 py-3">{row.timing_ms ?? "—"}</td>
                      <td className="px-3 py-3">{row.intentParserSource ?? "—"}</td>
                      <td className="px-3 py-3">{row.fallbackUsed ? "yes" : "no"}</td>
                      <td className="max-w-[260px] px-3 py-3 text-amber-100">
                        {row.suspiciousFlags.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function SummaryStrip({ row }: { row: NormalizedQaSummary }) {
  return (
    <div className="rounded-2xl bg-black/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-black">{row.query}</div>
        <span className={row.testPassed ? "text-emerald-200" : "text-red-200"}>
          {row.testPassed ? "Passed" : "Failed"}
        </span>
      </div>
      <div className="mt-1 text-white/55">
        {row.normalized_search_type ?? "—"} · {row.speed_status ?? "—"} · {row.timing_ms ?? "—"}ms · R{row.restaurant_count}/A{row.activity_count}/P{row.pair_count}
      </div>
      {row.suspiciousFlags.length ? (
        <div className="mt-2 text-xs font-bold text-amber-100">
          {row.suspiciousFlags.join(", ")}
        </div>
      ) : null}
    </div>
  );
}
