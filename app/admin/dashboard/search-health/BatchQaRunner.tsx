"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type QaSummary = {
  index: number;
  query: string;
  ok: boolean;
  normalized_search_type: string | null;
  primary_domain: string | null;
  restaurant_count: number;
  activity_count: number;
  pair_count: number;
  timing_ms: number | null;
  speed_status: string | null;
  intentParserSource: string | null;
  fastPathMatched: boolean;
  fastPathReason: string | null;
  llm_ms: number | null;
  rpc_ms: number | null;
  intent_parse_ms: number | null;
  ranking_ms: number | null;
  result_count: number;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
  warnings: string[];
  errors: string[];
  suspiciousFlags: string[];
  activityTerms: string[];
  restaurantTerms: string[];
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
  ["slow", "Slow/Critical"],
  ["llm", "LLM Used"],
  ["fallback", "Deterministic Fallback"],
  ["no_results", "No Results"],
  ["mixed_no_pairs", "Mixed No Pairs"],
  ["errors", "Errors"],
  ["terms", "Suspicious Terms"],
] as const;

const csvColumns: (keyof QaSummary)[] = [
  "query",
  "ok",
  "normalized_search_type",
  "primary_domain",
  "restaurant_count",
  "activity_count",
  "pair_count",
  "timing_ms",
  "speed_status",
  "intentParserSource",
  "fastPathMatched",
  "fastPathReason",
  "llm_ms",
  "rpc_ms",
  "intent_parse_ms",
  "ranking_ms",
  "result_count",
  "no_results_reason",
  "no_pairs_reason",
  "suspiciousFlags",
  "activityTerms",
  "restaurantTerms",
  "warnings",
  "errors",
];

async function copyToClipboard(value: unknown): Promise<boolean> {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText &&
      typeof window !== "undefined" &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) throw new Error("Copy command failed");
    return true;
  } catch (error) {
    console.error("Copy failed", error);
    return false;
  }
}

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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

function matchesFilter(row: QaSummary, filter: string) {
  if (filter === "all") return true;
  if (filter === "slow")
    return row.suspiciousFlags.some((flag) =>
      ["slow", "critical_speed"].includes(flag),
    );
  if (filter === "llm") return row.suspiciousFlags.includes("llm_used");
  if (filter === "fallback")
    return row.suspiciousFlags.includes("deterministic_fallback");
  if (filter === "no_results")
    return row.suspiciousFlags.includes("no_results");
  if (filter === "mixed_no_pairs")
    return row.suspiciousFlags.includes("mixed_no_pairs");
  if (filter === "errors")
    return row.errors.length > 0 || row.suspiciousFlags.includes("errors");
  if (filter === "terms")
    return row.suspiciousFlags.some((flag) => flag.includes("bad_terms"));
  return true;
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
  const [selectedJson, setSelectedJson] = useState<{
    title: string;
    data: unknown;
    summary?: QaSummary;
  } | null>(null);
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
  const stats = useMemo(() => {
    const rows = batchResult?.summary ?? [];
    return {
      total: rows.length,
      fast: rows.filter((row) => row.speed_status === "fast").length,
      good: rows.filter((row) => row.speed_status === "good").length,
      slow: rows.filter((row) => row.speed_status === "slow").length,
      critical: rows.filter((row) => row.speed_status === "critical").length,
      llm: rows.filter((row) => row.suspiciousFlags.includes("llm_used"))
        .length,
      fastPath: rows.filter((row) => row.fastPathMatched).length,
      fallback: rows.filter((row) =>
        row.suspiciousFlags.includes("deterministic_fallback"),
      ).length,
      noResults: rows.filter((row) =>
        row.suspiciousFlags.includes("no_results"),
      ).length,
      mixedNoPairs: rows.filter((row) =>
        row.suspiciousFlags.includes("mixed_no_pairs"),
      ).length,
      errors: rows.filter((row) => row.errors.length > 0).length,
    };
  }, [batchResult]);
  const filteredSummary = useMemo(
    () =>
      (batchResult?.summary ?? []).filter((row) => matchesFilter(row, filter)),
    [batchResult, filter],
  );
  const suspiciousRows = useMemo(
    () =>
      (batchResult?.summary ?? []).filter(
        (row) =>
          row.suspiciousFlags.length ||
          row.errors.length ||
          row.warnings.length,
      ),
    [batchResult],
  );

  async function fetchPromptData() {
    const res = await fetch("/api/admin/search-health/qa-prompts", {
      cache: "no-store",
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "Failed to load prompts");
    setGroups(payload.groups ?? {});
    return payload as { prompts: string[]; groups: PromptGroups };
  }

  async function loadPrompts() {
    setError(null);
    const payload = await fetchPromptData();
    setPromptText((payload.prompts ?? []).join("\n"));
    setNotice("Default QA prompts loaded.");
  }

  async function loadPromptGroup(key: string) {
    setError(null);
    const currentGroups = Object.keys(groups).length
      ? groups
      : (await fetchPromptData()).groups;
    const group = currentGroups[key] ?? [];
    setPromptText(group.join("\n"));
    setNotice(`${groupLabels[key] ?? key} prompts loaded.`);
  }

  async function callBatchApi(queries: string[]) {
    const res = await fetch("/api/admin/search-health/batch-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, delayMs, maxQueries, includeFullDebug }),
    });
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || "Batch QA failed");
    return payload as BatchResult;
  }

  async function runQueries(queries: string[], mode: "single" | "batch") {
    const cappedQueries = queries.slice(
      0,
      Math.min(Math.max(maxQueries || 1, 1), 100),
    );
    if (!cappedQueries.length) return;
    stopRequested.current = false;
    setNotice(null);
    setError(null);
    const runStartedAt = new Date();
    setStartedAt(runStartedAt);
    setElapsed(0);
    setProgress({
      current: 0,
      total: cappedQueries.length,
      query: cappedQueries[0] ?? "",
    });
    if (mode === "single") {
      setSingleRunning(true);
    } else {
      setRunning(true);
    }
    try {
      if (mode === "single") {
        const payload = await callBatchApi(cappedQueries);
        setSingleResult(payload);
        setProgress({
          current: payload.count,
          total: cappedQueries.length,
          query: "",
        });
        setNotice(`Single QA run complete (${payload.count} searches).`);
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

      for (const [index, query] of cappedQueries.entries()) {
        if (stopRequested.current) break;
        setProgress({ current: index + 1, total: cappedQueries.length, query });
        const payload = await callBatchApi([query]);
        const result = payload.results[0];
        const row = payload.summary[0];
        if (row) {
          const normalizedRow = { ...row, index };
          combined.summary.push(normalizedRow);
          combined.results.push(
            result
              ? { ...result, index, summary: normalizedRow }
              : { index, query, summary: normalizedRow },
          );
        }
        combined.count = combined.summary.length;
        combined.finishedAt = payload.finishedAt;
        setBatchResult({
          ...combined,
          summary: [...combined.summary],
          results: [...combined.results],
        });
        if (
          index < cappedQueries.length - 1 &&
          delayMs > 0 &&
          !stopRequested.current
        ) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, Math.min(Math.max(delayMs, 0), 5000)),
          );
        }
      }
      setNotice(`Batch QA run complete (${combined.count} searches).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch QA failed");
    } finally {
      if (mode === "single") {
        setSingleRunning(false);
      } else {
        setRunning(false);
      }
      setProgress((current) => ({ ...current, query: "" }));
    }
  }

  function resultFor(row: QaSummary) {
    return (
      batchResult?.results.find((item) => item.index === row.index)?.result ??
      row
    );
  }

  async function copyWithNotice(value: unknown, message = "Copied.") {
    const copied = await copyToClipboard(value);
    if (copied) {
      setNotice(message);
      setError(null);
    } else {
      setError(
        "Could not copy to clipboard. Please try selecting and copying manually.",
      );
    }
  }

  function exportCsv() {
    if (!batchResult) return;
    const csv = [
      csvColumns.join(","),
      ...batchResult.summary.map((row) =>
        csvColumns.map((key) => csvEscape(row[key])).join(","),
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
          <h2 className="mt-2 text-2xl font-black">
            Run search QA from the dashboard
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
            Batch QA runs real searches and may call LLM/API services. Use
            smaller groups when testing production.
          </p>
        </div>
        {process.env.NODE_ENV === "production" ? (
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">
            Production QA
          </span>
        ) : null}
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black"
              onClick={() =>
                setPromptText(
                  (current) =>
                    `${current}${current.trim() ? "\n" : ""}${singleQuery}`,
                )
              }
              disabled={!singleQuery.trim()}
            >
              Add to Batch
            </button>
            {singleResult?.results?.[0] ? (
              <button
                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black"
                onClick={() =>
                  setSelectedJson({
                    title: singleResult.results[0].query,
                    data:
                      singleResult.results[0].result ??
                      singleResult.results[0].summary,
                    summary: singleResult.results[0].summary,
                  })
                }
              >
                View JSON
              </button>
            ) : null}
            {singleResult?.results?.[0] ? (
              <button
                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black"
                onClick={() =>
                  void copyWithNotice(
                    singleResult.results[0].result ??
                      singleResult.results[0].summary,
                    "Result JSON copied.",
                  )
                }
              >
                Copy JSON
              </button>
            ) : null}
          </div>
          {singleResult?.summary?.[0] ? (
            <SummaryStrip row={singleResult.summary[0]} />
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="font-black">Batch Search QA</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-black"
              onClick={loadPrompts}
            >
              Load Default QA Prompts
            </button>
            {Object.keys(groupLabels).map((key) => (
              <button
                key={key}
                className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black"
                onClick={() => loadPromptGroup(key)}
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
              />{" "}
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
                  setNotice(
                    "Stop requested. Server-side run will stop after the current request in a future streaming runner; this request may still finish.",
                  );
                }}
              >
                Stop after current
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/65">
            Running {running ? progress.current : 0} /{" "}
            {progress.total || queryLines.length} · Current query:{" "}
            {running ? progress.query || "—" : "—"} · Started:{" "}
            {startedAt?.toLocaleTimeString() ?? "—"} · Elapsed:{" "}
            {Math.round(elapsed / 1000)}s
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
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
                void copyWithNotice(batchResult.summary, "Summary JSON copied.")
              }
            >
              Copy Summary JSON
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={() =>
                void copyWithNotice(batchResult, "All results JSON copied.")
              }
            >
              Copy All Results JSON
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={() =>
                void copyWithNotice(filteredSummary, "Filtered results copied.")
              }
            >
              Copy Filtered Results
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={() =>
                void copyWithNotice(
                  batchResult.summary.map((row) => row.query).join("\n"),
                  "All queries copied.",
                )
              }
            >
              Copy All Queries
            </button>
            <button
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black"
              onClick={() =>
                downloadFile(
                  "search-qa-summary.json",
                  JSON.stringify(batchResult.summary, null, 2),
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
                <p className="text-sm text-white/50">
                  No suspicious rows flagged.
                </p>
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
              <table className="w-full min-w-[1500px] text-left text-xs">
                <thead className="bg-white/[0.04] uppercase tracking-[0.16em] text-white/45">
                  <tr>
                    {[
                      "Query",
                      "Type",
                      "Domain",
                      "Restaurants",
                      "Activities",
                      "Pairs",
                      "Speed",
                      "Total ms",
                      "LLM ms",
                      "RPC ms",
                      "Parser",
                      "Fast Path",
                      "Flags",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className="px-3 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredSummary.map((row) => (
                    <tr key={row.index}>
                      <td className="max-w-[280px] px-3 py-3 font-semibold">
                        {row.query}
                      </td>
                      <td className="px-3 py-3">
                        {row.normalized_search_type ?? "—"}
                      </td>
                      <td className="px-3 py-3">{row.primary_domain ?? "—"}</td>
                      <td className="px-3 py-3">{row.restaurant_count}</td>
                      <td className="px-3 py-3">{row.activity_count}</td>
                      <td className="px-3 py-3">{row.pair_count}</td>
                      <td className="px-3 py-3">{row.speed_status ?? "—"}</td>
                      <td className="px-3 py-3">{row.timing_ms ?? "—"}</td>
                      <td className="px-3 py-3">{row.llm_ms ?? "—"}</td>
                      <td className="px-3 py-3">{row.rpc_ms ?? "—"}</td>
                      <td className="px-3 py-3">
                        {row.intentParserSource ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        {row.fastPathMatched
                          ? row.fastPathReason || "yes"
                          : "no"}
                      </td>
                      <td className="max-w-[220px] px-3 py-3 text-amber-100">
                        {row.suspiciousFlags.join(", ") || "—"}
                      </td>
                      <td className="space-x-2 whitespace-nowrap px-3 py-3">
                        <button
                          className="font-black text-rose-100"
                          onClick={() =>
                            setSelectedJson({
                              title: row.query,
                              data: resultFor(row),
                              summary: row,
                            })
                          }
                        >
                          View JSON
                        </button>
                        <button
                          className="font-black text-rose-100"
                          onClick={() =>
                            void copyWithNotice(
                              resultFor(row),
                              "Result JSON copied.",
                            )
                          }
                        >
                          Copy JSON
                        </button>
                        <button
                          className="font-black text-rose-100"
                          onClick={() =>
                            void copyWithNotice(row.query, "Query copied.")
                          }
                        >
                          Copy query
                        </button>
                        <button
                          className="font-black text-rose-100"
                          onClick={() => {
                            setSingleQuery(row.query);
                            runQueries([row.query], "single");
                          }}
                        >
                          Rerun single
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {selectedJson ? (
        <JsonModal
          title={selectedJson.title}
          data={selectedJson.data}
          summary={selectedJson.summary}
          onClose={() => setSelectedJson(null)}
          onCopy={(value) => copyWithNotice(value, "JSON copied.")}
        />
      ) : null}
    </section>
  );
}

function SummaryStrip({ row }: { row: QaSummary }) {
  return (
    <div className="rounded-2xl bg-black/30 p-3 text-sm">
      <div className="font-black">{row.query}</div>
      <div className="mt-1 text-white/55">
        {row.normalized_search_type ?? "—"} · {row.speed_status ?? "—"} ·{" "}
        {row.timing_ms ?? "—"}ms · R{row.restaurant_count}/A{row.activity_count}
        /P{row.pair_count}
      </div>
      {row.suspiciousFlags.length ? (
        <div className="mt-2 text-xs font-bold text-amber-100">
          {row.suspiciousFlags.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

function JsonModal({
  title,
  data,
  summary,
  onClose,
  onCopy,
}: {
  title: string;
  data: unknown;
  summary?: QaSummary;
  onClose: () => void;
  onCopy: (value: unknown) => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-6xl overflow-auto rounded-3xl border border-white/10 bg-[#120d0b] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">
              Full JSON Viewer
            </p>
            <h3 className="mt-2 text-2xl font-black">{title}</h3>
          </div>
          <button
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {summary ? <SummaryStrip row={summary} /> : null}
        <button
          className="mt-4 rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
          onClick={() => void onCopy(data)}
        >
          Copy JSON
        </button>
        <pre className="mt-4 overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-5 text-white/70">
          {JSON.stringify(data ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
