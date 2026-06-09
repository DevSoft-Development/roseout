"use client";

import { useMemo, useState } from "react";

type BackfillPayload = {
  ok?: boolean;
  dryRun?: boolean;
  scanned?: number;
  updated?: number;
  skipped?: number;
  topAddedTerms?: { term: string; count: number }[];
  errors?: string[];
  preview?: {
    id: string;
    name: string | null;
    table?: string;
    addedSearchKeywords?: string[];
    addedSemanticTags?: string[];
    addedIntentTags?: string[];
  }[];
  error?: string;
};

export default function FoodTermBackfillPanel() {
  const [result, setResult] = useState<BackfillPayload | null>(null);
  const [loading, setLoading] = useState<"preview" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topTerms = useMemo(
    () => (result?.topAddedTerms || []).slice(0, 12),
    [result?.topAddedTerms],
  );

  async function runBackfill(dryRun: boolean) {
    setLoading(dryRun ? "preview" : "run");
    setError(null);

    try {
      const response = await fetch("/api/admin/locations/backfill-food-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, limit: 100, locationType: "all", ids: [] }),
      });
      const payload = (await response.json()) as BackfillPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Food term backfill failed");
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Food term backfill failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mt-5 rounded-[1.5rem] border border-amber-300/25 bg-amber-500/10 p-4 text-white shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-200">
            Food Term Backfill
          </p>
          <h2 className="mt-1 text-xl font-black">Natural food search updater</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            Safely appends canonical food terms to search keywords, semantic tags,
            intent tags, and search documents without deleting existing location data.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runBackfill(true)}
            disabled={loading !== null}
            className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "preview" ? "Previewing…" : "Preview 100"}
          </button>
          <button
            type="button"
            onClick={() => runBackfill(false)}
            disabled={loading !== null}
            className="rounded-full bg-gradient-to-r from-amber-400 to-rose-500 px-5 py-3 text-sm font-black text-[#1b1210] shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "run" ? "Running…" : "Run Backfill"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/15 p-3 text-sm font-bold text-red-100">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.2fr]">
          <div className="grid grid-cols-3 gap-3 text-center sm:max-w-xl">
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-2xl font-black">{result.scanned ?? 0}</p>
              <p className="text-[10px] font-black uppercase tracking-wide text-white/45">Scanned</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-2xl font-black">{result.updated ?? 0}</p>
              <p className="text-[10px] font-black uppercase tracking-wide text-white/45">
                {result.dryRun ? "Would update" : "Updated"}
              </p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3">
              <p className="text-2xl font-black">{result.skipped ?? 0}</p>
              <p className="text-[10px] font-black uppercase tracking-wide text-white/45">Skipped</p>
            </div>
          </div>

          <div className="rounded-2xl bg-black/20 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-white/45">Top added terms</p>
            {topTerms.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {topTerms.map((item) => (
                  <span key={item.term} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
                    {item.term} × {item.count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">No new terms found in the last run.</p>
            )}
          </div>

          {result.errors?.length ? (
            <div className="xl:col-span-2 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100">
              <p className="font-black uppercase tracking-wide">Errors</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.errors.slice(0, 6).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
