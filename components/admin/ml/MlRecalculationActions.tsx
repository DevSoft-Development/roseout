"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = Record<string, any> | null;

function valueLine(label: string, value: any) {
  if (value == null) return null;
  return (
    <li>
      <span className="text-white/50">{label}:</span> <b>{String(value)}</b>
    </li>
  );
}

function ResultPanel({
  title,
  result,
  error,
}: {
  title: string;
  result: Result;
  error: string;
}) {
  if (!result && !error) return null;
  const d = result?.diagnostics || {};
  const p = result?.pairDiagnostics || d?.pairDiagnostics || {};
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/75">
      <p className="font-black text-white">{title}</p>
      {error ? <p className="mt-2 text-rose-200">{error}</p> : null}
      {result ? (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {valueLine("success", result.success)}
          {valueLine(
            "processed",
            result.processed ?? result.processedLocationIntents,
          )}
          {valueLine(
            "updated",
            result.updated ?? result.updatedLocationIntents,
          )}
          {valueLine("processedPairs", result.processedPairs)}
          {valueLine("updatedPairs", result.updatedPairs)}
          {valueLine(
            "errors",
            Array.isArray(result.errors) ? result.errors.length : result.errors,
          )}
          {valueLine(
            "score_version",
            result.score_version ?? result.scoreVersion,
          )}
          {valueLine("recommendation", d.recommendation)}
          {valueLine(
            "searchEventsWithMlResultIds",
            d.searchEventsWithMlResultIds,
          )}
          {valueLine("searchEventsWithMlPairIds", d.searchEventsWithMlPairIds)}
          {valueLine(
            "analyticsEventsWithLocationId",
            d.analyticsEventsWithLocationId,
          )}
          {valueLine(
            "candidateLocationRows",
            d.candidateLocationRows ?? d.candidateLocationIntentRows,
          )}
          {valueLine("candidatePairRows", d.candidatePairRows)}
          {valueLine(
            "sample_top_scores",
            Array.isArray(result.sample_top_scores)
              ? result.sample_top_scores.length
              : Array.isArray(result.sampleTopLocationIntentScores)
                ? result.sampleTopLocationIntentScores.length
                : null,
          )}
          {valueLine("validMlPairsExtracted", p.validMlPairsExtracted)}
          {valueLine("upsertPairRows", p.upsertPairRows)}
        </ul>
      ) : null}
    </div>
  );
}

async function postJson(url: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Expected JSON but received ${text.slice(0, 120) || "empty response"}`,
    );
  }
  if (!res.ok)
    throw new Error(
      data?.error || data?.message || `Request failed with HTTP ${res.status}`,
    );
  return data;
}

export function MlRecalculationActions() {
  const router = useRouter();
  const [phase1Loading, setPhase1Loading] = useState(false);
  const [phase2Loading, setPhase2Loading] = useState(false);
  const [phase1Result, setPhase1Result] = useState<Result>(null);
  const [phase2Result, setPhase2Result] = useState<Result>(null);
  const [phase1Error, setPhase1Error] = useState("");
  const [phase2Error, setPhase2Error] = useState("");

  async function run(which: 1 | 2) {
    const setLoading = which === 1 ? setPhase1Loading : setPhase2Loading;
    const setResult = which === 1 ? setPhase1Result : setPhase2Result;
    const setError = which === 1 ? setPhase1Error : setPhase2Error;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await postJson(
        which === 1
          ? "/api/admin/ml/recalculate-location-scores"
          : "/api/admin/ml/recalculate-phase2",
      );
      setResult(data);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(1)}
          disabled={phase1Loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase1Loading ? "Running Phase 1..." : "Run Phase 1 recalculation"}
        </button>
        <button
          type="button"
          onClick={() => run(2)}
          disabled={phase2Loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase2Loading ? "Running Phase 2..." : "Run Phase 2 scoring"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/10"
        >
          Refresh dashboard data
        </button>
      </div>
      <ResultPanel
        title="Phase 1 result"
        result={phase1Result}
        error={phase1Error}
      />
      <ResultPanel
        title="Phase 2 result"
        result={phase2Result}
        error={phase2Error}
      />
    </div>
  );
}
