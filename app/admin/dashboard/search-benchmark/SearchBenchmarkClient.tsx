"use client";

import { useEffect, useMemo, useState } from "react";

type BenchmarkData = {
  queries: Array<any>;
  labels: Array<any>;
  candidates: Array<any>;
  latest_run: any;
  scorecards: Array<any>;
};

const VIOLATIONS = [
  "wrong_domain",
  "wrong_market",
  "too_far",
  "closed_or_unavailable",
  "bad_pair",
  "duplicate",
  "unsafe_or_unpublishable",
];

export default function SearchBenchmarkClient() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/search-benchmark/labels", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not load benchmark");
    setData(payload);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  const labels = useMemo(
    () =>
      new Map(
        (data?.labels ?? []).map((label) => [
          `${label.query_id}:${label.result_key}`,
          label,
        ]),
      ),
    [data],
  );

  const candidatesByQuery = useMemo(() => {
    const map = new Map<string, Array<any>>();
    for (const candidate of data?.candidates ?? []) {
      const rows = map.get(candidate.query_id) ?? [];
      rows.push(candidate);
      map.set(candidate.query_id, rows);
    }
    return map;
  }, [data]);

  async function runBenchmark() {
    setBusy(true);
    setMessage("Running benchmark…");
    try {
      const response = await fetch("/api/admin/search-benchmark/run", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Benchmark failed");
      setMessage(
        payload.release_gate_passed
          ? "Benchmark passed the release gate."
          : "Benchmark completed, but the release gate remains blocked.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Benchmark failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel(
    queryId: string,
    resultKey: string,
    grade: number,
    violations: string[],
  ) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/search-benchmark/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_id: queryId,
          result_key: resultKey,
          relevance_grade: grade,
          violation_codes: violations,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Label save failed");
      await load();
      setMessage("Label saved. Rerun the benchmark to refresh scores.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Label save failed");
    } finally {
      setBusy(false);
    }
  }

  const latestScorecard = data?.scorecards?.[0];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white">Release gate</h2>
            <p className="mt-1 text-sm text-white/60">
              Live ranking stays unchanged. This compares control and shadow quality only.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={runBenchmark}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Run benchmark"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Gate" value={latestScorecard?.release_gate_passed ? "Passed" : "Blocked"} />
          <Metric label="Control P@3" value={percent(latestScorecard?.control_precision_at_3)} />
          <Metric label="Shadow P@3" value={percent(latestScorecard?.shadow_precision_at_3)} />
          <Metric label="Score delta" value={number(latestScorecard?.score_delta)} />
        </div>
      </div>

      {(data?.queries ?? []).map((query) => {
        const candidates = candidatesByQuery.get(query.id) ?? [];
        return (
          <section
            key={query.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-widest text-rose-300">
                {query.expected_result_type} · {query.expected_market || "Any market"}
              </div>
              <h3 className="mt-1 text-lg font-black text-white">{query.query_text}</h3>
            </div>

            {candidates.length === 0 ? (
              <p className="text-sm text-white/50">
                Run the benchmark to generate candidates for labeling.
              </p>
            ) : (
              <div className="space-y-3">
                {candidates.map((candidate) => {
                  const key = `${query.id}:${candidate.result_key}`;
                  const current = labels.get(key);
                  return (
                    <LabelRow
                      key={candidate.result_key}
                      queryId={query.id}
                      candidate={candidate}
                      current={current}
                      disabled={busy}
                      onSave={saveLabel}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LabelRow({ queryId, candidate, current, disabled, onSave }: any) {
  const [grade, setGrade] = useState(Number(current?.relevance_grade ?? 0));
  const [violations, setViolations] = useState<string[]>(current?.violation_codes ?? []);

  useEffect(() => {
    setGrade(Number(current?.relevance_grade ?? 0));
    setViolations(current?.violation_codes ?? []);
  }, [current]);

  function toggle(code: string) {
    setViolations((values) =>
      values.includes(code) ? values.filter((value) => value !== code) : [...values, code],
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">
            #{candidate.rank} {candidate.metadata?.name || candidate.result_key}
          </div>
          <div className="mt-1 text-xs text-white/40">{candidate.result_key}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white"
          >
            <option value={0}>0 — Irrelevant</option>
            <option value={1}>1 — Partial</option>
            <option value={2}>2 — Relevant</option>
            <option value={3}>3 — Ideal</option>
          </select>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSave(queryId, candidate.result_key, grade, violations)}
            className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm font-bold text-rose-100 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {VIOLATIONS.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className={`rounded-full px-3 py-1 text-xs ${
              violations.includes(code)
                ? "bg-rose-600 text-white"
                : "bg-white/5 text-white/60"
            }`}
          >
            {code.replaceAll("_", " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function percent(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${(numberValue * 100).toFixed(1)}%` : "—";
}

function number(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(3) : "—";
}
