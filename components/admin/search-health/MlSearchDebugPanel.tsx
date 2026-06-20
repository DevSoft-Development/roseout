"use client";

import { useState } from "react";

type MlResultDebug = Record<string, any>;
type MlSearchDebug = Record<string, any> & { results?: MlResultDebug[] };

function value(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function rankDeltaClass(delta: number) {
  if (delta > 0)
    return "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/30";
  if (delta < 0) return "bg-red-500/20 text-red-100 ring-1 ring-red-300/30";
  return "bg-white/[.06] text-white/70";
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export default function MlSearchDebugPanel({
  mlDebug,
  title = "ML ranking impact",
}: {
  mlDebug?: MlSearchDebug | null;
  title?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const debug = mlDebug && typeof mlDebug === "object" ? mlDebug : null;
  const rows = Array.isArray(debug?.results) ? debug.results : [];
  const intent = debug?.intentClassification;

  async function copy(key: string, payload: unknown) {
    await copyText(
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
    );
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  }

  if (!debug) {
    return (
      <section className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-5 text-amber-50">
        <h3 className="font-black">{title}</h3>
        <p className="mt-2 text-sm font-semibold">
          ML debug unavailable. Confirm Phase 1/Phase 2 migrations are applied
          and recalculation routes have run.
        </p>
      </section>
    );
  }

  const noScores =
    rows.length > 0 && Number(debug.resultsWithMlBoostCount ?? 0) === 0;

  return (
    <section className="mt-5 space-y-4 rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
            Admin only
          </p>
          <h3 className="mt-1 text-xl font-black">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => copy("all-ml", debug)}
          className="rounded-full border border-white/15 bg-white/[.06] px-3 py-2 text-xs font-black text-white/80"
        >
          {copied === "all-ml" ? "Copied" : "Copy all ML debug for this prompt"}
        </button>
      </div>

      {intent ? (
        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <h4 className="font-black">Intent Detection</h4>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {[
              ["Primary intent", intent.primaryIntent],
              ["Secondary intents", intent.secondaryIntents],
              ["All intents", intent.allIntents],
              ["Inferred search mode", intent.inferredSearchMode],
              ["Confidence", intent.confidence],
              ["Reason", intent.reason],
            ].map(([label, field]) => (
              <div key={String(label)} className="rounded-xl bg-black/25 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                  {String(label)}
                </p>
                <p className="mt-1 break-words text-sm font-bold text-white/85">
                  {value(field)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
        <h4 className="font-black">ML Impact Summary</h4>
        {debug.mlUnavailableReason ? (
          <p className="mt-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
            {debug.mlUnavailableReason}
          </p>
        ) : null}
        {noScores ? (
          <p className="mt-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
            Intent detected, but no ML scores matched these results yet.
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {[
            ["ML enabled", debug.mlEnabled],
            ["Phase 1 available", debug.phase1Enabled],
            ["Phase 2 available", debug.phase2Enabled],
            ["Results with ML boost", debug.resultsWithMlBoostCount],
            ["Order changed", debug.resultOrderChangedByMl],
            ["Max ML boost", debug.maxMlBoostApplied],
            ["Average ML boost", debug.averageMlBoostApplied],
            ["Ranking buckets", debug.rankingIntentBuckets],
          ].map(([label, field]) => (
            <div key={String(label)} className="rounded-xl bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                {String(label)}
              </p>
              <p className="mt-1 break-words text-sm font-bold text-white/85">
                {value(field)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="flex items-center justify-between gap-3 bg-white/[.04] p-4">
          <h4 className="font-black">ML Ranking table</h4>
          <button
            type="button"
            onClick={() => copy("raw", debug)}
            className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-black text-white/80"
          >
            {copied === "raw" ? "Copied" : "Copy raw JSON"}
          </button>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-xs">
              <thead className="bg-black/30 text-white/50">
                <tr>
                  {[
                    "Final Rank",
                    "Base Rank",
                    "Rank Δ",
                    "Location",
                    "Type",
                    "Market",
                    "Base Score",
                    "Phase 1 Boost",
                    "Intent Boost",
                    "Pair Boost",
                    "Total ML Boost",
                    "Final Score",
                    "Matched Intent",
                    "Debug Reason",
                    "Copy",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-black">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row, index) => {
                  const delta = Number(row.rankDelta ?? 0);
                  return (
                    <tr
                      key={`${row.id}-${index}`}
                      className="bg-white/[.02] align-top"
                    >
                      <td className="px-3 py-2 font-black">
                        {value(row.finalRank)}
                      </td>
                      <td className="px-3 py-2">{value(row.baseRank)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-1 font-black ${rankDeltaClass(delta)}`}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold">{value(row.name)}</td>
                      <td className="px-3 py-2">{value(row.location_type)}</td>
                      <td className="px-3 py-2">{value(row.market)}</td>
                      <td className="px-3 py-2">{value(row.baseScore)}</td>
                      <td className="px-3 py-2">{value(row.phase1MlBoost)}</td>
                      <td className="px-3 py-2">
                        {value(row.phase2IntentBoost)}
                      </td>
                      <td className="px-3 py-2">
                        {value(row.phase2PairBoost)}
                      </td>
                      <td className="px-3 py-2 font-black">
                        {value(row.totalMlBoost)}
                      </td>
                      <td className="px-3 py-2">{value(row.finalScore)}</td>
                      <td className="px-3 py-2">
                        {value(row.matchedIntentBucket)}
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        {value(row.mlDebugReason)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => copy(`row-${index}`, row)}
                          className="rounded-full border border-white/15 px-2 py-1 font-black text-white/70"
                        >
                          {copied === `row-${index}`
                            ? "Copied"
                            : "Copy this result debug"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm font-semibold text-white/65">
            ML tables are ready, but no scoring data exists yet. Run Phase
            1/Phase 2 recalculation, then test again.
          </p>
        )}
      </div>
    </section>
  );
}
