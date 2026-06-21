"use client";

import { useState } from "react";
import { AdminSectionCard, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";

type Result = {
  success?: boolean;
  requestedLimit?: number;
  processed?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  retryLater?: number;
  repaired?: number;
  repairSkipped?: number;
  durationMs?: number;
  error?: string;
};

export default function HoursBackfillPanel({ missingCount, staleCount }: { missingCount?: number | null; staleCount?: number | null }) {
  const [running, setRunning] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(limit: number, repairOperatingHours = false) {
    setRunning(repairOperatingHours ? -limit : limit);
    setResult(null);
    try {
      const response = await fetch("/api/admin/locations/backfill-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, repairOperatingHours }),
      });
      const json = await response.json().catch(() => ({}));
      setResult(json);
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(null);
    }
  }

  return (
    <AdminSectionCard className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-200">Hours Backfill</p>
          <h2 className="mt-2 text-xl font-black text-white">Google Places hours maintenance</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Safely backfill structured Google Places opening hours for searchable unified locations. Search keeps unknown hours eligible while this backfill improves late-night ranking over time.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminStatusBadge tone="muted">Missing: {missingCount ?? "—"}</AdminStatusBadge>
            <AdminStatusBadge tone="muted">Stale: {staleCount ?? "—"}</AdminStatusBadge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run(25)} disabled={running !== null} className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white/70 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50">{running === 25 ? "Running 25…" : "Run 25"}</button>
          <button type="button" onClick={() => run(100)} disabled={running !== null} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">{running === 100 ? "Running 100…" : "Run 100"}</button>
          <button type="button" onClick={() => run(100, true)} disabled={running !== null} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50">{running === -100 ? "Repairing 100…" : "Repair app hours"}</button>
        </div>
      </div>
      {result && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
          <p className="font-black text-white">Result: {result.success ? "success" : "needs attention"}</p>
          {result.error ? <p className="mt-2 text-rose-200">{result.error}</p> : (
            <p className="mt-2">Requested {result.requestedLimit}; processed {result.processed}; updated {result.updated}; skipped {result.skipped}; failed {result.failed}; retry later {result.retryLater}; repaired {result.repaired ?? 0}; repair skipped {result.repairSkipped ?? 0}; duration {result.durationMs}ms.</p>
          )}
        </div>
      )}
    </AdminSectionCard>
  );
}
