"use client";

import { useState } from "react";

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
const BATCH_SIZE = 100;

export default function RepairClaimQrButton() {
  const [loading, setLoading] = useState(false);
  const [currentTable, setCurrentTable] = useState<RepairTable | null>(null);
  const [progress, setProgress] = useState({
    scanned: 0,
    total: 0,
    updated: 0,
    repairedLegacyUrls: 0,
    regeneratedQrs: 0,
    locationsSynced: 0,
    errors: 0,
  });
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function runBatch(table: RepairTable, offset: number) {
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
        forceCanonicalUrl: true,
        regenerateQr: true,
      }),
    });

    let json: BatchResponse | null = null;

    try {
      json = (await res.json()) as BatchResponse;
    } catch {
      throw new Error("The repair request failed before returning JSON.");
    }

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Claim QR repair failed.");
    }

    if (!json.result) {
      throw new Error("Claim QR repair response was missing batch results.");
    }

    return json.result;
  }

  async function runRepair() {
    setLoading(true);
    setComplete(false);
    setError(null);
    setLastResult(null);
    setProgress({
      scanned: 0,
      total: 0,
      updated: 0,
      repairedLegacyUrls: 0,
      regeneratedQrs: 0,
      locationsSynced: 0,
      errors: 0,
    });

    try {
      for (const table of TABLES) {
        setCurrentTable(table);

        let offset = 0;
        let done = false;

        while (!done) {
          const result = await runBatch(table, offset);
          setLastResult(result);

          setProgress((prev) => ({
            scanned: prev.scanned + result.scanned,
            total: Math.max(prev.total, prev.scanned + result.scanned + Math.max(result.total - result.nextOffset, 0)),
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
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={runRepair}
        disabled={loading}
        className="rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Repairing old QR codes in batches..." : "Repair old legacy QR codes"}
      </button>

      {(loading || complete || lastResult) && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-white/75">
          {loading && (
            <p className="font-black text-white">
              Processing {currentTable || "claim QR records"}...
            </p>
          )}

          {lastResult && (
            <p>
              Last batch: {lastResult.table} • scanned {lastResult.scanned} of{" "}
              {lastResult.total} • next offset {lastResult.nextOffset}
            </p>
          )}

          <p>
            Total scanned: {progress.scanned} • Updated: {progress.updated} • Legacy URLs repaired:{" "}
            {progress.repairedLegacyUrls} • QR images regenerated: {progress.regeneratedQrs} •
            Locations synced: {progress.locationsSynced} • Errors: {progress.errors}
          </p>

          {complete && (
            <p className="mt-2 font-black text-emerald-200">
              Repair complete. Rerun the SQL audit and scan an old QR to confirm it opens TheOutHaven.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-xs font-bold text-rose-100">
          {error}
        </p>
      )}
    </div>
  );
}
