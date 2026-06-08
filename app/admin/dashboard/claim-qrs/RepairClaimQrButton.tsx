"use client";

import { useState } from "react";

export default function RepairClaimQrButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRepair() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/admin/locations/backfill-qr?force=1&regenerateQr=1",
        { method: "POST" },
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Could not repair claim QR codes.");
      }

      setResult(json?.result || json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not repair claim QR codes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={runRepair}
        disabled={loading}
        className="rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Repairing old QR codes..." : "Repair old roseout QR codes"}
      </button>

      {result && (
        <p className="text-xs leading-5 text-white/70">
          Restaurants updated: {result.restaurants?.updated ?? 0} • Activities updated:{" "}
          {result.activities?.updated ?? 0} • Locations synced:{" "}
          {result.locationsSynced ?? 0} • Locations repaired:{" "}
          {result.locationsEnsured ?? 0} • Legacy URLs repaired:{" "}
          {(result.restaurants?.repairedLegacyUrls ?? 0) +
            (result.activities?.repairedLegacyUrls ?? 0) +
            (result.locationsRepairedLegacyUrls ?? 0)}{" "}
          • QR images regenerated:{" "}
          {(result.restaurants?.regeneratedQrs ?? 0) +
            (result.activities?.regeneratedQrs ?? 0) +
            (result.locationsRegeneratedQrs ?? 0)}{" "}
          • Errors: {result.errors?.length ?? 0}
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-xs font-bold text-rose-100">
          {error}
        </p>
      )}
    </div>
  );
}
