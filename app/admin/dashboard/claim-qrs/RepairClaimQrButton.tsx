"use client";

import { useEffect, useMemo, useState } from "react";

type RepairJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "dead_letter";
  attemptCount: number;
  maxAttempts: number;
  progressCurrent: number;
  progressTotal: number | null;
  checkpoint?: Record<string, unknown>;
  result?: Record<string, unknown>;
  lastError?: string | null;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  reused?: boolean;
  job?: RepairJob;
};

type RepairStats = {
  table?: string;
  scanned: number;
  total: number;
  updated: number;
  repairedLegacyUrls: number;
  regeneratedQrs: number;
  locationsSynced: number;
  errors: number;
};

const emptyStats: RepairStats = {
  scanned: 0,
  total: 0,
  updated: 0,
  repairedLegacyUrls: 0,
  regeneratedQrs: 0,
  locationsSynced: 0,
  errors: 0,
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statsFromJob(job: RepairJob | null): RepairStats {
  if (!job) return emptyStats;
  const source = (job.checkpoint && Object.keys(job.checkpoint).length ? job.checkpoint : job.result) || {};
  return {
    table: typeof source.table === "string" ? source.table : undefined,
    scanned: numberValue(source.scanned ?? job.progressCurrent),
    total: numberValue(source.total ?? job.progressTotal),
    updated: numberValue(source.updated),
    repairedLegacyUrls: numberValue(source.repairedLegacyUrls),
    regeneratedQrs: numberValue(source.regeneratedQrs),
    locationsSynced: numberValue(source.locationsSynced),
    errors: numberValue(source.errors),
  };
}

export default function RepairClaimQrButton() {
  const [job, setJob] = useState<RepairJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => statsFromJob(job), [job]);
  const percent = useMemo(() => {
    if (job?.status === "succeeded") return 100;
    if (!stats.total) return 0;
    return Math.min(99, Math.round((stats.scanned / stats.total) * 100));
  }, [job?.status, stats.scanned, stats.total]);

  const active = job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!job?.id || !active) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/admin/locations/backfill-qr?jobId=${encodeURIComponent(job.id)}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as ApiResponse;
        if (!response.ok || !json.ok || !json.job) {
          throw new Error(json.error || `Unable to read repair status (${response.status}).`);
        }
        if (!cancelled) {
          setJob(json.job);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to read repair status.");
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, job?.id]);

  async function startRepair() {
    setStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/locations/backfill-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "edge-worker" }),
      });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok || !json.job) {
        throw new Error(json.error || `Unable to start repair (${response.status}).`);
      }
      setJob(json.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start claim QR repair.");
    } finally {
      setStarting(false);
    }
  }

  const statusLabel = !job
    ? "Ready"
    : job.status === "queued"
      ? stats.scanned > 0
        ? "Continuing next repair pass"
        : "Queued for repair"
      : job.status === "running"
        ? "Repair in progress"
        : job.status === "succeeded"
          ? "Complete"
          : job.status === "dead_letter"
            ? "Stopped after repeated failures"
            : job.status === "cancelled"
              ? "Cancelled"
              : "Failed";

  return (
    <div className="space-y-4">
      <button
        onClick={startRepair}
        disabled={starting || active}
        className="rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {starting ? "Starting repair..." : active ? "Repair running..." : "Repair old legacy QR codes"}
      </button>

      {(job || error) && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-white/75">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Status</p>
              <p className="text-sm font-black text-white">{statusLabel}</p>
              {stats.table && active && (
                <p className="text-white/55">Working on {stats.table}</p>
              )}
            </div>
            <p className="text-lg font-black text-white">{percent}%</p>
          </div>

          <div
            className="h-3 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Claim QR repair progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-rose-300 transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex flex-wrap justify-between gap-2 text-white/55">
            <span>
              {stats.total > 0
                ? `${Math.min(stats.scanned, stats.total).toLocaleString()} of ${stats.total.toLocaleString()} records checked`
                : active
                  ? "Preparing record totals..."
                  : "No records processed yet"}
            </span>
            {job && active && <span>Worker pass {Math.max(job.attemptCount, 1)}</span>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <p>Scanned: <span className="font-black text-white">{stats.scanned.toLocaleString()}</span></p>
            <p>Updated: <span className="font-black text-white">{stats.updated.toLocaleString()}</span></p>
            <p>Legacy URLs repaired: <span className="font-black text-white">{stats.repairedLegacyUrls.toLocaleString()}</span></p>
            <p>QR images regenerated: <span className="font-black text-white">{stats.regeneratedQrs.toLocaleString()}</span></p>
            <p>Locations synced: <span className="font-black text-white">{stats.locationsSynced.toLocaleString()}</span></p>
            <p>Record errors: <span className="font-black text-white">{stats.errors.toLocaleString()}</span></p>
          </div>

          {job?.status === "succeeded" && (
            <p className="font-black text-emerald-200">
              Repair complete. Healthy QR codes were left alone; only missing or legacy claim records were repaired.
            </p>
          )}

          {(job?.status === "failed" || job?.status === "dead_letter") && job.lastError && (
            <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 font-bold text-rose-100">
              {job.lastError}
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 font-bold text-amber-100">
              {error} The background repair job is not cancelled; this page will keep trying to read its status.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
