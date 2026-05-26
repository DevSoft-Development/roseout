"use client";

import { useState } from "react";

type CleanupTable = "both" | "restaurants" | "activities";

type CleanupResult = {
  success?: boolean;
  table?: CleanupTable;
  limit?: number;
  offset?: number;
  checked?: number;
  clean?: number;
  needsReview?: number;
  missingImage?: number;
  missingCategory?: number;
  missingCoordinates?: number;
  missingAddress?: number;
  nextOffset?: number | null;
  error?: string;
  results?: Array<{
    table: string;
    checked: number;
    clean: number;
    needsReview: number;
    missingImage: number;
    missingCategory: number;
    missingCoordinates: number;
    missingAddress: number;
    nextOffset: number | null;
    errors?: Array<{ id: string | number; message: string }>;
  }>;
};

const cleanupLabels: Record<CleanupTable, string> = {
  both: "Run Cleanup",
  restaurants: "Run restaurants cleanup",
  activities: "Run activities cleanup",
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

export default function CleanupActions() {
  const [loadingTable, setLoadingTable] = useState<CleanupTable | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const runCleanup = async (table: CleanupTable) => {
    setLoadingTable(table);
    setResult(null);

    try {
      const response = await fetch(
        `/api/admin/cleanup-locations?table=${table}&limit=25&offset=0`,
      );
      const data = (await response.json()) as CleanupResult;

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed.",
      });
    } finally {
      setLoadingTable(null);
    }
  };

  return (
    <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-300">
            Data repair
          </p>
          <h2 className="mt-2 text-xl font-black text-white">
            Refresh quality metadata
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Re-checks the next 25 records and updates searchable flags, data
            status, missing fields, quality score, and last quality check time.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {(["both", "restaurants", "activities"] as CleanupTable[]).map(
            (table) => (
              <button
                key={table}
                type="button"
                onClick={() => runCleanup(table)}
                disabled={loadingTable !== null}
                className={`rounded-full px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  table === "both"
                    ? "bg-gradient-to-r from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-950/30 hover:scale-[1.02]"
                    : "border border-white/10 bg-white/[0.07] text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {loadingTable === table ? "Running..." : cleanupLabels[table]}
              </button>
            ),
          )}
        </div>
      </div>

      {result && (
        <div
          className={`mt-5 rounded-3xl border p-4 ${
            result.success
              ? "border-[#d9bd7c]/25 bg-[#d9bd7c]/10 text-[#fff4d6]"
              : "border-rose-400/25 bg-rose-500/10 text-rose-50"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-black">
              {result.success ? "Cleanup complete" : "Cleanup failed"}
            </p>
            {result.error && <p className="text-sm font-bold">{result.error}</p>}
          </div>

          {result.success && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {[
                  ["Checked", result.checked],
                  ["Search ready", result.clean],
                  ["Needs review", result.needsReview],
                  ["Missing image", result.missingImage],
                  ["Missing category", result.missingCategory],
                  ["Missing coordinates", result.missingCoordinates],
                  ["Missing address", result.missingAddress],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl border border-white/10 bg-black/20 p-3"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-black text-white">
                      {formatNumber(value as number | undefined)}
                    </p>
                  </div>
                ))}
              </div>

              {Array.isArray(result.results) && result.results.length > 0 && (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {result.results.map((tableResult) => (
                    <div
                      key={tableResult.table}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                        {tableResult.table}
                      </p>
                      <p className="mt-2 text-sm font-bold text-white/70">
                        Checked {formatNumber(tableResult.checked)} · Search ready {formatNumber(tableResult.clean)} · Needs review {formatNumber(tableResult.needsReview)}
                      </p>
                      {tableResult.errors && tableResult.errors.length > 0 && (
                        <p className="mt-2 text-xs font-bold text-rose-100">
                          {tableResult.errors.length} row update error(s). First:
                          {" "}
                          {tableResult.errors[0]?.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
