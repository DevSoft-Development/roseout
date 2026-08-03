"use client";

import { useState } from "react";

type ReplayItem = {
  id: string;
  run_id: string;
  query: string;
  passed: boolean;
  comparison: Record<string, unknown> | null;
  expectations: Record<string, unknown> | null;
  legacy_result: Record<string, unknown> | null;
  canonical_result: Record<string, unknown> | null;
};

type ReplayRun = {
  id: string;
  source: string;
  status: string;
  query_count: number;
  passed_count: number;
  failed_count: number;
  metrics: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  success_rate: number;
  items: ReplayItem[];
};

function failureReasons(item: ReplayItem) {
  const reasons = item.comparison?.reasons;
  return Array.isArray(reasons) ? reasons.map(String) : [];
}

function copyPayload(run: ReplayRun, failuresOnly: boolean) {
  const selectedItems = failuresOnly ? run.items.filter((item) => !item.passed) : run.items;
  return {
    run: {
      id: run.id,
      source: run.source,
      status: run.status,
      createdAt: run.created_at,
      completedAt: run.completed_at,
      queryCount: run.query_count,
      passedCount: run.passed_count,
      failedCount: run.failed_count,
      successRate: run.success_rate,
      metrics: run.metrics,
    },
    results: selectedItems.map((item) => ({
      query: item.query,
      passed: item.passed,
      reasons: failureReasons(item),
      comparison: item.comparison,
      expectations: item.expectations,
      legacyResult: item.legacy_result,
      canonicalResult: item.canonical_result,
    })),
  };
}

export default function ReplayHistoryClient({ runs }: { runs: ReplayRun[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(run: ReplayRun, failuresOnly: boolean) {
    const key = `${run.id}:${failuresOnly ? "failures" : "results"}`;
    const text = JSON.stringify(copyPayload(run, failuresOnly), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
    } catch {
      setCopied(null);
      alert("Copy failed. Your browser may be blocking clipboard access.");
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Replay history</h2>
          <p className="mt-1 text-sm text-white/50">Copy a complete replay or only its failed queries, including persisted reasons and comparison details.</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase text-white/40">
            <tr><th className="py-3">Created</th><th>Source</th><th>Status</th><th>Queries</th><th>Passed</th><th>Failed</th><th>Success</th><th>Results</th></tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const failureKey = `${run.id}:failures`;
              const resultKey = `${run.id}:results`;
              return (
                <tr key={run.id} className="border-t border-white/10 align-top">
                  <td className="py-4">{new Date(run.created_at).toLocaleString()}</td>
                  <td>{run.source}</td>
                  <td>{run.status}</td>
                  <td>{run.query_count}</td>
                  <td>{run.passed_count}</td>
                  <td>{run.failed_count}</td>
                  <td>{run.success_rate.toFixed(1)}%</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!run.items.length}
                        onClick={() => copy(run, false)}
                        className="rounded-full border border-white/15 px-3 py-2 text-xs font-black text-white/80 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {copied === resultKey ? "Copied results" : "Copy results"}
                      </button>
                      <button
                        type="button"
                        disabled={!run.failed_count || !run.items.some((item) => !item.passed)}
                        onClick={() => copy(run, true)}
                        className="rounded-full border border-rose-300/25 px-3 py-2 text-xs font-black text-rose-100 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {copied === failureKey ? "Copied failures" : `Copy failures (${run.failed_count})`}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!runs.length ? <tr><td colSpan={8} className="py-6 text-white/50">No replay runs yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
