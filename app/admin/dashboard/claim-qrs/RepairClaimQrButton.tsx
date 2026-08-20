"use client";

import { useMemo, useState } from "react";

type RepairTable = "restaurants" | "activities" | "locations";

type BatchResponse = {
  ok?: boolean;
  error?: string;
  result?: BatchResult;
};

type BatchResult = {
  table: RepairTable;
  offset: number;
  batchSize: number;
  scanned: number;
  total: number;
  nextOffset: number;
  done: boolean;
  updated: number;
  repairedLegacyUrls: number;
  regeneratedQrs: number;
  locationsSynced: number;
  errors: Array<{ id: string | number; error: string }>;
};

const TABLES: RepairTable[] = ["restaurants", "activities", "locations"];
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 45_000;

const TABLE_LABELS: Record<RepairTable, string> = {
  restaurants: "Restaurants",
  activities: "Activities",
  locations: "Locations",
};

export default function RepairClaimQrButton() {
  const [loading, setLoading] = useState(false);
  const [currentTable, setCurrentTable] = useState<RepairTable | null>(null);
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [currentTableScanned, setCurrentTableScanned] = useState(0);
  const [currentTableTotal, setCurrentTableTotal] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [progress, setProgress] = useState({
    scanned: 0,
    updated: 0,
    repairedLegacyUrls: 0,
    regeneratedQrs: 0,
    locationsSynced: 0,
    errors: 0,
  });
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const currentTablePercent = useMemo(() => {
    if (currentTableTotal <= 0) return 0;
    return Math.min(100, Math.round((currentTableScanned / currentTableTotal) * 100));
  }, [currentTableScanned, currentTableTotal]);

  const overallPercent = useMemo(() => {
    if (complete) return 100;
    if (!loading) return 0;

    const phaseProgress = currentTableTotal > 0 ? currentTableScanned / currentTableTotal : 0;
    return Math.min(99, Math.round(((currentTableIndex + phaseProgress) / TABLES.length) * 100));
  }, [complete, currentTableIndex, currentTableScanned, currentTableTotal, loading]);

  async function runBatch(table: RepairTable, offset: number) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      setRetryAttempt(attempt > 1 ? attempt : 0);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch("/api/admin/locations/backfill-qr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "batch",
            table,
            offset,
            batchSize: BATCH_SIZE,
            forceCanonicalUrl: false,
            regenerateQr: false,
          }),
          signal: controller.signal,
        });

        let json: BatchResponse | null = null;

        try {
          json = (await res.json()) as BatchResponse;
        } catch {
          throw new Error(`Repair request returned an unreadable response (${res.status}).`);
        }

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Claim QR repair failed (${res.status}).`);
        }

        if (!json.result) {
          throw new Error("Claim QR repair response was missing batch results.");
        }

        setRetryAttempt(0);
        return json.result;
      } catch (err) {
        lastError = err;

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => window.setTimeout(resolve, 750 * attempt));
          continue;
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    setRetryAttempt(0);

    if (lastError instanceof DOMException && lastError.name === "AbortError") {
      throw new Error("This repair batch timed out after 45 seconds. No further batches were started.");
    }

    throw lastError instanceof Error
      ? new Error(`${lastError.message} The same batch was retried ${MAX_ATTEMPTS} times.`)
      : new Error("Claim QR repair failed after multiple attempts.");
  }

  async function runRepair() {
    setLoading(true);
    setComplete(false);
    setError(null);
    setLastResult(null);
    setCurrentTableIndex(0);
    setCurrentTableScanned(0);
    setCurrentTableTotal(0);
    setRetryAttempt(0);
    setProgress({
      scanned: 0,
      updated: 0,
      repairedLegacyUrls: 0,
      regeneratedQrs: 0,
      locationsSynced: 0,
      errors: 0,
    });

    try {
      for (let index = 0; index < TABLES.length; index += 1) {
        const table = TABLES[index];
        setCurrentTable(table);
        setCurrentTableIndex(index);
        setCurrentTableScanned(0);
        setCurrentTableTotal(0);

        let offset = 0;
        let done = false;

        while (!done) {
          const result = await runBatch(table, offset);
          setLastResult(result);
          setCurrentTableScanned(result.nextOffset);
          setCurrentTableTotal(result.total);

          setProgress((prev) => ({
            scanned: prev.scanned + result.scanned,
            updated: prev.updated + result.updated,
            repairedLegacyUrls: prev.repairedLegacyUrls + result.repairedLegacyUrls,
            regeneratedQrs: prev.regeneratedQrs + result.regeneratedQrs,
            locationsSynced: prev.locationsSynced + result.locationsSynced,
            errors: prev.errors + (result.errors?.length || 0),
          }));

          done = result.done;
          offset = result.nextOffset;

          if (result.scanned === 0) {
            done = true;
          }
        }
      }

      setComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim QR repair failed.");
    } finally {
      setLoading(false);
      setCurrentTable(null);
      setRetryAttempt(0);
    }
  }

  const statusLabel = complete
    ? "Complete"
    : error
      ? "Failed"
      : loading
        ? retryAttempt > 1
          ? `Retrying batch (${retryAttempt}/${MAX_ATTEMPTS})`
          : "Repair in progress"
        : "Ready";

  return (
    <div className="space-y-4">
      <button
        onClick={runRepair}
        disabled={loading}
        className="rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Repairing claim QR codes..." : "Repair old legacy QR codes"}
      </button>

      {(loading || complete || lastResult || error) && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-white/75">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Status</p>
              <p className="text-sm font-black text-white">{statusLabel}</p>
            </div>
            <p className="text-lg font-black text-white">{overallPercent}%</p>
          </div>

          <div
            className="h-3 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Claim QR repair progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallPercent}
          >
            <div
              className="h-full rounded-full bg-rose-300 transition-[width] duration-300"
              style={{ width: `${overallPercent}%` }}
            />
          </div>

          {loading && currentTable && (
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-white">
                  {TABLE_LABELS[currentTable]} · step {currentTableIndex + 1} of {TABLES.length}
                </p>
                <p>
                  {currentTableTotal > 0
                    ? `${Math.min(currentTableScanned, currentTableTotal)} / ${currentTableTotal}`
                    : "Preparing..."}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/70 transition-[width] duration-300"
                  style={{ width: `${currentTablePercent}%` }}
                />
              </div>
              {retryAttempt > 1 && (
                <p className="mt-2 font-bold text-amber-200">
                  Network request failed. Retrying this same batch automatically ({retryAttempt}/{MAX_ATTEMPTS}).
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <p>Scanned: <span className="font-black text-white">{progress.scanned}</span></p>
            <p>Updated: <span className="font-black text-white">{progress.updated}</span></p>
            <p>Legacy URLs repaired: <span className="font-black text-white">{progress.repairedLegacyUrls}</span></p>
            <p>QR images regenerated: <span className="font-black text-white">{progress.regeneratedQrs}</span></p>
            <p>Locations synced: <span className="font-black text-white">{progress.locationsSynced}</span></p>
            <p>Record errors: <span className="font-black text-white">{progress.errors}</span></p>
          </div>

          {lastResult && !complete && !error && (
            <p className="text-white/55">
              Last batch: {TABLE_LABELS[lastResult.table]} · scanned {lastResult.scanned} · next record {lastResult.nextOffset}
            </p>
          )}

          {complete && (
            <p className="font-black text-emerald-200">
              Repair complete. Only missing or legacy claim QR records were changed; healthy QR codes were left alone.
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 font-bold text-rose-100">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
