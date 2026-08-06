"use client";

import { useMemo, useRef, useState } from "react";

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
  llm_ms?: number | null;
  result_count?: number | null;
  no_results_reason?: string | null;
  no_pairs_reason?: string | null;
  warnings?: string[];
  errors?: string[];
  suspiciousFlags?: string[];
};

type BatchResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  count: number;
  summary: QaSummary[];
  results: Array<{ index: number; query: string; summary: QaSummary; result?: unknown }>;
};

type NormalizedRow = QaSummary & {
  ok: boolean;
  testPassed: boolean;
  restaurant_count: number;
  activity_count: number;
  pair_count: number;
  result_count: number;
  timing_ms: number | null;
  speed_status: string | null;
  warnings: string[];
  errors: string[];
  suspiciousFlags: string[];
  llmUsed: boolean;
  fallbackUsed: boolean;
  noResults: boolean;
  mixedNoPairs: boolean;
};

const filters = [
  ["all", "All"],
  ["failed", "Failed"],
  ["slow", "Slow/Critical"],
  ["fallback", "Deterministic Fallback"],
  ["no_results", "No Results"],
  ["mixed_no_pairs", "Mixed No Pairs"],
  ["errors", "Errors"],
] as const;

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function deriveSpeed(ms: number | null) {
  if (ms == null) return null;
  if (ms < 1000) return "fast";
  if (ms < 2000) return "good";
  if (ms < 4000) return "slow";
  return "critical";
}

function normalizeRow(row: QaSummary): NormalizedRow {
  const restaurants = numberValue(row.restaurant_count);
  const activities = numberValue(row.activity_count);
  const pairs = numberValue(row.pair_count);
  const results = numberValue(row.result_count, restaurants + activities + pairs);
  const timing = Number.isFinite(Number(row.timing_ms)) ? Number(row.timing_ms) : null;
  const warnings = stringArray(row.warnings);
  const errors = stringArray(row.errors);
  const flags = new Set(stringArray(row.suspiciousFlags));
  const mixed = row.primary_domain === "mixed" || ["paired_outing", "same_venue"].includes(row.normalized_search_type ?? "");
  const noResults = results === 0;
  const mixedNoPairs = mixed && pairs === 0;
  const llmUsed = numberValue(row.llm_ms) > 0 || row.intentParserSource === "llm";
  const fallbackUsed = flags.has("deterministic_fallback") || Boolean(row.fallbackPairsUsedAsPrimary) || numberValue(row.fallback_pair_count) > 0;
  const speed = row.speed_status ?? deriveSpeed(timing);
  const testPassed = row.testPassed ?? (errors.length === 0 && !mixedNoPairs);

  if (noResults) flags.add("no_results");
  if (mixedNoPairs) flags.add("mixed_no_pairs");
  if (errors.length) flags.add("errors");
  if (speed === "slow") flags.add("slow");
  if (speed === "critical") flags.add("critical_speed");

  return {
    ...row,
    ok: testPassed,
    testPassed,
    restaurant_count: restaurants,
    activity_count: activities,
    pair_count: pairs,
    result_count: results,
    timing_ms: timing,
    speed_status: speed,
    warnings,
    errors,
    suspiciousFlags: [...flags],
    llmUsed,
    fallbackUsed,
    noResults,
    mixedNoPairs,
  };
}

function matches(row: NormalizedRow, filter: string) {
  if (filter === "failed") return !row.testPassed;
  if (filter === "slow") return ["slow", "critical"].includes(row.speed_status ?? "");
  if (filter === "fallback") return row.fallbackUsed;
  if (filter === "no_results") return row.noResults;
  if (filter === "mixed_no_pairs") return row.mixedNoPairs;
  if (filter === "errors") return row.errors.length > 0;
  return true;
}

async function copyJson(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

function downloadFile(name: string, value: unknown, type = "application/json") {
  const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BatchQaRunner() {
  const [promptText, setPromptText] = useState("");
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, query: "" });
  const stopRequested = useRef(false);

  const queries = useMemo(() => promptText.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 100), [promptText]);
  const rows = useMemo(() => (batchResult?.summary ?? []).map(normalizeRow), [batchResult]);
  const filtered = useMemo(() => rows.filter((row) => matches(row, filter)), [rows, filter]);
  const stats = useMemo(() => ({
    total: rows.length,
    passed: rows.filter((row) => row.testPassed).length,
    failed: rows.filter((row) => !row.testPassed).length,
    fast: rows.filter((row) => row.speed_status === "fast").length,
    good: rows.filter((row) => row.speed_status === "good").length,
    slow: rows.filter((row) => row.speed_status === "slow").length,
    critical: rows.filter((row) => row.speed_status === "critical").length,
    fallback: rows.filter((row) => row.fallbackUsed).length,
    noResults: rows.filter((row) => row.noResults).length,
    mixedNoPairs: rows.filter((row) => row.mixedNoPairs).length,
    errors: rows.filter((row) => row.errors.length > 0).length,
  }), [rows]);

  async function loadPrompts() {
    const response = await fetch("/api/admin/search-health/qa-prompts", { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Failed to load prompts");
    setPromptText((payload.prompts ?? []).join("\n"));
  }

  async function runBatch() {
    if (!queries.length) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    stopRequested.current = false;
    const combined: BatchResult = { ok: true, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), count: 0, summary: [], results: [] };
    try {
      for (const [index, query] of queries.entries()) {
        if (stopRequested.current) break;
        setProgress({ current: index + 1, total: queries.length, query });
        const response = await fetch("/api/admin/search-health/batch-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: [query], delayMs: 0, maxQueries: 1, includeFullDebug: true }),
        });
        const payload = (await response.json()) as BatchResult & { error?: string };
        if (!payload.ok) throw new Error(payload.error || "Batch QA failed");
        const summary = payload.summary?.[0];
        const result = payload.results?.[0];
        if (summary) {
          const normalizedSummary = { ...summary, index, ok: summary.testPassed ?? summary.ok };
          combined.summary.push(normalizedSummary);
          combined.results.push(result ? { ...result, index, summary: normalizedSummary } : { index, query, summary: normalizedSummary });
        }
        combined.count = combined.summary.length;
        combined.finishedAt = payload.finishedAt;
        combined.ok = combined.summary.every((row) => row.testPassed !== false);
        setBatchResult({ ...combined, summary: [...combined.summary], results: [...combined.results] });
      }
      setNotice(`Batch QA complete: ${combined.summary.filter((row) => row.testPassed).length} passed, ${combined.summary.filter((row) => !row.testPassed).length} failed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Batch QA failed");
    } finally {
      setRunning(false);
      setProgress((value) => ({ ...value, query: "" }));
    }
  }

  async function handleCopy(value: unknown, label: string) {
    try {
      await copyJson(value);
      setNotice(`${label} copied to clipboard.`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copy failed");
    }
  }

  return (
    <section className="rounded-3xl border border-rose-300/20 bg-[#120d0b] p-6 shadow-2xl shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">Batch QA Search Runner</p>
          <h2 className="mt-2 text-2xl font-black">Run production-parity V2 QA</h2>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">Production QA</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-black" onClick={() => void loadPrompts()}>Load Default QA Prompts</button>
        <button className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50" disabled={running || !queries.length} onClick={() => void runBatch()}>{running ? "Running…" : "Run Batch"}</button>
        <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black disabled:opacity-50" disabled={!running} onClick={() => { stopRequested.current = true; }}>Stop</button>
      </div>
      <textarea className="mt-3 min-h-64 w-full rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-5 text-white" value={promptText} onChange={(event) => setPromptText(event.target.value)} placeholder="One prompt per line" />
      <div className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/65">Running {progress.current} / {progress.total || queries.length} · {progress.query || "Idle"}</div>

      {notice ? <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      {batchResult ? <div className="mt-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {Object.entries(stats).map(([key, value]) => <div key={key} className="rounded-2xl bg-white/[0.04] p-3"><div className="text-xs uppercase tracking-[0.18em] text-white/40">{key}</div><div className="mt-2 text-2xl font-black">{value}</div></div>)}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white" onClick={() => void handleCopy(rows, "Summary JSON")}>Copy Summary JSON</button>
          <button className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white" onClick={() => void handleCopy(batchResult, "Full Batch JSON")}>Copy Full Batch JSON</button>
          <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black" onClick={() => downloadFile("search-qa-summary.json", rows)}>Download Summary JSON</button>
          <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black" onClick={() => downloadFile("search-qa-full-batch.json", batchResult)}>Download Full Batch JSON</button>
        </div>

        <div className="flex flex-wrap gap-2">{filters.map(([key, label]) => <button key={key} className={`rounded-2xl px-3 py-2 text-xs font-black ${filter === key ? "bg-white text-black" : "bg-white/10"}`} onClick={() => setFilter(key)}>{label}</button>)}</div>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="bg-white/[0.04] uppercase tracking-[0.16em] text-white/45"><tr>{["Status", "Query", "Type", "Restaurants", "Activities", "Pairs", "Results", "Speed", "Total ms", "Flags"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/10">{filtered.map((row) => <tr key={`${row.index}-${row.query}`}><td className={`px-3 py-3 font-black ${row.testPassed ? "text-emerald-200" : "text-red-200"}`}>{row.testPassed ? "Passed" : "Failed"}</td><td className="max-w-[340px] px-3 py-3 font-semibold">{row.query}</td><td className="px-3 py-3">{row.normalized_search_type ?? "—"}</td><td className="px-3 py-3">{row.restaurant_count}</td><td className="px-3 py-3">{row.activity_count}</td><td className="px-3 py-3">{row.pair_count}</td><td className="px-3 py-3">{row.result_count}</td><td className="px-3 py-3">{row.speed_status ?? "—"}</td><td className="px-3 py-3">{row.timing_ms ?? "—"}</td><td className="max-w-[260px] px-3 py-3 text-amber-100">{row.suspiciousFlags.join(", ") || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </div> : null}
    </section>
  );
}
